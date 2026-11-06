import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { GpsHistoryRow, ProvinceView, RefItem, RegistrySheet, StatusHistoryRow } from '../../api/types-programme';

/** Provinces and their localités (seeded, rarely change). */
export function useProvinces(enabled = true) {
  return useQuery({
    queryKey: ['programme-provinces'],
    queryFn: () => api.get<ProvinceView[]>('/programme/provinces'),
    staleTime: 30 * 60_000,
    // An institution without PARAMETRES may be refused: the screens then show codes only.
    retry: false,
    enabled,
  });
}

/** Active items of a programme list (COHORTE, INFRASTRUCTURE…), same key as the status items. */
export function useProgrammeList(listType: 'COHORTE' | 'INFRASTRUCTURE', enabled = true) {
  return useQuery({
    queryKey: ['programme-list', listType],
    queryFn: () => api.get<RefItem[]>(`/programme/lists/${listType}`),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useRegistrySheet(farmId: string | null) {
  return useQuery({
    queryKey: ['programme-farm', farmId],
    queryFn: () => api.get<RegistrySheet>(`/programme/farms/${farmId}`),
    enabled: !!farmId,
  });
}

export function useStatusHistory(farmId: string) {
  return useQuery({
    queryKey: ['programme-farm-status-history', farmId],
    queryFn: () => api.get<StatusHistoryRow[]>(`/programme/farms/${farmId}/status-history`),
  });
}

export function useGpsHistory(farmId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['programme-farm-gps-history', farmId],
    queryFn: () => api.get<GpsHistoryRow[]>(`/programme/farms/${farmId}/gps-history`),
    enabled,
  });
}

/**
 * After a registry write: the list, the sheet and its histories, and `farms`,
 * which feeds the farm picker and the header (name, status).
 */
export function invalidateRegistry(queryClient: QueryClient, farmId?: string | null): void {
  const keys: unknown[][] = [['programme-farms'], ['farms'], ['admin-farms'], ['admin-metrics']];
  if (farmId) {
    keys.push(['programme-farm', farmId], ['programme-farm-status-history', farmId], ['programme-farm-gps-history', farmId]);
  }
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
}

/** Writes a fresh sheet answer into the cache (every sheet write returns the sheet). */
export function storeSheet(queryClient: QueryClient, sheet: RegistrySheet): void {
  queryClient.setQueryData(['programme-farm', sheet.id], sheet);
}
