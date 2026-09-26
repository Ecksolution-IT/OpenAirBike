/**
 * A device profile describes one concrete device model as *data*: how to find it and, when a
 * device deviates from its protocol, the overrides needed. Profiles never contain protocol
 * code, so a new device usually means a new profile file, not new logic.
 */
export interface DeviceProfile {
  id: string;
  displayName: string;
  /** Advertised name prefixes offered in the device chooser, in addition to the service filter. */
  namePrefixes: string[];
  /** Whether a connected device is this model (by advertised name and Device Information). */
  matches(device: { name?: string; model?: string; manufacturer?: string }): boolean;
}
