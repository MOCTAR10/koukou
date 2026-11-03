import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { FarmMemberProfile } from '../api/types-org';
import { useFarm } from './FarmContext';

/**
 * Rights of the signed-in account on the active farm, same rules as mobile's
 * useFarmProfile. The server stays the authority: this only hides what would
 * answer 403.
 */
export function useFarmProfile() {
  const { farmId, farms, farmsLoading } = useFarm();
  const query = useQuery({
    queryKey: ['farm-profile', farmId],
    queryFn: () => api.get<FarmMemberProfile>(`/farms/${farmId}/me`),
    enabled: !!farmId,
    staleTime: 30_000,
  });
  const profile = query.data;
  // First fetch in flight: grant nothing yet, so buttons don't flash then 403.
  // Farms listed but none selected yet: the selection effect is about to run.
  // No farm at all once the list has answered is not "loading": it must not hang the UI.
  const pending = !profile && (query.isLoading || (!farmId && (farmsLoading || farms.length > 0)));
  const hasAll = profile?.permissions.includes('*') === true;

  /** True when the account holds at least one of the codes. */
  function hasPermission(...codes: string[]): boolean {
    if (pending) return false;
    // Unreadable profile (offline, never loaded): the server decides.
    if (!profile) return true;
    return hasAll || codes.some((code) => profile.permissions.includes(code));
  }

  return {
    profile,
    isLoading: pending,
    // Same as hasPermission and mobile: an unreadable profile doesn't take rights away.
    isOwner: profile?.role === 'PROPRIETAIRE' || (!profile && !pending),
    /** Field account: replaces the owner's home with the daily actions, as on mobile. */
    isGroundEleveur: profile?.role === 'ELEVEUR' && profile.active !== false,
    hasPermission,
  };
}
