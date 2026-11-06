import type { FarmMemberProfile, UserRole } from '@/api/types';

/** State of `GET /farms/:id/me` as the hook sees it. */
export type ProfileFetchState =
  | { status: 'pending' }
  | { status: 'success'; profile: FarmMemberProfile | null }
  /** `network`: the server could not be reached (offline start), as opposed to a refusal (4xx). */
  | { status: 'error'; network: boolean };

export interface FarmAccess {
  /** `'*'` = every right; otherwise exactly the listed codes (possibly none). */
  permissions: '*' | readonly string[];
  /** Owner of the farm (or platform admin), or assumed so offline for an owner account. */
  isOwner: boolean;
  /** Role on the farm, null when unknown (no farm, no profile, still loading). */
  farmRole: FarmMemberProfile['role'] | null;
}

const NOTHING: FarmAccess = { permissions: [], isOwner: false, farmRole: null };

/** Accounts that can never act on a farm, whatever the server answers. */
const NO_FARM_ROLES: readonly UserRole[] = ['ACHETEUR', 'OPERATEUR'];

/**
 * Effective rights of the signed-in account on the active farm (pure).
 *
 * Grants nothing without a farm, while the profile loads, when the server
 * answers no profile (null) or refuses (4xx): a buyer or an account without
 * a farm must never get the owner's menu. Only an offline start (server out
 * of reach) stays permissive for the accounts that work on their farm
 * (owner, platform admin, staff), as before: the server still enforces.
 */
export function resolveFarmAccess(input: {
  farmId: string;
  userRole: UserRole | undefined;
  fetch: ProfileFetchState;
}): FarmAccess {
  const { farmId, userRole, fetch } = input;
  if (!farmId || !userRole || NO_FARM_ROLES.includes(userRole)) return NOTHING;

  if (fetch.status === 'success') {
    const profile = fetch.profile;
    if (!profile) return NOTHING;
    const all = profile.permissions.includes('*');
    return {
      permissions: all ? '*' : profile.permissions,
      isOwner: profile.role === 'PROPRIETAIRE',
      farmRole: profile.role,
    };
  }

  if (fetch.status === 'error' && fetch.network) {
    if (userRole === 'PROPRIETAIRE' || userRole === 'PLATFORM_ADMIN') {
      return { permissions: '*', isOwner: true, farmRole: 'PROPRIETAIRE' };
    }
    if (userRole === 'ELEVEUR') return { permissions: '*', isOwner: false, farmRole: null };
  }
  return NOTHING;
}

/**
 * Whether the account may read the Fermia-only domains of a farm (sales desk
 * and caisse, orders, customers, points of sale, transfers, Market,
 * accounting, team, account/push): owner, staff and platform admin only. The
 * backend refuses those domains to any institutional profile
 * (`validateMatrix`), whatever its matrix, so an institution's screen must not
 * even ask (a 403 per screen otherwise). Programme domains (technique,
 * sanitaire, intrants, économique…) follow the permissions instead.
 */
export function readsFermiaData(userRole: UserRole | undefined): boolean {
  return userRole === 'PROPRIETAIRE' || userRole === 'ELEVEUR' || userRole === 'PLATFORM_ADMIN';
}

export function accessAllows(access: FarmAccess, code: string): boolean {
  return access.permissions === '*' || access.permissions.includes(code);
}
