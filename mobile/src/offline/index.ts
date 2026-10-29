import { useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { invalidateFarmQueries } from '@/api/invalidate';
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
  recordCustomerPaymentQueued,
  recordOrderPaymentQueued,
  recordStockLossQueued,
  updatePointOfSaleQueued,
  type FlushSummary,
  type SendResult,
} from './engine';
import {
  clearQueue,
  dismissRejected,
  getQueueVersion,
  loadOps,
  loadRejected,
  subscribeQueue,
  type OfflineOp,
  type RejectedOp,
} from './store';

export { clearQueue, dismissRejected, flushQueue, loadOps, loadRejected };
export type { FlushSummary, OfflineOp, RejectedOp, SendResult };

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
  const pending = loadOps();
  const rejected = loadRejected();

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