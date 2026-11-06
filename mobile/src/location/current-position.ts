// The phone's current position, behind one small seam.
//
// `expo-location` (SDK 54: ~19.0.8) is not installed yet. Once it is, only
// `readDevicePosition` changes (permission, location services, then one
// high-accuracy fix under `withTimeout`); callers already handle every
// `PositionError` reason with its French message.
import { PositionError, type DevicePosition } from '@/poufa/gps';

/** A fix outdoors takes a few seconds; past this the farmer is told why. */
export const POSITION_TIMEOUT_MS = 20_000;

/** Whether the location module ships in this build (the farm card explains when not). */
export const LOCATION_AVAILABLE = false;

/** Device read: permission, location services, then one high-accuracy fix. */
async function readDevicePosition(_timeoutMs: number): Promise<DevicePosition> {
  throw new PositionError('NOT_INSTALLED');
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
