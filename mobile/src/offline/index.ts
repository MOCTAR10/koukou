import { useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { invalidateFarmQueries } from '@/api/invalidate';
import { loadSession } from '@/api/token';
import type { DailyEntryPayload, InvoiceFields, SaleItemPayload } from '@/api/mutations';

import {
  cancelOrderQueued,
  cancelStockTransferQueued,
  createStockTransferQueued,
  createCreditSaleQueued,
  createDailyEntryQueued,
  createFeedInputQueued,
  createOrderQueued,
  createPointOfSaleQueued,
  createSaleQueued,
  deletePointOfSaleQueued,
  deliverOrderQueued,
  flushQueue,
  heldCashSummary,
  subscribeFlush,
  recordCustomerPaymentQueued,
  recordOrderPaymentQueued,
  recordStockLossQueued,
  updatePointOfSaleQueued,
  confirmDeliveryQueued,
  createDeclarationQueued,
  createSortieQueued,
  createVisitQueued,
  setFarmGpsQueued,
  // POUFA lot A sante
  completeProphylaxisQueued,
  createTreatmentQueued,
  confirmRejectedGps,
  GPS_OUTSIDE_PROVINCE,
  isOutsideProvince,
  OUTSIDE_REASON_MIN,
  withOutsideConfirmation,
  type DeclarationSent,
  type FlushSummary,
  type SendResult,
  type SendResultOf,
} from './engine';
import {
  clearQueue,
  clearRejected,
  clearUserQueue,
  clearUserRejected,
  consumeQueueRecovery,
  countUserOps,
  dismissRejected,
  getQueueVersion,
  loadOps,
  loadRejected,
  subscribeQueue,
  type OfflineOp,
  type RejectedOp,
} from './store';

export { clearQueue, clearRejected, clearUserQueue, clearUserRejected, consumeQueueRecovery, countUserOps, dismissRejected, flushQueue, heldCashSummary, loadOps, loadRejected, subscribeFlush };
export type { VisitSent } from './engine';
export type { DeclarationSent, FlushSummary, OfflineOp, RejectedOp, SendResult, SendResultOf };

// POUFA field work (mobile M2).
export { confirmDeliveryQueued, createDeclarationQueued, createSortieQueued, createVisitQueued, setFarmGpsQueued };

// POUFA lot A sante: treatments and care completions (CDC n° 22-23).
export { completeProphylaxisQueued, createTreatmentQueued };

// GPS point outside the declared province: confirmed with a reason.
export { confirmRejectedGps, GPS_OUTSIDE_PROVINCE, isOutsideProvince, OUTSIDE_REASON_MIN, withOutsideConfirmation };

export {
  cancelOrderQueued,
  cancelStockTransferQueued,
  createStockTransferQueued,
  createCreditSaleQueued,
  createDailyEntryQueued,
  createFeedInputQueued,
  createOrderQueued,
  createPointOfSaleQueued,
  createSaleQueued,
  deletePointOfSaleQueued,
  deliverOrderQueued,
  recordCustomerPaymentQueued,
  recordOrderPaymentQueued,
  recordStockLossQueued,
  updatePointOfSaleQueued,
};

export interface OfflineQueueState {
  pending: OfflineOp[];
  /** Cash ops the server refused, kept so the money is never lost silently. */
  rejected: RejectedOp[];
  syncing: boolean;
  last: FlushSummary | null;
  flush: () => Promise<void>;
}

export function useOfflineQueue(farmId: string): OfflineQueueState {
  useSyncExternalStore(subscribeQueue, getQueueVersion, getQueueVersion);
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [last, setLast] = useState<FlushSummary | null>(null);
  // Another account's ops stay on the phone but are neither shown nor counted.
  const me = loadSession()?.user?.id;
  const mine = (o: OfflineOp) => o.userId == null || o.userId === me;
  const pending = loadOps().filter(mine);
  const rejected = loadRejected().filter(mine);

  const flush = async () => {
    setSyncing(true);
    try {
      const summary = await flushQueue();
      setLast(summary);
      // Queued ops carry their own farm: refresh every farm that synced, not
      // only the active one.
      for (const id of new Set([...summary.farmIds, ...(summary.synced > 0 ? [farmId] : [])])) {
        invalidateFarmQueries(queryClient, { farmId: id });
      }
    } finally {
      setSyncing(false);
    }
  };

  return { pending, rejected, syncing, last, flush };
}

export function queueDailyEntry(farmId: string, batchId: string, payload: DailyEntryPayload): Promise<SendResult> {
  return createDailyEntryQueued(farmId, batchId, payload);
}

export function queueSale(
  farmId: string,
  saleDate: string,
  items: SaleItemPayload[],
  amountFcfa: number,
  invoice?: InvoiceFields,
  pointOfSaleId?: string,
): Promise<SendResult> {
  return createSaleQueued(farmId, saleDate, items, amountFcfa, invoice, pointOfSaleId);
}

/** Vente à crédit : aucun encaissement, la dette est portée par le client. */
export function queueCreditSale(
  farmId: string,
  saleDate: string,
  items: SaleItemPayload[],
  invoice: InvoiceFields,
  pointOfSaleId?: string,
): Promise<SendResult> {
  return createCreditSaleQueued(farmId, saleDate, items, invoice, pointOfSaleId);
}

/** Encaissement depuis la fiche client : mis en file si hors ligne. */
export function queueCustomerPayment(
  farmId: string,
  customerId: string,
  amountFcfa: number,
): Promise<SendResult> {
  return recordCustomerPaymentQueued(farmId, customerId, amountFcfa);
}