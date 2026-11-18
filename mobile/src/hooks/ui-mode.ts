// Which experience an account gets: SIMPLE (pictograms, data entry only) or
// COMPLET (the full app). Pure so the fallback rule is tested.
import type { FarmMemberProfile, UiMode } from '@/api/types';

export interface UiModeInput {
  /** Farm link of the account (GET /farms/:id/me), possibly an old cached copy. */
  profile: Pick<FarmMemberProfile, 'role' | 'active' | 'uiMode' | 'canChangeOwnUiMode'> | null | undefined;
  /** Global role of the account (`user.role`). */
  userRole: string | undefined;
}

export interface UiModeState {
  mode: UiMode;
  simple: boolean;
  canChangeOwn: boolean;
}

function isUiMode(v: unknown): v is UiMode {
  return v === 'SIMPLE' || v === 'COMPLET';
}

/**
 * The server's `uiMode` wins. Until it sends one (older server, cached profile
 * from before the setting existed) the previous rule applies: simple for the
 * ground éleveur (farm link role ELEVEUR, or global role ELEVEUR).
 */
export function resolveUiMode({ profile, userRole }: UiModeInput): UiModeState {
  const declared = profile?.uiMode;
  const mode: UiMode = isUiMode(declared)
    ? declared
    :(profile?.role === 'ELEVEUR' && profile.active !== false) || userRole === 'ELEVEUR'
      ? 'SIMPLE'
      : 'COMPLET';
  return { mode, simple: mode === 'SIMPLE', canChangeOwn: profile?.canChangeOwnUiMode === true };
}
