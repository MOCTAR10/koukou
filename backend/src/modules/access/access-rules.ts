import { AccessScopeKind } from '../../common/enums/access-scope-kind.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  ACCESS_ACTIONS,
  ACTION_LABELS,
  DOMAIN_LABELS,
  FERMIA_DOMAINS,
  SESSION_DOMAIN,
  isAccessAction,
  isProgrammeDomain,
  type AccessAction,
  type AccessDomain,
  type AccessMatrix,
  type ProgrammeDomain,
} from './access-domains.js';

/**
 * Pure rules of the institutional access (POUFA plan §5.3): route decision,
 * farm scope, matrix validation. No I/O, unit-tested.
 */

/** Effective access of an institutional account, resolved once per request. */
export interface InstitutionAccess {
  membershipId: string;
  userId: string;
  programId: string;
  profileId: string;
  profileCode: string;
  profileLabel: string;
  scopeKind: AccessScopeKind;
  matrix: AccessMatrix;
  provinceIds: readonly string[];
  farmIds: readonly string[];
  operatorId: string | null;
}

export type AccessDecision =
  { allowed: true } | { allowed: false; reason: string };

export const NO_MEMBERSHIP_MESSAGE =
  'Accès refusé : aucun rattachement actif au programme pour ce compte.';
export const NO_DOMAIN_MESSAGE =
  "Accès refusé : cette fonction n'est pas ouverte aux comptes institutionnels.";
export const OUT_OF_SCOPE_MESSAGE =
  'Accès refusé : cette ferme est hors de votre périmètre.';

/** A membership counts while active and not past its `validUntil`. */
export function isMembershipEffective(
  m: { active: boolean; validUntil: Date | null },
  now: Date = new Date(),
): boolean {
  if (!m.active) return false;
  return m.validUntil === null || m.validUntil.getTime() > now.getTime();
}

/** Whether the matrix grants `action` on `domain`. */
export function grants(
  matrix: AccessMatrix,
  domain: ProgrammeDomain,
  action: AccessAction,
): boolean {
  const actions = matrix[domain];
  return Array.isArray(actions) && actions.includes(action);
}

/**
 * Decision for one route: default deny without a domain or a membership; the
 * AUDIT scope reaches the journal only; SESSION is open to any member;
 * otherwise the matrix decides. Fermia-only domains are never in a matrix.
 */
export function decideRoute(
  access: InstitutionAccess | null,
  domain: AccessDomain | undefined,
  action: AccessAction,
): AccessDecision {
  if (!domain) return { allowed: false, reason: NO_DOMAIN_MESSAGE };
  if (!access) return { allowed: false, reason: NO_MEMBERSHIP_MESSAGE };
  if (domain === SESSION_DOMAIN) return { allowed: true };
  if (access.scopeKind === AccessScopeKind.AUDIT && domain !== 'AUDIT') {
    return {
      allowed: false,
      reason:
        "Accès refusé : votre profil donne accès au journal d'audit seulement.",
    };
  }
  if (isProgrammeDomain(domain) && grants(access.matrix, domain, action)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: `Accès refusé : le profil « ${access.profileLabel} » ne permet pas l'action « ${ACTION_LABELS[action]} » sur le domaine « ${DOMAIN_LABELS[domain]} ».`,
  };
}

/** Scope kinds that reach individual farms (the others see no farm row). */
export function scopeReachesFarms(kind: AccessScopeKind): boolean {
  return (
    kind === AccessScopeKind.ALL ||
    kind === AccessScopeKind.PROVINCES ||
    kind === AccessScopeKind.FARMS
  );
}

/**
 * Whether a farm is in the scope. Only programme farms of the member's
 * programme are ever in scope: a farm outside any programme (plain Fermia
 * customer) is never visible to an institution. FINANCED needs the BCEG
 * consent model (not built yet), so it reaches no farm for now; AGGREGATE,
 * AUDIT and OPERATOR never reach a farm sheet.
 */
export function includesFarm(
  access: InstitutionAccess,
  farm: { id: string; programId: string | null; provinceId: string | null },
): boolean {
  if (!farm.programId || farm.programId !== access.programId) return false;
  switch (access.scopeKind) {
    case AccessScopeKind.ALL:
      return true;
    case AccessScopeKind.PROVINCES:
      return (
        farm.provinceId !== null && access.provinceIds.includes(farm.provinceId)
      );
    case AccessScopeKind.FARMS:
      return access.farmIds.includes(farm.id);
    default:
      return false;
  }
}

/** Whether a province is in the scope (creating or moving a farm there). */
export function includesProvince(
  access: InstitutionAccess,
  provinceId: string,
): boolean {
  if (access.scopeKind === AccessScopeKind.ALL) return true;
  if (access.scopeKind === AccessScopeKind.PROVINCES) {
    return access.provinceIds.includes(provinceId);
  }
  return false;
}

/**
 * SQL condition restricting a `farms` alias to the scope, with named
 * parameters (TypeORM `:name` / `:...name`). Never filter on the client.
 */
export function farmScopeSql(
  access: InstitutionAccess,
  alias: string,
): { sql: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = {
    scopeProgramId: access.programId,
  };
  const program = `${alias}.program_id = :scopeProgramId`;
  switch (access.scopeKind) {
    case AccessScopeKind.ALL:
      return { sql: program, params };
    case AccessScopeKind.PROVINCES:
      if (access.provinceIds.length === 0) return { sql: '1 = 0', params: {} };
      return {
        sql: `${program} AND ${alias}.province_id IN (:...scopeProvinceIds)`,
        params: { ...params, scopeProvinceIds: [...access.provinceIds] },
      };
    case AccessScopeKind.FARMS:
      if (access.farmIds.length === 0) return { sql: '1 = 0', params: {} };
      return {
        sql: `${program} AND ${alias}.id IN (:...scopeFarmIds)`,
        params: { ...params, scopeFarmIds: [...access.farmIds] },
      };
    default:
      return { sql: '1 = 0', params: {} };
  }
}

export type MatrixCheck =
  { ok: true; matrix: AccessMatrix } | { ok: false; error: string };

/**
 * Validates and normalizes a matrix (deduplicated actions in catalogue order,
 * empty domains dropped). Refuses Fermia-only domains, unknown domains or
 * actions, and keeps the journal apart: the AUDIT domain belongs to an AUDIT
 * scope profile, which holds nothing else.
 */
export function validateMatrix(
  raw: unknown,
  scopeKind: AccessScopeKind,
): MatrixCheck {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      error: 'La matrice doit être un objet { domaine: [actions] }.',
    };
  }
  const matrix: AccessMatrix = {};
  for (const [domain, actions] of Object.entries(raw)) {
    if ((FERMIA_DOMAINS as readonly string[]).includes(domain)) {
      return {
        ok: false,
        error: `Le domaine « ${domain} » est propre à Fermia et ne peut pas être accordé à un profil institutionnel.`,
      };
    }
    if (!isProgrammeDomain(domain)) {
      return { ok: false, error: `Domaine inconnu : « ${domain} ».` };
    }
    if (!Array.isArray(actions)) {
      return {
        ok: false,
        error: `Les actions du domaine « ${domain} » doivent être une liste.`,
      };
    }
    const bad = actions.find((a) => !isAccessAction(a));
    if (bad !== undefined) {
      return {
        ok: false,
        error: `Action inconnue : « ${String(bad)} » (${ACCESS_ACTIONS.join(', ')}).`,
      };
    }
    const set = new Set(actions as AccessAction[]);
    const ordered = ACCESS_ACTIONS.filter((a) => set.has(a));
    if (ordered.length > 0) matrix[domain] = ordered;
  }
  const domains = Object.keys(matrix);
  if (scopeKind === AccessScopeKind.AUDIT) {
    if (domains.some((d) => d !== 'AUDIT')) {
      return {
        ok: false,
        error:
          "Un profil d'audit ne donne accès qu'au journal (domaine AUDIT).",
      };
    }
  } else if (matrix.AUDIT) {
    return {
      ok: false,
      error:
        'Le domaine AUDIT est réservé à un profil de périmètre « Journal » (AUDIT).',
    };
  }
  return { ok: true, matrix };
}

/**
 * `ProgramParameter.ownerProfile`: the platform admin changes any parameter;
 * an institutional account only those owned by its profile; nobody else.
 */
export function mayChangeParameter(
  role: string,
  profileCode: string | null,
  ownerProfile: string,
): boolean {
  if (role === UserRole.PLATFORM_ADMIN) return true;
  if (role !== UserRole.INSTITUTION) return false;
  return profileCode !== null && profileCode === ownerProfile;
}
