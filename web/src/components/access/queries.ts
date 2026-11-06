import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { AccessCatalog, AccessProfile, Membership, ProvinceOption } from '../../api/types-access';

/**
 * Reads of the access administration. Not farm data: the keys carry no
 * farmId. Writes invalidate through `invalidateAccess`.
 */

export const ACCESS_KEYS = {
  catalog: ['access-catalog'],
  profiles: ['access-profiles'],
  memberships: ['access-memberships'],
  provinces: ['programme-provinces'],
} as const;

export function useAccessCatalog() {
  return useQuery({
    queryKey: ACCESS_KEYS.catalog,
    queryFn: () => api.get<AccessCatalog>('/programme/access/catalog'),
    staleTime: 30 * 60_000,
  });
}

export function useAccessProfiles() {
  return useQuery({
    queryKey: ACCESS_KEYS.profiles,
    queryFn: () => api.get<AccessProfile[]>('/programme/access/profiles'),
  });
}

export function useMemberships() {
  return useQuery({
    queryKey: ACCESS_KEYS.memberships,
    queryFn: () => api.get<Membership[]>('/programme/access/memberships'),
  });
}

export function useProvinces() {
  return useQuery({
    queryKey: ACCESS_KEYS.provinces,
    queryFn: () => api.get<ProvinceOption[]>('/programme/provinces'),
    staleTime: 30 * 60_000,
  });
}

/** After a write: profiles and memberships show each other's data (counts, labels). */
export function invalidateAccess(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ACCESS_KEYS.profiles });
  void queryClient.invalidateQueries({ queryKey: ACCESS_KEYS.memberships });
}
