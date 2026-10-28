import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/auth/AuthContext';
import { fetchFarmProfile } from '@/api';
import type { FarmMemberProfile, PermissionCode } from '@/api/types';

/** Droits effectifs du compte connecté sur la ferme (GET /farms/:id/me).
 *  PROPRIETAIRE / plateforme → permissions ['*'] ; ADMIN → ses permissions ;
 *  ÉLEVEUR → droits fixes. */
export function useFarmProfile() {
  const { farmId } = useAuth();

  const query = useQuery({
    queryKey: ['farm-profile', farmId],
    queryFn: () => fetchFarmProfile(farmId),
    enabled: Boolean(farmId),
    staleTime: 30_000,
  });

  const profile = query.data as FarmMemberProfile | undefined;
  // First fetch in flight: grant nothing yet (buttons used to flash, then 403).
  // If the fetch failed (offline start) stay permissive: the server enforces.
  const pending = !profile && query.isLoading;

  const isOwner = profile?.role === 'PROPRIETAIRE' || (profile === undefined && !pending);
  const farmRole = profile?.role ?? 'PROPRIETAIRE';
  const hasAll = profile?.permissions.includes('*') === true;
  const active = profile?.active !== false;

  function hasPermission(code: PermissionCode): boolean {
    if (pending) return false;
    if (!profile) return true;
    if (hasAll) return true;
    return profile.permissions.includes(code);
  }

  return {
    profile,
    farmRole,
    isOwner,
    hasAll,
    active,
    hasPermission,
    /** Compte de terrain dédié : Éleveur Fermia actif sur la ferme. */
    isGroundEleveur: profile?.role === 'ELEVEUR' && profile.active !== false,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}