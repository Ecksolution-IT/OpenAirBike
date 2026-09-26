import { FtmsIndoorBikeAdapter, ftmsIndoorBikeFilter } from '../adapters/ftms-indoor-bike/adapter';
import type { DeviceAdapter, DeviceInfo } from '../adapters/types';
import type { Repositories } from '../domain/repositories';
import type { Device, SessionDetail, Session } from '../domain/types';
import { toHex } from '../protocol/ftms/bytes';
import { uuidName } from '../protocol/ftms/uuids';
import type { WorkoutRecorder } from '../recording/recorder';
import { recoverSession, SessionRecording } from '../recording/sessionRecording';
import { TelemetryStream } from '../telemetry/stream';
import { SimulatedTransport } from '../transport/simulated/simulator';
import type { ConnectionState, GattNotification, Transport } from '../transport/types';
import { findPermittedDevice, isWebBluetoothAvailable, requestDevice, WebBluetoothTransport } from '../transport/webBluetooth';
import { Emitter } from '../util/emitter';
import { ScreenWakeLock } from '../util/wakeLock';

export type { ConnectionState };

const LAST_BIKE_KEY = 'lastBike';
const MAX_LOG_LINES = 200;
const MAX_CAPTURED_PACKETS = 20_000;

export interface CapturedPacket {
  receivedAt: number;
  characteristic: string;
  hex: string;
}

export interface RememberedBike {
  id: string;
  name: string;
}

export type AppEvents = {
  /** Something the UI shows has changed. */
  change: void;
};

/**
 * Application layer: wires Transport → Device Adapter → Canonical Telemetry → Recording →
 * Persistence and offers use cases to the UI. Only this class knows concrete implementations.
 */
export class App extends Emitter<AppEvents> {
  readonly telemetry = new TelemetryStream();
  readonly log: string[] = [];
  readonly capture: CapturedPacket[] = [];

  private adapter: DeviceAdapter | undefined;
  private detachDevice: (() => void) | undefined;
  private recording: SessionRecording | undefined;
  /** Resolves once the connected device is stored, so sessions can refer to it. */
  private deviceSaved: Promise<unknown> = Promise.resolve();
  private readonly wakeLock = new ScreenWakeLock();
  private _rememberedBike: RememberedBike | undefined;

  constructor(
    private readonly repositories: Repositories,
    private readonly database?: { exportDatabase(): Promise<Uint8Array> },
  ) {
    super();
    this.telemetry.on('sample', (s) => {
      this.recording?.addSample(s);
      this.emit('change', undefined);
    });
    // Write buffered samples as soon as the page is hidden (tab switch, app close on mobile).
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void this.recording?.flush().catch(() => undefined);
      });
    }
  }

  async init(): Promise<void> {
    this._rememberedBike = await this.repositories.settings.get<RememberedBike>(LAST_BIKE_KEY);
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  get connectionState(): ConnectionState {
    return this.adapter?.state ?? 'disconnected';
  }

  get bikeInfo(): DeviceInfo | undefined {
    return this.adapter?.info;
  }

  /** Whether this browser can talk to Bluetooth devices at all. */
  get bluetoothAvailable(): boolean {
    return isWebBluetoothAvailable();
  }

  get rememberedBike(): RememberedBike | undefined {
    return this._rememberedBike;
  }

  /** Protocol conformance checks of the connected device, for Diagnostics. */
  diagnostics() {
    return this.adapter?.diagnostics() ?? [];
  }

  /** Opens the browser's Bluetooth chooser. Call from a click handler. */
  async connectBluetooth(): Promise<void> {
    const device = await requestDevice(ftmsIndoorBikeFilter());
    await this.use(new WebBluetoothTransport(device));
  }

  /** Reconnects to the last bike without the chooser, where the browser allows it. */
  async reconnectRemembered(): Promise<boolean> {
    if (!this._rememberedBike) return false;
    const device = await findPermittedDevice(this._rememberedBike.id);
    if (!device) return false;
    await this.use(new WebBluetoothTransport(device));
    return true;
  }

  async connectSimulator(): Promise<void> {
    await this.use(new SimulatedTransport(), true);
  }

  async disconnect(): Promise<void> {
    await this.adapter?.disconnect();
    this.detachDevice?.();
    this.adapter = undefined;
    this.emit('change', undefined);
  }

  private async use(transport: Transport, simulated = false): Promise<void> {
    await this.disconnect();
    const adapter = new FtmsIndoorBikeAdapter(transport, { simulated });
    this.adapter = adapter;
    let wasReconnecting = false;
    const offs = [
      transport.on('notification', (n) => this.capturePacket(n)),
      adapter.on('sample', (s) => this.telemetry.push(s)),
      adapter.on('state', (state) => {
        if (state === 'reconnecting') this.recording?.note('link-lost');
        if (state === 'connected' && wasReconnecting) this.recording?.note('link-restored');
        wasReconnecting = state === 'reconnecting';
        this.addLog(`Connection: ${state}`);
        this.emit('change', undefined);
      }),
      adapter.on('log', (line) => this.addLog(line)),
      adapter.on('info', (info) => {
        this.deviceSaved = this.saveDevice(info);
        if (!info.simulated) void this.rememberBike({ id: info.id, name: info.name });
        this.emit('change', undefined);
      }),
      adapter.on('deviceEvent', (e) => {
        this.addLog(`Device: ${e.label}`);
        this.recording?.note('device', e.label);
        // Follow the console's pause button, so pedalling to restart does not need the screen.
        if (e.kind === 'paused' || e.kind === 'stopped') this.pauseWorkout();
        if (e.kind === 'started') this.resumeWorkout();
      }),
    ];
    this.detachDevice = () => offs.forEach((off) => off());
    try {
      await adapter.connect();
    } catch (err) {
      this.addLog(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
      this.detachDevice();
      this.adapter = undefined;
      this.emit('change', undefined);
      throw err;
    }
  }

  private async rememberBike(bike: RememberedBike) {
    this._rememberedBike = bike;
    await this.repositories.settings.set(LAST_BIKE_KEY, bike).catch(() => undefined);
  }

  private async saveDevice(info: DeviceInfo): Promise<void> {
    const now = new Date().toISOString();
    const device: Device = {
      id: info.id,
      name: info.name,
      profileId: info.profileId,
      manufacturer: info.manufacturer,
      model: info.model,
      firmware: info.firmware,
      simulated: info.simulated ?? false,
      firstSeenAt: now,
      lastSeenAt: now,
    };
    await this.repositories.devices.upsert(device).catch((err) => this.addLog(`Device not saved: ${String(err)}`));
  }

  // ── Workout ────────────────────────────────────────────────────────────────

  /** The live recorder of the running session, for the training screen. */
  get recorder(): WorkoutRecorder | undefined {
    return this.recording?.recorder;
  }

  startWorkout(): void {
    if (this.recording) return;
    this.recording = new SessionRecording(this.repositories.sessions, {
      deviceId: this.bikeInfo?.id,
      after: this.deviceSaved,
      onError: (err) => this.addLog(`Saving failed, will retry: ${String(err)}`),
    });
    void this.wakeLock.enable();
    this.addLog('Workout started.');
  }

  pauseWorkout(): void {
    if (this.recording?.state !== 'recording') return;
    this.recording.pause();
    this.addLog('Workout paused.');
  }

  resumeWorkout(): void {
    if (this.recording?.state !== 'paused') return;
    this.recording.resume();
    this.addLog('Workout resumed.');
  }

  /** Stops the workout and saves it. Returns the session id. */
  async finishWorkout(): Promise<string> {
    const recording = this.recording;
    if (!recording) throw new Error('No workout in progress.');
    this.recording = undefined;
    void this.wakeLock.disable();
    // If this fails, the session stays "recording" with its saved samples and can be recovered.
    await recording.stop();
    this.addLog('Workout saved.');
    return recording.id;
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  listSessions(): Promise<Session[]> {
    return this.repositories.sessions.list();
  }

  getSession(id: string): Promise<SessionDetail | undefined> {
    return this.repositories.sessions.get(id);
  }

  deleteSession(id: string): Promise<void> {
    return this.repositories.sessions.delete(id);
  }

  /** Sessions interrupted while recording (app closed), excluding the one running now. */
  async unfinishedSessions(): Promise<Session[]> {
    return (await this.repositories.sessions.listUnfinished()).filter((s) => s.id !== this.recording?.id);
  }

  /** Finishes an interrupted session from its saved samples. */
  recoverSession(id: string): Promise<boolean> {
    return recoverSession(this.repositories.sessions, id);
  }

  /** The whole database as a standard SQLite file, if the storage supports it. */
  exportDatabase(): Promise<Uint8Array> {
    if (!this.database) return Promise.reject(new Error('Database export is not available.'));
    return this.database.exportDatabase();
  }

  // ── Diagnostics ────────────────────────────────────────────────────────────

  private addLog(line: string) {
    const time = new Date().toLocaleTimeString();
    this.log.push(`${time}  ${line}`);
    if (this.log.length > MAX_LOG_LINES) this.log.splice(0, this.log.length - MAX_LOG_LINES);
    this.emit('change', undefined);
  }

  private capturePacket(n: GattNotification) {
    this.capture.push({ receivedAt: n.receivedAt, characteristic: uuidName(n.characteristic), hex: toHex(n.value) });
    if (this.capture.length > MAX_CAPTURED_PACKETS) this.capture.splice(0, this.capture.length - MAX_CAPTURED_PACKETS);
  }

  /** Everything needed to analyse how a bike talks FTMS, as a shareable JSON document. */
  captureReport(): string {
    return JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        bike: this.bikeInfo,
        diagnostics: this.diagnostics(),
        log: this.log,
        packets: this.capture,
      },
      null,
      2,
    );
  }
}
