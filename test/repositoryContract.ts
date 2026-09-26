import { beforeEach, describe, expect, it } from 'vitest';
import { RepositoryError, type Repositories } from '../src/domain/repositories';
import type { Device, Sample, SessionSummary } from '../src/domain/types';

/**
 * Contract every Repositories implementation must satisfy (decision D1: storage is replaceable).
 * Call from a *.test.ts file with a factory that returns fresh, empty repositories.
 */
export function repositoryContract(name: string, create: () => Promise<Repositories>): void {
  describe(`Repositories contract: ${name}`, () => {
    let repos: Repositories;
    beforeEach(async () => {
      repos = await create();
    });

    const echo: Device = {
      id: 'dev-1',
      name: 'ECHO-4711',
      profileId: 'rogue-echo-bike-v3',
      manufacturer: 'Rogue',
      simulated: false,
      firstSeenAt: '2026-09-20T10:00:00.000Z',
      lastSeenAt: '2026-09-20T10:00:00.000Z',
    };

    const summary: SessionSummary = {
      distanceM: 8400.5,
      energyKcal: 241.3,
      avgPowerW: 186.25,
      maxPowerW: 612,
      avgCadenceRpm: 58,
      maxCadenceRpm: 91,
      avgSpeedKmh: 20.75,
      maxSpeedKmh: 41.2,
    };

    const sample = (tMs: number, extra: Partial<Sample> = {}): Sample => ({
      tMs,
      powerW: 200,
      cadenceRpm: 60.5,
      speedKmh: 25.25,
      distanceM: tMs / 100,
      energyKcal: tMs / 4000,
      ...extra,
    });

    describe('devices', () => {
      it('inserts, updates and keeps firstSeenAt', async () => {
        expect(await repos.devices.get('dev-1')).toBeUndefined();
        await repos.devices.upsert(echo);
        expect(await repos.devices.get('dev-1')).toEqual(echo);

        await repos.devices.upsert({ ...echo, name: 'ECHO-NEW', firmware: '1.2', firstSeenAt: '2026-09-26T00:00:00.000Z', lastSeenAt: '2026-09-26T00:00:00.000Z' });
        expect(await repos.devices.get('dev-1')).toEqual({
          ...echo,
          name: 'ECHO-NEW',
          firmware: '1.2',
          lastSeenAt: '2026-09-26T00:00:00.000Z',
        });
        expect(await repos.devices.list()).toHaveLength(1);
      });
    });

    describe('sessions', () => {
      it('starts a recording session linked to a device', async () => {
        await repos.devices.upsert(echo);
        await repos.sessions.start({ id: 's1', startedAt: '2026-09-26T07:00:00.000Z', deviceId: 'dev-1' });

        const expected = { id: 's1', status: 'recording', startedAt: '2026-09-26T07:00:00.000Z', activeS: 0, device: { id: 'dev-1', name: 'ECHO-4711' } };
        expect(await repos.sessions.list()).toEqual([expected]);
        expect(await repos.sessions.listUnfinished()).toEqual([expected]);
        expect(await repos.sessions.get('s1')).toEqual({ session: expected, samples: [], events: [] });
      });

      it('appends samples in batches, ordered and without duplicates', async () => {
        await repos.sessions.start({ id: 's1', startedAt: '2026-09-26T07:00:00.000Z' });
        await repos.sessions.appendSamples('s1', [sample(2000), sample(1000)]);
        await repos.sessions.appendSamples('s1', [sample(2000, { powerW: 999 }), sample(3000, { powerW: undefined, heartRateBpm: 148 })]);

        const detail = await repos.sessions.get('s1');
        expect(detail?.samples).toEqual([sample(1000), sample(2000), sample(3000, { powerW: undefined, heartRateBpm: 148 })]);
      });

      it('keeps events in order across batches', async () => {
        await repos.sessions.start({ id: 's1', startedAt: '2026-09-26T07:00:00.000Z' });
        await repos.sessions.appendEvents('s1', [{ tMs: 5000, kind: 'pause' }]);
        await repos.sessions.appendEvents('s1', [
          { tMs: 5000, kind: 'resume' },
          { tMs: 9000, kind: 'device', detail: 'Stopped or Paused by the User' },
        ]);
        expect((await repos.sessions.get('s1'))?.events).toEqual([
          { tMs: 5000, kind: 'pause' },
          { tMs: 5000, kind: 'resume' },
          { tMs: 9000, kind: 'device', detail: 'Stopped or Paused by the User' },
        ]);
      });

      it('finishes with a summary and then rejects further writes', async () => {
        await repos.sessions.start({ id: 's1', startedAt: '2026-09-26T07:00:00.000Z' });
        await repos.sessions.appendSamples('s1', [sample(1000)]);
        await repos.sessions.finish('s1', { status: 'finished', endedAt: '2026-09-26T07:24:18.000Z', activeS: 1458, summary });

        expect((await repos.sessions.get('s1'))?.session).toEqual({
          id: 's1',
          status: 'finished',
          startedAt: '2026-09-26T07:00:00.000Z',
          endedAt: '2026-09-26T07:24:18.000Z',
          activeS: 1458,
          summary,
        });
        expect(await repos.sessions.listUnfinished()).toEqual([]);
        await expect(repos.sessions.appendSamples('s1', [sample(2000)])).rejects.toBeInstanceOf(RepositoryError);
        await expect(repos.sessions.appendEvents('s1', [{ tMs: 1, kind: 'pause' }])).rejects.toBeInstanceOf(RepositoryError);
        await expect(repos.sessions.finish('s1', { status: 'finished', endedAt: 'x', activeS: 1, summary })).rejects.toBeInstanceOf(RepositoryError);
      });

      it('marks recovered sessions', async () => {
        await repos.sessions.start({ id: 's1', startedAt: '2026-09-26T07:00:00.000Z' });
        await repos.sessions.finish('s1', { status: 'recovered', endedAt: '2026-09-26T07:10:00.000Z', activeS: 600, summary: { distanceM: 0, energyKcal: 0 } });
        expect((await repos.sessions.get('s1'))?.session).toMatchObject({ status: 'recovered', summary: { distanceM: 0, energyKcal: 0 } });
      });

      it('rejects unknown devices, unknown sessions and duplicate ids', async () => {
        await expect(repos.sessions.start({ id: 's1', startedAt: '2026-09-26T07:00:00.000Z', deviceId: 'nope' })).rejects.toBeInstanceOf(RepositoryError);
        await expect(repos.sessions.appendSamples('nope', [sample(1)])).rejects.toBeInstanceOf(RepositoryError);
        await repos.sessions.start({ id: 's1', startedAt: '2026-09-26T07:00:00.000Z' });
        await expect(repos.sessions.start({ id: 's1', startedAt: '2026-09-26T08:00:00.000Z' })).rejects.toBeInstanceOf(RepositoryError);
        expect(await repos.sessions.get('nope')).toBeUndefined();
      });

      it('lists newest first and deletes with samples and events', async () => {
        await repos.devices.upsert(echo);
        await repos.sessions.start({ id: 'old', startedAt: '2026-09-24T07:00:00.000Z', deviceId: 'dev-1' });
        await repos.sessions.start({ id: 'new', startedAt: '2026-09-26T07:00:00.000Z' });
        await repos.sessions.start({ id: 'mid', startedAt: '2026-09-25T07:00:00.000Z' });
        expect((await repos.sessions.list()).map((s) => s.id)).toEqual(['new', 'mid', 'old']);

        await repos.sessions.appendSamples('old', [sample(1000)]);
        await repos.sessions.appendEvents('old', [{ tMs: 1000, kind: 'pause' }]);
        await repos.sessions.delete('old');
        expect(await repos.sessions.get('old')).toBeUndefined();
        expect((await repos.sessions.list()).map((s) => s.id)).toEqual(['new', 'mid']);
        expect(await repos.devices.get('dev-1')).toEqual(echo);

        // The id can be reused after deletion (no orphaned samples left behind).
        await repos.sessions.start({ id: 'old', startedAt: '2026-09-24T07:00:00.000Z' });
        expect((await repos.sessions.get('old'))?.samples).toEqual([]);
      });
    });

    describe('settings', () => {
      it('stores JSON values', async () => {
        expect(await repos.settings.get('lastBike')).toBeUndefined();
        await repos.settings.set('lastBike', { id: 'dev-1', name: 'ECHO-4711' });
        await repos.settings.set('units', 'metric');
        await repos.settings.set('lastBike', { id: 'dev-2', name: 'Other' });
        expect(await repos.settings.get('lastBike')).toEqual({ id: 'dev-2', name: 'Other' });
        expect(await repos.settings.get('units')).toBe('metric');
      });
    });
  });
}
