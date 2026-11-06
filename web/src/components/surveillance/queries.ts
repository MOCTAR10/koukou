import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { RefItem } from '../../api/types-programme';

/**
 * Reads shared by the surveillance screens. Programme lists are not farm
 * data: their key carries the list type (same key as `registry/queries.ts`),
 * never a farmId.
 */

export type SurveillanceListType = 'SIGNE_CLINIQUE' | 'PRODUIT_TRAITEMENT' | 'STATUT_ALERTE';

/** Active items of a sanitary list (`GET /programme/lists/:listType`, REFERENCE). */
export function useSanitaryList(listType: SurveillanceListType, enabled = true) {
  return useQuery({
    queryKey: ['programme-list', listType],
    queryFn: () => api.get<RefItem[]>(`/programme/lists/${listType}`),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export const SURVEILLANCE_KEYS = {
  alerts: ['surveillance-alerts'],
  alert: (id: string) => ['surveillance-alert', id],
  calendars: ['surveillance-calendars'],
  calendar: (id: string) => ['surveillance-calendar', id],
} as const;

/** After a transition or a publication: the list and the alert, and the farm side. */
export function invalidateAlerts(queryClient: QueryClient, alertId?: string): void {
  void queryClient.invalidateQueries({ queryKey: SURVEILLANCE_KEYS.alerts });
  if (alertId) void queryClient.invalidateQueries({ queryKey: SURVEILLANCE_KEYS.alert(alertId) });
  void queryClient.invalidateQueries({ queryKey: ['farm-sanitary-alerts'] });
  void queryClient.invalidateQueries({ queryKey: ['farm-sanitary-alert'] });
}

/** After a sanitary list write (the active lists are read everywhere). */
export function invalidateList(queryClient: QueryClient, listType: SurveillanceListType): void {
  void queryClient.invalidateQueries({ queryKey: ['programme-list', listType] });
}
