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
  const accountActive = profile?.active !== false;
  // Simple display mode (jury lot 3): pictograms and data entry only. Only the exploitant
  // and the staff have one; the server answers COMPLET for institutions and the platform admin.
  const isSimpleMode =
    accountActive && (profile?.role === 'PROPRIETAIRE' || profile?.role === 'ELEVEUR') && profile.uiMode === 'SIMPLE';
  // A server older than the display mode sends none: every Éleveur keeps the ground home.
  const legacyGround = profile?.role === 'ELEVEUR' && accountActive && profile.uiMode === undefined;

  /** True when the account holds at least one of the codes. */
  function hasPermission(...codes: string[]): boolean {
    if (pending) return false;
    // Unreadable profile (offline, never loaded): the server decides.
    if (!profile) return true;
    return hasAll || codes.some((code) => profile.permissions.includes(code));
  }

  /** An institutional account (agent technique, vet…) on a farm of its scope. */
  const isInstitution = profile?.role === 'INSTITUTION';

  /**
   * Care, treatment and planning writes. An institution holding only `sanitaire:signaler` (the agent technique:
   * declares for the farm, jury lot 5) does not get them: they need `sanitaire:gerer` (SANITAIRE:MODIFIER).
   */
  function canManageCare(): boolean {
    return isInstitution ? hasPermission('sanitaire:gerer') : hasPermission('sanitaire:gerer', 'sanitaire:signaler');
  }

  return {
    profile,
    isInstitution,
    canManageCare,
    isLoading: pending,
    // Same as hasPermission and mobile: an unreadable profile doesn't take rights away.
    isOwner: profile?.role === 'PROPRIETAIRE' || (!profile && !pending),
    /**
     * Field account (« Mon terrain » as landing page): any account in Simple mode (owner or staff),
     * and every Éleveur of a server without display mode.
     */
    isGroundEleveur: isSimpleMode || legacyGround,
    /** Simple mode: the menu is reduced to « Mon terrain » (staff and owner alike). */
    isSimpleMode,
    /** « Mon terrain » stays in the menu of an Éleveur who moved to Complet. */
    hasGroundHome: isSimpleMode || legacyGround || (profile?.role === 'ELEVEUR' && accountActive),
    /** The owner (and the platform admin) change their own display mode; staff do not. */
    canChangeOwnUiMode: profile?.canChangeOwnUiMode === true,
    hasPermission,
  };
}
