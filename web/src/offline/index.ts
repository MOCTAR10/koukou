import { useSyncExternalStore } from 'react';
import { getStoredUser } from '../api/client';
import { isOnline, subscribeConnectivity } from './connectivity';
import { getQueueVersion, loadOps, loadRejected, subscribeQueue, type OfflineOp, type RejectedOp } from './store';

export { CaisseClosedSinceError, ensureCashOpen, flushQueue, heldCashSummary, sendOrQueue, type SendResult } from './engine';
export { dismissRejected, type OfflineOp, type RejectedOp } from './store';
export { QUEUED_MESSAGE, showQueuedNotice } from './notice';

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeConnectivity, isOnline, isOnline);
}

/** This account's waiting and refused writes; re-renders when they change. */
export function useOfflineQueue(): { pending: OfflineOp[]; rejected: RejectedOp[] } {
  useSyncExternalStore(subscribeQueue, getQueueVersion, getQueueVersion);
  const userId = getStoredUser()?.id;
  const mine = (op: OfflineOp) => op.userId == null || op.userId === userId;
  return { pending: loadOps().filter(mine), rejected: loadRejected().filter(mine) };
}
