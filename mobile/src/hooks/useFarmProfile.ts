import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/api/client';
import { fetchFarmProfile } from '@/api';
import type { PermissionCode } from '@/api/types';
import { accessAllows, profileFetchState, resolveFarmAccess } from './farm-access';
// POUFA lot A droits: Fermia screens follow the matrix grants (read codes of /me), read-only for institutions.
import { delegatedEntry, fermiaReadOnly, fermiaWrites, readsFermiaArea, type FermiaArea } from '@/poufa/fermia-access';

/** Server out of reach (offline start), as opposed to a refusal. */
function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof ApiError && error.status >= 500);
}

/** Droits effectifs du compte connecté sur la ferme (GET /farms/:id/me).
 *  PROPRIETAIRE / plateforme → permissions ['*'] ; ADMIN → ses permissions ;
 *  ÉLEVEUR → droits fixes ; INSTITUTION → droits tirés de son profil d'accès.
 *  Sans ferme ou sans profil : aucun droit (voir `resolveFarmAccess`). */
export function useFarmProfile() {
  const { farmId, user } = useAuth();

  const query = useQuery({
    queryKey: ['farm-profile', farmId],
    queryFn: () => fetchFarmProfile(farmId),
    enabled: Boolean(farmId) && user.role !== 'ACHETEUR',
    staleTime: 30_000,
  });

  const fetchState = profileFetchState({
    isSuccess: query.isSuccess,
    isError: query.isError,
    data: query.data,
    networkFailure: query.isError && isNetworkFailure(query.error),
  });
  const access = resolveFarmAccess({ farmId, userRole: user.role, fetch: fetchState });
  const profile = query.data ?? undefined;

  function hasPermission(code: PermissionCode): boolean {
    return accessAllows(access, code);
  }

  return {
    profile,
    farmRole: access.farmRole,
    isOwner: access.isOwner,
    hasAll: access.permissions === '*',
    active: profile?.active !== false,
    hasPermission,
    /** Institutional account (programme): its rights come from its access profile. */
    isInstitution: user.role === 'INSTITUTION',
    /** May load a Fermia area (caisse/ventes, Market, accounting, team, economics): farm accounts, or an institution granted it. */
    readsFermia: (area: FermiaArea) => readsFermiaArea(user.role, area, (code) => accessAllows(access, code)),
    /** Fermia screens in consultation only (« Consultation seule »): institutions. */
    fermiaReadOnly: fermiaReadOnly(user.role),
    /** A write on a Fermia screen: the permission, never for an institution. */
    fermiaWrites: (code: PermissionCode) => fermiaWrites(user.role, accessAllows(access, code)),
    /** Jury lot 5: what a technical agent (institution) may enter on behalf of the farmer on this farm. */
    delegated: delegatedEntry(user.role, (code) => accessAllows(access, code)),
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
