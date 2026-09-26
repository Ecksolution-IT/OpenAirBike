import { describe, expect, it } from 'vitest';
import type { SessionRepository } from '../src/domain/repositories';
import type { SessionDetail } from '../src/domain/types';
import { createMemoryRepositories } from '../src/persistence/memory/memoryRepositories';
import { exportFileName, sessionToCsv, sessionToJson } from '../src/persistence/export';
import { recoverSession, SessionRecording } from '../src/recording/sessionRecording';
import type { TelemetrySample } from '../src/telemetry/types';
import { formatDuration, formatKm, formatNumber } from '../src/ui/format';

const T0 = Date.UTC(2026, 8, 26, 7, 0, 0);

/** Manual clock and telemetry source for a deterministic ride. */
function ride() {
  let now = T0;
  const clock = () => now;
  const at = (seconds: number) => (now = T0 + seconds * 1000);
  const sample = (seconds: number, powerW: number): TelemetrySample => ({
    at: T0 + seconds * 1000,
    powerW,
    cadenceRpm: 60,
    speedKmh: 25,
    deviceCounters: { distanceM: 1000 + seconds * 7, energyKcal: 50 + seconds / 4 },
  });
  return { clock, at, sample };
}

describe('SessionRecording', () => {
  it('writes samples and events in batches and finishes with a summary', async () => {
    const repos = createMemoryRepositories();
    const { clock, at, sample } = ride();
    const rec = new SessionRecording(repos.sessions, { id: 's1', flushIntervalMs: 0, now: clock });

    for (let s = 0; s <= 4; s++) rec.addSample(sample(s, 200 + s));
    await rec.flush();
    expect((await repos.sessions.get('s1'))?.samples).toHaveLength(5);
    expect(await repos.sessions.listUnfinished()).toHaveLength(1);

    at(4.5);
    rec.pause();
    at(20);
    rec.resume();
    rec.note('link-lost');
    rec.note('device', 'Stopped or Paused by the User');
    for (let s = 20; s <= 22; s++) rec.addSample(sample(s, 300));
    at(22);
    await rec.stop();

    const detail = (await repos.sessions.get('s1'))!;
    expect(detail.session).toMatchObject({ id: 's1', status: 'finished', startedAt: '2026-09-26T07:00:00.000Z', endedAt: '2026-09-26T07:00:22.000Z', activeS: 7 });
    expect(detail.samples.map((s) => s.tMs)).toEqual([0, 1000, 2000, 3000, 4000, 4500, 5500, 6500]);
    expect(detail.events).toEqual([
      { tMs: 4500, kind: 'pause' },
      { tMs: 4500, kind: 'resume' },
      { tMs: 4500, kind: 'link-lost' },
      { tMs: 4500, kind: 'device', detail: 'Stopped or Paused by the User' },
    ]);
    // Movement during the pause (seconds 5–19) is not counted: 4 s × 7 m + 2 s × 7 m.
    expect(detail.session.summary).toMatchObject({ distanceM: 42, maxPowerW: 300 });
    expect(await repos.sessions.listUnfinished()).toEqual([]);
  });

  it('waits for the device to be stored before creating the session', async () => {
    const repos = createMemoryRepositories();
    let storeDevice!: () => void;
    const deviceSaved = new Promise<void>((resolve) => (storeDevice = resolve)).then(() =>
      repos.devices.upsert({ id: 'bike', name: 'ECHO', profileId: 'rogue-echo-bike-v3', simulated: false, firstSeenAt: 'x', lastSeenAt: 'x' }),
    );
    const rec = new SessionRecording(repos.sessions, { id: 's1', deviceId: 'bike', after: deviceSaved, flushIntervalMs: 0 });
    storeDevice();
    await rec.flush();
    expect((await repos.sessions.get('s1'))?.session.device).toEqual({ id: 'bike', name: 'ECHO' });
  });

  it('keeps buffered data when a write fails and retries on the next flush', async () => {
    const repos = createMemoryRepositories();
    let failures = 1;
    const flaky: SessionRepository = {
      ...repos.sessions,
      appendSamples: async (id, samples) => {
        if (failures-- > 0) throw new Error('disk full');
        return repos.sessions.appendSamples(id, samples);
      },
    };
    const errors: unknown[] = [];
    const { clock, sample } = ride();
    const rec = new SessionRecording(flaky, { id: 's1', flushIntervalMs: 0, now: clock, onError: (e) => errors.push(e) });
    rec.addSample(sample(0, 100));
    await expect(rec.flush()).rejects.toThrow('disk full');
    rec.addSample(sample(1, 110));
    await rec.flush();
    expect((await repos.sessions.get('s1'))?.samples.map((s) => s.powerW)).toEqual([100, 110]);
    expect(errors).toHaveLength(1);
  });
});

describe('recoverSession', () => {
  it('finishes an interrupted session from its saved samples', async () => {
    const repos = createMemoryRepositories();
    const { clock, sample } = ride();
    const rec = new SessionRecording(repos.sessions, { id: 's1', flushIntervalMs: 0, now: clock });
    for (let s = 0; s <= 30; s++) rec.addSample(sample(s, 250));
    await rec.flush();
    rec.dispose(); // the app "closes" without stopping

    expect(await recoverSession(repos.sessions, 's1')).toBe(true);
    expect((await repos.sessions.get('s1'))?.session).toMatchObject({
      status: 'recovered',
      activeS: 30,
      endedAt: '2026-09-26T07:00:30.000Z',
      summary: { distanceM: 210, avgPowerW: 250 },
    });
    expect(await recoverSession(repos.sessions, 's1')).toBe(false);
    expect(await recoverSession(repos.sessions, 'unknown')).toBe(false);
  });
});

describe('session export', () => {
  const detail: SessionDetail = {
    session: { id: 'x', status: 'finished', startedAt: '2026-09-26T07:13:00.000Z', activeS: 1, summary: { distanceM: 8.4, energyKcal: 0.4 } },
    samples: [
      { tMs: 0, powerW: 200, cadenceRpm: 60, distanceM: 0, energyKcal: 0 },
      { tMs: 1000, powerW: 400, heartRateBpm: 150, distanceM: 8.4, energyKcal: 0.4 },
    ],
    events: [{ tMs: 500, kind: 'pause' }],
  };

  it('writes CSV with empty cells for missing metrics', () => {
    expect(sessionToCsv(detail)).toBe('tMs,powerW,cadenceRpm,speedKmh,heartRateBpm,distanceM,energyKcal\n0,200,60,,,0,0\n1000,400,,,150,8.4,0.4\n');
  });

  it('writes self-describing JSON', () => {
    expect(JSON.parse(sessionToJson(detail))).toEqual({ format: 'openairbike-session', version: 1, ...detail });
    expect(exportFileName(detail.session.startedAt, 'csv')).toBe('openairbike-2026-09-26T07-13-00-000Z.csv');
  });
});

describe('format', () => {
  it('formats durations, numbers and distances', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(1458)).toBe('24:18');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(undefined)).toBe('--');
    expect(formatNumber(427.6)).toBe('428');
    expect(formatNumber(undefined)).toBe('--');
    expect(formatKm(8400)).toBe('8.40');
    expect(formatKm(123_456)).toBe('123.5');
  });
});
