import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { LotHistory, LotView, OperatorView } from '../../api/types-trace';

/** Programme operators (REFERENCE: active ones for everybody; `all` for the administration). */
export function useOperators(all = false, enabled = true) {
  return useQuery({
    queryKey: ['trace-operators', all],
    queryFn: () => api.get<OperatorView[]>(`/trace/operators${all ? '?all=true' : ''}`),
    staleTime: 60_000,
    enabled,
  });
}

/** Traceability lots of the farm, or of one band. */
export function useFarmLots(farmId: string | null, batchId?: string, enabled = true) {
  return useQuery({
    queryKey: ['trace-lots', farmId, batchId ?? 'all'],
    queryFn: () => api.get<LotView[]>(`/farms/${farmId}/trace/lots${batchId ? `?batchId=${encodeURIComponent(batchId)}` : ''}`),
    enabled: !!farmId && enabled,
  });
}

/** One lot's history (lot, sub-lots, events, rearing chronology, scans). */
export function useLotHistory(farmId: string | null, lotId: string | null) {
  return useQuery({
    queryKey: ['trace-lot', farmId, lotId],
    queryFn: () => api.get<LotHistory>(`/farms/${farmId}/trace/lots/${lotId}`),
    enabled: !!farmId && !!lotId,
  });
}
