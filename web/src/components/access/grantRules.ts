import {
  ACCESS_ACTIONS,
  ACTION_LABELS,
  DOMAIN_LABELS,
  GRANTABLE_DOMAINS,
  SCOPE_KIND_LABELS,
  type AccessAction,
  type AccessDomain,
  type AccessMatrix,
  type MyAccess,
  type ScopeKind,
} from '../../api/types-access';

/**
 * What an access administrator may grant: the server's no-escalation rule
 * (`backend/src/modules/access/access-rules.ts` `grantRefusal`,
 * `scopeKindRefusal`, `matrixExcess`, `scopeExcess`, enforced in
 * `AccessAdminService`), mirrored to grey out the profiles, provinces and
 * accounts the caller can't hand out. Pure. The server stays the authority:
 * its 403 message is still shown.
 */

/** The caller: its role and, for an institution, its own access (`GET /programme/access/me`). */
export interface Granter {
  role: string | null | undefined;
  access: (Pick<MyAccess, 'provinceCodes' | 'farmIds'> & { profile: Pick<MyAccess['profile'], 'scopeKind' | 'matrix'> }) | null;
}

type GranterProfile = Pick<MyAccess['profile'], 'scopeKind' | 'matrix'>;

/** Same text as the server's `BEYOND_OWN_ACCESS_MESSAGE`. */
export const BEYOND_OWN_ACCESS_MESSAGE =
  'Accès refusé : ce compte ou ce profil a des droits ou un périmètre plus larges que les vôtres ; seul un administrateur qui les détient (ou l’administrateur de la plateforme) peut le modifier.';

export const AUDIT_PROFILE_MESSAGE = 'Accès refusé : seul l’administrateur de la plateforme attribue un profil d’audit.';

const NOT_ADMIN_MESSAGE = 'Accès refusé : votre profil ne permet pas d’administrer les accès.';

/** ALL ⊃ PROVINCES ⊃ FARMS; the other kinds are not on this scale. */
const FARM_SCOPE_RANK: Partial<Record<ScopeKind, number>> = { ALL: 3, PROVINCES: 2, FARMS: 1 };

function holds(matrix: AccessMatrix, domain: AccessDomain, action: AccessAction): boolean {
  const actions = matrix[domain];
  return Array.isArray(actions) && actions.includes(action);
}

/** ALL scope + ADMINISTRATION:ADMINISTRER: assigns any profile but an audit one, without holding its rights. */
export function isNationalAdministrator(granter: GranterProfile): boolean {
  return granter.scopeKind === 'ALL' && holds(granter.matrix, 'ADMINISTRATION', 'ADMINISTRER');
}

/**
 * ALL grants any kind; PROVINCES grants PROVINCES or FARMS; FARMS grants
 * FARMS; any other kind grants nothing. Null when allowed.
 */
export function scopeKindRefusal(granter: ScopeKind, target: ScopeKind): string | null {
  if (granter === 'ALL') return null;
  const label = SCOPE_KIND_LABELS[target];
  const own = FARM_SCOPE_RANK[granter];
  const wanted = FARM_SCOPE_RANK[target];
  if (wanted === undefined) {
    return `Accès refusé : seul un administrateur de périmètre national (toutes les fermes) peut accorder le périmètre « ${label} ».`;
  }
  if (own === undefined || wanted > own) {
    return `Accès refusé : le périmètre « ${label} » est plus large que le vôtre (« ${SCOPE_KIND_LABELS[granter]} »).`;
  }
  return null;
}

/** Rights of `target` the granter does not hold, in catalogue order. */
export function matrixExcess(granter: AccessMatrix, target: AccessMatrix): Array<[AccessDomain, AccessAction]> {
  const out: Array<[AccessDomain, AccessAction]> = [];
  for (const domain of GRANTABLE_DOMAINS) {
    for (const action of ACCESS_ACTIONS) {
      if (holds(target, domain, action) && !holds(granter, domain, action)) out.push([domain, action]);
    }
  }
  return out;
}

/**
 * Why the caller can't grant (or create, edit) this profile; null when it can.
 * Platform admin: anything. An institution: never an audit profile (AUDIT
 * scope or domain), a scope kind within its own, and only rights it holds,
 * unless it is the national administrator.
 */
export function grantRefusal(
  granter: Granter,
  profile: { scopeKind: ScopeKind; matrix: AccessMatrix | null | undefined; label: string },
): string | null {
  if (granter.role === 'PLATFORM_ADMIN') return null;
  const own = granter.role === 'INSTITUTION' ? granter.access?.profile : null;
  if (!own) return NOT_ADMIN_MESSAGE;
  const matrix = profile.matrix ?? {};
  if (profile.scopeKind === 'AUDIT' || matrix.AUDIT) return AUDIT_PROFILE_MESSAGE;
  const kind = scopeKindRefusal(own.scopeKind, profile.scopeKind);
  if (kind) return kind;
  if (isNationalAdministrator(own)) return null;
  const excess = matrixExcess(own.matrix, matrix);
  if (excess.length === 0) return null;
  const list = excess.map(([d, a]) => `${DOMAIN_LABELS[d]} : ${ACTION_LABELS[a]}`).join(', ');
  return `Accès refusé : le profil « ${profile.label} » donne des droits que vous n’avez pas (${list}).`;
}

/** Whether the caller may put this province in a PROVINCES scope (its own provinces; any from an ALL scope). */
export function provinceGrantable(granter: Granter, provinceCode: string): boolean {
  if (granter.role === 'PLATFORM_ADMIN') return true;
  const access = granter.role === 'INSTITUTION' ? granter.access : null;
  if (!access) return false;
  if (access.profile.scopeKind === 'ALL') return true;
  return access.profile.scopeKind === 'PROVINCES' && access.provinceCodes.includes(provinceCode);
}

/** Whether the caller may put this farm in a FARMS scope (by its province for a PROVINCES caller, by id for a FARMS one). */
export function farmGrantable(granter: Granter, farmId: string, farmProvinceCode: string | null): boolean {
  if (granter.role === 'PLATFORM_ADMIN') return true;
  const access = granter.role === 'INSTITUTION' ? granter.access : null;
  if (!access) return false;
  switch (access.profile.scopeKind) {
    case 'ALL':
      return true;
    case 'PROVINCES':
      return farmProvinceCode !== null && access.provinceCodes.includes(farmProvinceCode);
    case 'FARMS':
      return access.farmIds.includes(farmId);
    default:
      return false;
  }
}

/**
 * Why the caller can't manage (edit, suspend, give a new code to) an existing
 * account: the server lets an institutional admin manage only an account it
 * could have granted, profile and scope. Null when it can, or when the
 * account's profile isn't known (the server decides).
 */
export function membershipManageRefusal(
  granter: Granter,
  membership: { provinceCodes: readonly string[]; farmIds: readonly string[] },
  profile: { scopeKind: ScopeKind; matrix: AccessMatrix; label: string } | null | undefined,
  farmProvinceCode: (farmId: string) => string | null = () => null,
): string | null {
  if (granter.role === 'PLATFORM_ADMIN' || !profile) return null;
  if (grantRefusal(granter, profile)) return BEYOND_OWN_ACCESS_MESSAGE;
  const outside =
    (profile.scopeKind === 'PROVINCES' && membership.provinceCodes.some((c) => !provinceGrantable(granter, c))) ||
    (profile.scopeKind === 'FARMS' && membership.farmIds.some((id) => !farmGrantable(granter, id, farmProvinceCode(id))));
  return outside ? BEYOND_OWN_ACCESS_MESSAGE : null;
}
