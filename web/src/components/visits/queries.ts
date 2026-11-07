import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { ProgrammeVisitsPage, VisitGrid, VisitView } from '../../api/types-visits';

/** `GET /farms/:farmId/visits`. */
export function useFarmVisits(farmId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['visits', farmId],
    queryFn: () => api.get<VisitView[]>(`/farms/${farmId}/visits`),
    enabled: !!farmId && enabled,
  });
}

/** `GET /farms/:farmId/visits/:id` (with the grid answers). */
export function useVisit(farmId: string | null, id: string | null) {
  return useQuery({
    queryKey: ['visit', farmId, id],
    queryFn: () => api.get<VisitView>(`/farms/${farmId}/visits/${id}`),
    enabled: !!farmId && !!id,
  });
}

/** `GET /farms/:farmId/visits/grid`: the grid in force and the class thresholds. */
export function useVisitGrid(farmId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['visit-grid', farmId],
    queryFn: () => api.get<VisitGrid>(`/farms/${farmId}/visits/grid`),
    enabled: !!farmId && enabled,
    staleTime: 5 * 60_000,
  });
}

export interface ProgrammeVisitFilters {
  province: string;
  classification: string;
  type: string;
}

/** `GET /programme/visits` with the page filters. */
export function useProgrammeVisits(filters: ProgrammeVisitFilters, enabled: boolean) {
  return useQuery({
    queryKey: ['programme-visits', filters],
    queryFn: () => {
      const q = new URLSearchParams({ pageSize: '100' });
      if (filters.province) q.set('province', filters.province);
      if (filters.classification) q.set('classification', filters.classification);
      if (filters.type) q.set('type', filters.type);
      return api.get<ProgrammeVisitsPage>(`/programme/visits?${q.toString()}`);
    },
    enabled,
  });
}

/** After a visit is recorded: the farm's lists and the programme list. */
export function invalidateVisits(qc: QueryClient, farmId: string | null): void {
  void qc.invalidateQueries({ queryKey: ['visits', farmId] });
  void qc.invalidateQueries({ queryKey: ['programme-visits'] });
  void qc.invalidateQueries({ queryKey: ['trace-lot'] });
}
