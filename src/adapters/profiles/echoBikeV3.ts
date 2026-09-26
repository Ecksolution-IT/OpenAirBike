import type { DeviceProfile } from './types';

/**
 * Rogue Echo Bike V3 — first target device. See docs/research/echo-bike-v3.md.
 *
 * Assumptions (not yet verified with a capture): the advertised name contains "Echo" or
 * "Rogue"; the bike behaves as a standard FTMS indoor bike, so no overrides are needed yet.
 */
export const echoBikeV3: DeviceProfile = {
  id: 'rogue-echo-bike-v3',
  displayName: 'Rogue Echo Bike V3',
  namePrefixes: ['Echo', 'ECHO', 'Rogue', 'ROGUE'],
  matches: ({ name, model, manufacturer }) => /echo|rogue/i.test([name, model, manufacturer].filter(Boolean).join(' ')),
};
