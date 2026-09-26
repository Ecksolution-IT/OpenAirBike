import { SimulatedBike } from './device/simulator';
import type { BikeConnection, BikeInfo, ConnectionState, Notification } from './device/types';
import { findPermittedBike, requestBike, WebBluetoothBike } from './device/webBluetooth';
import { toHex } from './ftms/bytes';
import { ConformanceMonitor } from './ftms/conformance';
import { MachineStatusOpCode } from './ftms/machineInfo';
import { FtmsCharacteristic, uuidName } from './ftms/uuids';
import { WorkoutRecorder } from './recorder/recorder';
import type { Workout } from './recorder/workout';
import type { WorkoutStore } from './storage/workoutStore';
import { TelemetryEngine } from './telemetry/engine';
import { Emitter } from './util/emitter';
import { ScreenWakeLock } from './util/wakeLock';

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
 * Wires the layers together: Device Layer → Telemetry Engine → Recorder → Local Storage.
 * The UI only talks to this class.
 */
export class App extends Emitter<AppEvents> {
  readonly engine = new TelemetryEngine();
  readonly log: string[] = [];
  readonly capture: CapturedPacket[] = [];
  /** Checks the bike's FTMS behaviour against the SIG test suite, see src/ftms/conformance.ts. */
  readonly conformance = new ConformanceMonitor();

  private connection: BikeConnection | undefined;
  private detachConnection: (() => void) | undefined;
  private _recorder: WorkoutRecorder | undefined;
  private draftTimer: ReturnType<typeof setInterval> | undefined;
  private readonly wakeLock = new ScreenWakeLock();
  private _rememberedBike: RememberedBike | undefined;

  constructor(readonly store: WorkoutStore) {
    super();
    this.engine.on('raw', (n) => {
      this.capturePacket(n);
      if (n.characteristic === FtmsCharacteristic.IndoorBikeData) this.conformance.onIndoorBikeData(n.value);
    });
    this.engine.on('sample', (s) => {
      this._recorder?.addSample(s);
      this.emit('change', undefined);
    });
    this.engine.on('trainingStatus', (s) => this.addLog(`Training status: ${s.name}${s.text ? ` (${s.text})` : ''}`));
    this.engine.on('machineStatus', (s) => {
      this.addLog(`Machine status: ${s.name}${s.stopOrPause ? ` (${s.stopOrPause})` : ''}`);
      // Follow the console's pause button, so pedalling to restart does not need the screen.
      if (s.opCode === MachineStatusOpCode.StoppedOrPausedByUser) this.pauseWorkout();
      if (s.opCode === MachineStatusOpCode.StartedOrResumedByUser) this.resumeWorkout();
    });
  }

  async init(): Promise<void> {
    this._rememberedBike = await this.store.getMeta<RememberedBike>(LAST_BIKE_KEY);
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  get connectionState(): ConnectionState {
    return this.connection?.state ?? 'disconnected';
  }

  get bikeInfo(): BikeInfo | undefined {
    return this.connection?.info;
  }

  get rememberedBike(): RememberedBike | undefined {
    return this._rememberedBike;
  }

  /** Opens the browser's Bluetooth chooser. Call from a click handler. */
  async connectBluetooth(): Promise<void> {
    const device = await requestBike();
    await this.use(new WebBluetoothBike(device));
  }

  /** Reconnects to the last bike without the chooser, where the browser allows it. */
  async reconnectRemembered(): Promise<boolean> {
    if (!this._rememberedBike) return false;
    const device = await findPermittedBike(this._rememberedBike.id);
    if (!device) return false;
    await this.use(new WebBluetoothBike(device));
    return true;
  }

  async connectSimulator(): Promise<void> {
    await this.use(new SimulatedBike());
  }

  async disconnect(): Promise<void> {
    await this.connection?.disconnect();
    this.detachConnection?.();
    this.connection = undefined;
    this.emit('change', undefined);
  }

  private async use(connection: BikeConnection): Promise<void> {
    await this.disconnect();
    this.connection = connection;
    this.conformance.reset();
    const offs = [
      this.engine.attach(connection),
      connection.on('state', (state) => {
        if (state === 'reconnecting') this.conformance.onLinkLoss();
        this.addLog(`Connection: ${state}`);
        this.emit('change', undefined);
      }),
      connection.on('log', (line) => this.addLog(line)),
      connection.on('info', (info) => {
        this.conformance.setDevice(info);
        if (!info.simulated) void this.rememberBike({ id: info.id, name: info.name });
        this.emit('change', undefined);
      }),
    ];
    this.detachConnection = () => offs.forEach((off) => off());
    try {
      await connection.connect();
    } catch (err) {
      this.addLog(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
      this.detachConnection();
      this.connection = undefined;
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

  private capturePacket(n: Notification) {
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
        conformance: this.conformance.report(),
        log: this.log,
        packets: this.capture,
      },
      null,
      2,
    );
  }
}
