import { useSyncExternalStore } from 'react';

import { useOfflineQueue } from './index';
import { connectivity } from './connectivity';
import { pulseFlags, pulseState, subscribePulse, type PulseState } from './pulse';

/** Connection + queue + sync state of the indicator (web `pulseState` wording). */
export function useConnectionPulse(farmId: string): PulseState {
  const online = useSyncExternalStore(connectivity.subscribe, connectivity.isOnline, connectivity.isOnline);
  // The flags come from the subscription itself, not from module state read during render:
  // the label cannot stay on a stale value when only they change.
  const flags = useSyncExternalStore(subscribePulse, pulseFlags, pulseFlags);
  const { pending } = useOfflineQueue(farmId);
  return pulseState(online, pending.length, (flags & 1) !== 0, (flags & 2) !== 0);
}
