import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { DeclarativeStock, DeliveryStatus, DeliveryView, ListItemWithMeta } from '../../api/types-supply';

/** Active items of a programme list with their `meta` (REFERENCE: every account reads them). */
export function useListItems(listType: 'INTRANT' | 'UNITE' | 'MOTIF_SORTIE' | 'TYPE_OPERATEUR', enabled = true) {
  return useQuery({
    queryKey: ['programme-list', listType],
    queryFn: () => api.get<ListItemWithMeta[]>(`/programme/lists/${listType}`),
    staleTime: 5 * 60_000,
    enabled,
  });
}

/** The farm's deliveries (`GET /farms/:farmId/input-deliveries[?status]`). */
export function useFarmDeliveries(farmId: string | null, status: DeliveryStatus | '' = '', enabled = true) {
  return useQuery({
    queryKey: ['input-deliveries', farmId, status],
    queryFn: () => api.get<DeliveryView[]>(`/farms/${farmId}/input-deliveries${status ? `?status=${status}` : ''}`),
    enabled: !!farmId && enabled,
  });
}

/** `GET /farms/:farmId/declarative-stock`. */
export function useDeclarativeStock(farmId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['declarative-stock', farmId],
    queryFn: () => api.get<DeclarativeStock>(`/farms/${farmId}/declarative-stock`),
    enabled: !!farmId && enabled,
  });
}

/** After a confirmation or a band link: the farm's deliveries, stocks, lots, expenses and alerts. */
export function invalidateFarmSupply(qc: QueryClient, farmId: string | null): void {
  for (const key of ['input-deliveries', 'declarative-stock', 'feed-stock', 'feed-movements', 'batches', 'dashboard', 'alerts', 'expenses']) {
    void qc.invalidateQueries({ queryKey: [key, farmId] });
  }
  void qc.invalidateQueries({ queryKey: ['programme-deliveries'] });
}
