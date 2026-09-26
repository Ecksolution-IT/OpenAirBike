import { echoBikeV3 } from './echoBikeV3';
import { genericFtmsIndoorBike } from './genericFtmsIndoorBike';
import type { DeviceProfile } from './types';

export type { DeviceProfile } from './types';

/** Specific profiles first; the generic profile matches everything and comes last. */
export const PROFILES: readonly DeviceProfile[] = [echoBikeV3, genericFtmsIndoorBike];

export function resolveProfile(device: { name?: string; model?: string; manufacturer?: string }): DeviceProfile {
  return PROFILES.find((p) => p.matches(device)) ?? genericFtmsIndoorBike;
}
