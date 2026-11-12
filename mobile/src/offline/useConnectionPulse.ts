import { useSyncExternalStore } from 'react';

import { useOfflineQueue } from './index';
import { connectivity } from './connectivity';
import { isJustSynced, isSyncing, pulseState, pulseVersion, subscribePulse, type PulseState } from './pulse';

/** Connection + queue + sync state of the indicator (web `pulseState` wording). */
export function useConnectionPulse(farmId: string): PulseState {
  const online = useSyncExternalStore(connectivity.subscribe, connectivity.isOnline, connectivity.isOnline);
  useSyncExternalStore(subscribePulse, pulseVersion, pulseVersion);
  const { pending } = useOfflineQueue(farmId);
  return pulseState(online, pending.length, isSyncing(), isJustSynced());
}
