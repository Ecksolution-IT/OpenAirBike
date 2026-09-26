import { describe, expect, it } from 'vitest';
import { powerFromCadence, SimulatedBike } from '../src/device/simulator';
import { encodeIndoorBikeData } from '../src/ftms/indoorBikeData';
import { FtmsCharacteristic } from '../src/ftms/uuids';
import { WorkoutRecorder } from '../src/recorder/recorder';
import { TelemetryEngine, STALE_AFTER_MS, type TelemetrySample } from '../src/telemetry/engine';

function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

describe('simulator → parser → telemetry engine → recorder', () => {
  it.each([false, true])('produces complete samples (splitRecords=%s)', (splitRecords) => {
    const bike = new SimulatedBike({ splitRecords, random: seeded() });
    const engine = new TelemetryEngine();
    engine.attach(bike);
    const samples: TelemetrySample[] = [];
    const raw: number[] = [];
    engine.on('sample', (s) => samples.push(s));
    engine.on('raw', (n) => raw.push(n.characteristic));

    for (let i = 0; i < 10; i++) bike.step();

    expect(samples).toHaveLength(10);
    expect(raw).toHaveLength(splitRecords ? 20 : 10);
    for (const s of samples) {
      expect(s.cadenceRpm).toBeGreaterThan(0);
      expect(s.powerW).toBeCloseTo(powerFromCadence(s.cadenceRpm!), -1);
      expect(s.speedKmh).toBeGreaterThan(0);
      expect(s.distanceM).toBeDefined();
      expect(s.energyKcal).toBeDefined();
    }
    expect(samples[9].distanceM!).toBeGreaterThan(samples[0].distanceM!);
  });

  it('records a simulated ride', () => {
    const bike = new SimulatedBike({ random: seeded(7) });
    const engine = new TelemetryEngine();
    engine.attach(bike);
    const recorder = new WorkoutRecorder();
    recorder.start(0);
    engine.on('sample', (s) => recorder.addSample(s));
    for (let i = 0; i < 60; i++) bike.step();
    const w = recorder.stop();
    expect(w.samples.length).toBe(60);
    expect(w.summary.maxPowerW!).toBeGreaterThan(w.summary.avgPowerW!);
    expect(w.summary.distanceM).toBeGreaterThan(0);
  });

  it('dispatches training and machine status', () => {
    const engine = new TelemetryEngine();
    const events: string[] = [];
    engine.on('trainingStatus', (s) => events.push(s.name));
    engine.on('machineStatus', (s) => events.push(s.name));
    const notify = (characteristic: number, bytes: number[]) =>
      engine.handle({ characteristic, value: new DataView(Uint8Array.from(bytes).buffer), receivedAt: 0 });
    notify(FtmsCharacteristic.TrainingStatus, [0x00, 0x01]);
    notify(FtmsCharacteristic.FitnessMachineStatus, [0x04]);
    expect(events).toEqual(['Idle', 'Started or Resumed by the User']);
  });

  it('reports stale data as unavailable', () => {
    const engine = new TelemetryEngine();
    const bytes = encodeIndoorBikeData({ moreData: false, instantaneousSpeedKmh: 20 });
    engine.handle({ characteristic: FtmsCharacteristic.IndoorBikeData, value: new DataView(bytes.buffer), receivedAt: 1000 });
    expect(engine.current(1000 + STALE_AFTER_MS)?.speedKmh).toBe(20);
    expect(engine.current(1001 + STALE_AFTER_MS)).toBeUndefined();
    expect(engine.latest?.speedKmh).toBe(20);
  });
});
