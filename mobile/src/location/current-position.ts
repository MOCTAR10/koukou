// The phone's current position, behind one small seam (expo-location, SDK 54).
//
// Foreground permission only: the point is taken on site, when the user asks.
// Callers handle every `PositionError` reason with its French message.
import * as Location from 'expo-location';

import { PositionError, withTimeout, type DevicePosition } from '@/poufa/gps';

/** A fix outdoors takes a few seconds; past this the farmer is told why. */
export const POSITION_TIMEOUT_MS = 20_000;

/** Whether the location module ships in this build (the farm card explains when not). */
export const LOCATION_AVAILABLE = true;

/** Device read: permission, location services, then one high-accuracy fix. */
async function readDevicePosition(timeoutMs: number): Promise<DevicePosition> {
  let perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== 'granted' && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw new PositionError('PERMISSION_DENIED');
  if (!(await Location.hasServicesEnabledAsync())) throw new PositionError('SERVICES_OFF');
  // The timeout covers the fix only, never the permission prompt.
  const fix = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), timeoutMs);
  return {
    latitude: fix.coords.latitude,
    longitude: fix.coords.longitude,
    accuracyM: fix.coords.accuracy ?? null,
    capturedAt: new Date(fix.timestamp).toISOString(),
  };
}

/** One fix of the phone's position, or a `PositionError` (French message). */
export async function getCurrentPosition(options: { timeoutMs?: number } = {}): Promise<DevicePosition> {
  try {
    return await readDevicePosition(options.timeoutMs ?? POSITION_TIMEOUT_MS);
  } catch (e) {
    if (e instanceof PositionError) throw e;
    throw new PositionError('UNAVAILABLE');
  }
}
