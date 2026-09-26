import { describe, expect, it } from 'vitest';
import { FtmsIndoorBikeAdapter } from '../src/adapters/ftms-indoor-bike/adapter';
import { WorkoutRecorder } from '../src/recording/recorder';
import { STALE_AFTER_MS, TelemetryStream } from '../src/telemetry/stream';
import type { TelemetrySample } from '../src/telemetry/types';
import { powerFromCadence, SimulatedTransport } from '../src/transport/simulated/simulator';

function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

async function connectedSimulator(options: { splitRecords?: boolean; seed?: number } = {}) {
  const transport = new SimulatedTransport({ autoRun: false, splitRecords: options.splitRecords, random: seeded(options.seed) });
  const adapter = new FtmsIndoorBikeAdapter(transport, { simulated: true });
  await adapter.connect();
  return { transport, adapter };
}

describe('simulated transport → FTMS adapter → canonical telemetry → recording', () => {
  it.each([false, true])('produces complete canonical samples (splitRecords=%s)', async (splitRecords) => {
    const { transport, adapter } = await connectedSimulator({ splitRecords });
    const samples: TelemetrySample[] = [];
    let notifications = 0;
    adapter.on('sample', (s) => samples.push(s));
    transport.on('notification', () => notifications++);

    for (let i = 0; i < 10; i++) transport.step();

    expect(samples).toHaveLength(10);
    expect(notifications).toBe(splitRecords ? 20 : 10);
    for (const s of samples) {
      expect(s.cadenceRpm).toBeGreaterThan(0);
      expect(s.powerW).toBeCloseTo(powerFromCadence(s.cadenceRpm!), -1);
      expect(s.speedKmh).toBeGreaterThan(0);
      expect(s.deviceCounters.distanceM).toBeDefined();
      expect(s.deviceCounters.energyKcal).toBeDefined();
    }
    expect(samples[9].deviceCounters.distanceM!).toBeGreaterThan(samples[0].deviceCounters.distanceM!);
  });

  it('describes the device through the adapter', async () => {
    const { adapter } = await connectedSimulator();
    expect(adapter.state).toBe('connected');
    expect(adapter.info).toMatchObject({
      id: 'simulator',
      profileId: 'ftms-indoor-bike',
      manufacturer: 'OpenAirBike',
      model: 'Simulator',
      simulated: true,
      capabilities: ['speed', 'power', 'cadence', 'distance', 'energy', 'elapsedTime'],
    });
  });

  it('records a simulated ride', async () => {
    const { transport, adapter } = await connectedSimulator({ seed: 7 });
    const stream = new TelemetryStream();
    adapter.on('sample', (s) => stream.push(s));
    const recorder = new WorkoutRecorder();
    recorder.start(0);
    stream.on('sample', (s) => recorder.addSample(s));
    for (let i = 0; i < 60; i++) transport.step();
    const w = recorder.stop();
    expect(w.samples.length).toBe(60);
    expect(w.summary.maxPowerW!).toBeGreaterThan(w.summary.avgPowerW!);
    expect(w.summary.distanceM).toBeGreaterThan(0);
  });

  it('feeds the conformance checks from the live data', async () => {
    const { transport, adapter } = await connectedSimulator();
    for (let i = 0; i < 12; i++) transport.step();
    const report = adapter.diagnostics();
    expect(report.find((c) => c.title === 'Complete Data Records')?.status).toBe('pass');
    expect(report.filter((c) => c.status === 'fail')).toEqual([]);
  });
});

describe('TelemetryStream', () => {
  it('reports stale data as unavailable', () => {
    const stream = new TelemetryStream();
    stream.push({ at: 1000, speedKmh: 20, deviceCounters: {} });
    expect(stream.current(1000 + STALE_AFTER_MS)?.speedKmh).toBe(20);
    expect(stream.current(1001 + STALE_AFTER_MS)).toBeUndefined();
    expect(stream.latest?.speedKmh).toBe(20);
  });
});
