import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { ListHistoryEntry, ListItem, ParameterVersion, ParameterView, ProgramListType } from '../../api/types-admin';
import type { ProvinceView } from '../../api/types-programme';

/** Parameters in force now, or at `at` (ISO): `GET /programme/parameters[?at=]`. */
export function useParameters(at: string | null, enabled = true) {
  return useQuery({
    queryKey: ['programme-parameters', at],
    queryFn: () => api.get<ParameterView[]>(`/programme/parameters${at ? `?at=${encodeURIComponent(at)}` : ''}`),
    enabled,
  });
}

/** Every version of one key, newest effective date first. */
export function useParameterHistory(key: string) {
  return useQuery({
    queryKey: ['programme-parameter-history', key],
    queryFn: () => api.get<ParameterVersion[]>(`/programme/parameters/${encodeURIComponent(key)}/history`),
  });
}

export function invalidateParameters(queryClient: QueryClient, key: string): void {
  void queryClient.invalidateQueries({ queryKey: ['programme-parameters'] });
  void queryClient.invalidateQueries({ queryKey: ['programme-parameter-history', key] });
}

/** Who changed a list's items, and when (profiles that manage the list). */
export function useListHistory(listType: ProgramListType) {
  return useQuery({
    queryKey: ['programme-list-history', listType],
    queryFn: () => api.get<ListHistoryEntry[]>(`/programme/lists/${listType}/history`),
  });
}

/** A list's items; `all`: inactive ones too (`?all=true`, profiles that manage the list). */
export function useListItems(listType: ProgramListType, all: boolean) {
  return useQuery({
    queryKey: ['programme-list-admin', listType, all],
    queryFn: () => api.get<ListItem[]>(`/programme/lists/${listType}${all ? '?all=true' : ''}`),
  });
}

/** After a list write: this screen, and the active lists the other screens read (`['programme-list', type]`). */
export function invalidateList(queryClient: QueryClient, listType: ProgramListType): void {
  void queryClient.invalidateQueries({ queryKey: ['programme-list-admin', listType] });
  void queryClient.invalidateQueries({ queryKey: ['programme-list', listType] });
  void queryClient.invalidateQueries({ queryKey: ['programme-list-history', listType] });
}

/** Provinces with their localités; `all`: inactive localités too (platform admin only). */
export function useProvincesAdmin(all: boolean) {
  return useQuery({
    queryKey: ['programme-provinces-admin', all],
    queryFn: () => api.get<ProvinceView[]>(`/programme/provinces${all ? '?all=true' : ''}`),
  });
}

/** After a territory write: this screen and the registry's province list. */
export function invalidateTerritories(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['programme-provinces-admin'] });
  void queryClient.invalidateQueries({ queryKey: ['programme-provinces'] });
}
