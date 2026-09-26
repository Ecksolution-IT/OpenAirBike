import { FtmsIndoorBikeAdapter, ftmsIndoorBikeFilter } from '../adapters/ftms-indoor-bike/adapter';
import type { DeviceAdapter, DeviceInfo } from '../adapters/types';
import type { WorkoutStore } from '../persistence/indexeddb/workoutStore';
import { toHex } from '../protocol/ftms/bytes';
import { uuidName } from '../protocol/ftms/uuids';
import { WorkoutRecorder } from '../recording/recorder';
import type { Workout } from '../recording/workout';
import { TelemetryStream } from '../telemetry/stream';
import { SimulatedTransport } from '../transport/simulated/simulator';
import type { ConnectionState, GattNotification, Transport } from '../transport/types';
import { findPermittedDevice, isWebBluetoothAvailable, requestDevice, WebBluetoothTransport } from '../transport/webBluetooth';
import { Emitter } from '../util/emitter';
import { ScreenWakeLock } from '../util/wakeLock';

export type { ConnectionState };

const LAST_BIKE_KEY = 'lastBike';
const DRAFT_INTERVAL_MS = 15_000;
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
  private _recorder: WorkoutRecorder | undefined;
  private draftTimer: ReturnType<typeof setInterval> | undefined;
  private readonly wakeLock = new ScreenWakeLock();
  private _rememberedBike: RememberedBike | undefined;

  constructor(readonly store: WorkoutStore) {
    super();
    this.telemetry.on('sample', (s) => {
      this._recorder?.addSample(s);
      this.emit('change', undefined);
    });
  }

  async init(): Promise<void> {
    this._rememberedBike = await this.store.getMeta<RememberedBike>(LAST_BIKE_KEY);
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
    const offs = [
      transport.on('notification', (n) => this.capturePacket(n)),
      adapter.on('sample', (s) => this.telemetry.push(s)),
      adapter.on('state', (state) => {
        this.addLog(`Connection: ${state}`);
        this.emit('change', undefined);
      }),
      adapter.on('log', (line) => this.addLog(line)),
      adapter.on('info', (info) => {
        if (!info.simulated) void this.rememberBike({ id: info.id, name: info.name });
        this.emit('change', undefined);
      }),
      adapter.on('deviceEvent', (e) => {
        this.addLog(`Device: ${e.label}`);
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
    await this.store.setMeta(LAST_BIKE_KEY, bike).catch(() => undefined);
  }

  // ── Workout ────────────────────────────────────────────────────────────────

  get recorder(): WorkoutRecorder | undefined {
    return this._recorder;
  }

  startWorkout(): void {
    if (this._recorder && this._recorder.state !== 'finished') return;
    const info = this.bikeInfo;
    this._recorder = new WorkoutRecorder(
      info && {
        name: info.name,
        manufacturer: info.manufacturer,
        model: info.model,
        firmware: info.firmware,
        simulated: info.simulated,
      },
    );
    this._recorder.start();
    this.draftTimer = setInterval(() => void this.saveDraft(), DRAFT_INTERVAL_MS);
    void this.wakeLock.enable();
    this.addLog('Workout started.');
  }

  pauseWorkout(): void {
    if (this._recorder?.state !== 'recording') return;
    this._recorder.pause();
    this.addLog('Workout paused.');
  }

  resumeWorkout(): void {
    if (this._recorder?.state !== 'paused') return;
    this._recorder.resume();
    this.addLog('Workout resumed.');
  }

  /** Stops the workout and saves it locally. */
  async finishWorkout(): Promise<Workout> {
    const recorder = this._recorder;
    if (!recorder) throw new Error('No workout in progress.');
    clearInterval(this.draftTimer);
    const workout = recorder.stop();
    this._recorder = undefined;
    void this.wakeLock.disable();
    try {
      await this.store.save(workout);
    } catch (err) {
      // Keep the finished workout as a draft so it can still be recovered on the next start.
      await this.store.saveDraft(workout).catch(() => undefined);
      throw err;
    }
    await this.store.clearDraft();
    this.addLog('Workout saved.');
    return workout;
  }

  private async saveDraft() {
    if (!this._recorder || this._recorder.state === 'finished') return;
    await this.store.saveDraft(this._recorder.toWorkout()).catch((err) => this.addLog(`Draft not saved: ${err}`));
  }

  /** A workout that was still running when the app was closed, if any. */
  async pendingDraft(): Promise<Workout | undefined> {
    // While recording, the draft is the current workout's own autosave.
    return this._recorder ? undefined : this.store.loadDraft();
  }

  async recoverDraft(): Promise<Workout | undefined> {
    const draft = await this.store.loadDraft();
    if (!draft) return undefined;
    const workout = { ...draft, recovered: true };
    await this.store.save(workout);
    await this.store.clearDraft();
    return workout;
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
