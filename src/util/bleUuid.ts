/** Bluetooth SIG base UUID helpers, shared by transport and protocol code. */

const BASE_UUID_SUFFIX = '-0000-1000-8000-00805f9b34fb';

/** Expands a 16-bit assigned number to the full 128-bit UUID string used by Web Bluetooth. */
export function uuid16(value: number): string {
  return `0000${value.toString(16).padStart(4, '0')}${BASE_UUID_SUFFIX}`;
}

/** Returns the 16-bit assigned number of a SIG base UUID, or undefined for vendor UUIDs. */
export function shortUuid(uuid: string): number | undefined {
  const lower = uuid.toLowerCase();
  if (!lower.startsWith('0000') || !lower.endsWith(BASE_UUID_SUFFIX)) return undefined;
  return parseInt(lower.slice(4, 8), 16);
}
