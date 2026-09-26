import type { DeviceProfile } from './types';

/** Fallback for any standard FTMS indoor bike without a dedicated profile. */
export const genericFtmsIndoorBike: DeviceProfile = {
  id: 'ftms-indoor-bike',
  displayName: 'FTMS indoor bike',
  namePrefixes: [],
  matches: () => true,
};
