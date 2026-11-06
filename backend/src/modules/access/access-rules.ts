import { AccessScopeKind } from '../../common/enums/access-scope-kind.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  ACCESS_ACTIONS,
  ACTION_LABELS,
  DOMAIN_LABELS,
  FERMIA_DOMAINS,
  grantableActions,
  isGrantableDomain,
  isInstitutionFermiaDomain,
  MEMBER_DOMAINS,
  isAccessAction,
  type AccessAction,
  type AccessDomain,
  type AccessMatrix,
  type GrantableDomain,
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
  domain: GrantableDomain,
  action: AccessAction,
): boolean {
  const actions = matrix[domain];
  return Array.isArray(actions) && actions.includes(action);
}

/**
 * Decision for one route: default deny without a domain or a membership; the
 * AUDIT scope reaches the journal only; SESSION and REFERENCE are open to
 * any member; otherwise the matrix decides. Fermia-only domains are in a
 * matrix only for the bonus ones, in consultation (`validateMatrix`).
 */
export function decideRoute(
  access: InstitutionAccess | null,
  domain: AccessDomain | undefined,
  action: AccessAction,
): AccessDecision {
  if (!domain) return { allowed: false, reason: NO_DOMAIN_MESSAGE };
  if (!access) return { allowed: false, reason: NO_MEMBERSHIP_MESSAGE };
  if (MEMBER_DOMAINS.includes(domain)) return { allowed: true };
  if (access.scopeKind === AccessScopeKind.AUDIT && domain !== 'AUDIT') {
    return {
      allowed: false,
      reason:
        "Accès refusé : votre profil donne accès au journal d'audit seulement.",
    };
  }
  if (isGrantableDomain(domain) && grants(access.matrix, domain, action)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: `Accès refusé : le profil « ${access.profileLabel} » ne permet pas l'action « ${ACTION_LABELS[action]} » sur le domaine « ${DOMAIN_LABELS[domain]} ».`,
  };
}

/**
 * {@link decideRoute} with alternative grants (`@AlsoGrantedBy`): allowed when
 * the route's own domain and action, or one alternative, are granted; the
 * refusal names the route's own domain.
 */
export function decideRouteAny(
  access: InstitutionAccess | null,
  domain: AccessDomain | undefined,
  action: AccessAction,
  alternatives: ReadonlyArray<readonly [AccessDomain, AccessAction]> = [],
): AccessDecision {
  const primary = decideRoute(access, domain, action);
  if (primary.allowed || !domain || !access) return primary;
  for (const [d, a] of alternatives) {
    if (decideRoute(access, d, a).allowed) return { allowed: true };
  }
  return primary;
}

/** Whether an institutional access consults `domain` (its scope rules apart). */
export function consults(
  access: Pick<InstitutionAccess, 'matrix' | 'scopeKind'>,
  domain: GrantableDomain,
): boolean {
  if (access.scopeKind === AccessScopeKind.AUDIT && domain !== 'AUDIT') {
    return false;
  }
  return grants(access.matrix, domain, 'CONSULTER');
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
 * Whether a farm is in the scope. Only farms of the member's programme are
 * ever in scope (one programme per instance today). FINANCED needs the BCEG
 * consent model (not built yet), so it reaches no farm for now; AGGREGATE,
 * AUDIT and OPERATOR never reach a farm sheet.
 */
export function includesFarm(
  access: InstitutionAccess,
  farm: { id: string; programId: string; provinceId: string | null },
): boolean {
  if (farm.programId !== access.programId) return false;
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
    if (
      (FERMIA_DOMAINS as readonly string[]).includes(domain) &&
      !isInstitutionFermiaDomain(domain)
    ) {
      return {
        ok: false,
        error: `Le domaine « ${domain} » est propre à Fermia et ne peut pas être accordé à un profil institutionnel.`,
      };
    }
    if (!isGrantableDomain(domain)) {
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
    const allowed = grantableActions(domain);
    const refused = [...set].find((a) => !allowed.includes(a));
    if (refused !== undefined) {
      return {
        ok: false,
        error: `Le domaine « ${DOMAIN_LABELS[domain]} » ne s'ouvre aux profils institutionnels qu'en consultation : l'action « ${ACTION_LABELS[refused]} » ne peut pas être accordée.`,
      };
    }
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

export const SCOPE_KIND_LABELS: Readonly<Record<AccessScopeKind, string>> = {
  ALL: 'Toutes les fermes du programme',
  PROVINCES: 'Fermes de ses provinces',
  FARMS: 'Ses fermes',
  FINANCED: 'Fermes financées (avec consentement)',
  OPERATOR: 'Lots qui le concernent (opérateur)',
  AGGREGATE: 'Données agrégées seulement',
  AUDIT: "Journal d'audit seulement",
};

/**
 * Breadth of the farm-reaching scope kinds: ALL ⊃ PROVINCES ⊃ FARMS. The
 * other kinds (FINANCED, OPERATOR, AGGREGATE, AUDIT) are not on this scale:
 * only an ALL-scope administrator grants them.
 */
const FARM_SCOPE_RANK: Partial<Record<AccessScopeKind, number>> = {
  [AccessScopeKind.ALL]: 3,
  [AccessScopeKind.PROVINCES]: 2,
  [AccessScopeKind.FARMS]: 1,
};

/**
 * Whether an institutional administrator of scope kind `granter` may grant
 * (or create a profile of) scope kind `target`: an ALL scope grants any kind;
 * PROVINCES grants PROVINCES or FARMS; FARMS grants FARMS; any other kind
 * grants nothing. Null when allowed, else the French refusal.
 */
export function scopeKindRefusal(
  granter: AccessScopeKind,
  target: AccessScopeKind,
): string | null {
  if (granter === AccessScopeKind.ALL) return null;
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

/** Grants of `target` that `granter` does not hold (domain, action), in catalogue order. */
export function matrixExcess(
  granter: AccessMatrix,
  target: AccessMatrix,
): Array<[GrantableDomain, AccessAction]> {
  const out: Array<[GrantableDomain, AccessAction]> = [];
  for (const [domain, actions] of Object.entries(target)) {
    if (!isGrantableDomain(domain) || !Array.isArray(actions)) continue;
    for (const action of ACCESS_ACTIONS) {
      if (actions.includes(action) && !grants(granter, domain, action)) {
        out.push([domain, action]);
      }
    }
  }
  return out;
}

/** French refusal for the rights a granter lacks, or null when there are none. */
export function matrixExcessRefusal(
  granter: AccessMatrix,
  target: AccessMatrix,
  profileLabel: string,
): string | null {
  const excess = matrixExcess(granter, target);
  if (excess.length === 0) return null;
  const list = excess
    .map(([d, a]) => `${DOMAIN_LABELS[d]} : ${ACTION_LABELS[a]}`)
    .join(', ');
  return `Accès refusé : le profil « ${profileLabel} » donne des droits que vous n'avez pas (${list}).`;
}

/**
 * Whether an institutional administrator is the programme's national
 * administrator: ALL scope and ADMINISTRATION:ADMINISTRER. It assigns any
 * profile without holding its rights (it manages accounts, it doesn't read
 * the farms' data): the matrix subset rule doesn't bind it.
 */
export function isNationalAdministrator(
  granter: Pick<InstitutionAccess, 'scopeKind' | 'matrix'>,
): boolean {
  return (
    granter.scopeKind === AccessScopeKind.ALL &&
    grants(granter.matrix, 'ADMINISTRATION', 'ADMINISTRER')
  );
}

/**
 * Whether an institutional administrator may grant (or create, edit) a
 * profile; null when allowed, else the French refusal:
 * - a profile reaching the journal (AUDIT domain or scope) is the platform
 *   admin's alone, so audit stays apart from administration;
 * - the scope kind within its own ({@link scopeKindRefusal});
 * - only rights its own matrix holds, except for the national administrator
 *   ({@link isNationalAdministrator}).
 */
export function grantRefusal(
  granter: Pick<InstitutionAccess, 'scopeKind' | 'matrix'>,
  profile: {
    scopeKind: AccessScopeKind;
    matrix: AccessMatrix | null;
    label: string;
  },
): string | null {
  const matrix = profile.matrix ?? {};
  if (profile.scopeKind === AccessScopeKind.AUDIT || matrix.AUDIT) {
    return "Accès refusé : seul l'administrateur de la plateforme attribue un profil d'audit.";
  }
  return (
    scopeKindRefusal(granter.scopeKind, profile.scopeKind) ??
    (isNationalAdministrator(granter)
      ? null
      : matrixExcessRefusal(granter.matrix, matrix, profile.label))
  );
}

/**
 * The parts of a membership scope outside the granter's own: provinces of a
 * PROVINCES scope, farms of a FARMS scope (by their province for a PROVINCES
 * granter, by id for a FARMS granter). An ALL granter has no excess.
 */
export function scopeExcess(
  granter: InstitutionAccess,
  target: {
    scopeKind: AccessScopeKind;
    provinceIds: readonly string[];
    farms: readonly { id: string; provinceId: string | null }[];
  },
): { provinceIds: string[]; farmIds: string[] } {
  if (granter.scopeKind === AccessScopeKind.ALL) {
    return { provinceIds: [], farmIds: [] };
  }
  const provinceIds =
    target.scopeKind === AccessScopeKind.PROVINCES
      ? target.provinceIds.filter(
          (id) =>
            granter.scopeKind !== AccessScopeKind.PROVINCES ||
            !granter.provinceIds.includes(id),
        )
      : [];
  const farmIds =
    target.scopeKind === AccessScopeKind.FARMS
      ? target.farms
          .filter((f) =>
            granter.scopeKind === AccessScopeKind.PROVINCES
              ? f.provinceId === null ||
                !granter.provinceIds.includes(f.provinceId)
              : granter.scopeKind === AccessScopeKind.FARMS
                ? !granter.farmIds.includes(f.id)
                : true,
          )
          .map((f) => f.id)
      : [];
  return { provinceIds, farmIds };
}

// POUFA lot A2 vet: parameter ownership is a matrix right, never a profile
// code (CDC §5.2 n° 25 « seuils réglés par les seuls services vétérinaires »;
// user decision: rights are admin-configurable). À valider DGE / vétérinaires.
/**
 * Right owning the parameters of an owner key (`ProgramParameter.ownerProfile`,
 * `reference-owners.ts`). The keys stay the seeded profile codes (DGE,
 * VETERINAIRE, ADMIN), so the catalogs and the stored rows keep working, but
 * who may change a value is resolved through the caller's matrix: any
 * profile the administration grants that right (with PARAMETRES:MODIFIER)
 * owns them. `closedToPlatform`: the platform admin reads, never changes.
 */
export interface ParameterOwnerRight {
  domain: GrantableDomain;
  action: AccessAction;
  closedToPlatform: boolean;
}

export const PARAMETER_OWNER_RIGHTS: Readonly<
  Record<string, ParameterOwnerRight>
> = {
  // Alert thresholds, the day mortality formula, sanitary conduct thresholds.
  VETERINAIRE: {
    domain: 'SANITAIRE',
    action: 'MODIFIER',
    closedToPlatform: true,
  },
  // Follow-up parameters (« la DGE fixe les paramètres de suivi »).
  DGE: { domain: 'PARAMETRES', action: 'VALIDER', closedToPlatform: false },
  // Technical settings of the programme administration (clock skew, SMS cap).
  ADMIN: {
    domain: 'ADMINISTRATION',
    action: 'ADMINISTRER',
    closedToPlatform: false,
  },
};

/** Owner keys whose parameters the platform admin may read but not change. */
export const OWNER_PROFILES_CLOSED_TO_PLATFORM: readonly string[] =
  Object.entries(PARAMETER_OWNER_RIGHTS)
    .filter(([, right]) => right.closedToPlatform)
    .map(([key]) => key);

/** The right owning `ownerProfile`'s parameters, null for an unknown key. */
export function parameterOwnerRight(
  ownerProfile: string,
): ParameterOwnerRight | null {
  return PARAMETER_OWNER_RIGHTS[ownerProfile] ?? null;
}

/** « Sanitaire : Modifier »: the owner right as the screens name it. */
export function ownerRightLabel(ownerProfile: string): string | null {
  const right = parameterOwnerRight(ownerProfile);
  return right
    ? `${DOMAIN_LABELS[right.domain]} : ${ACTION_LABELS[right.action]}`
    : null;
}

/**
 * Who records a new version of a parameter owned by `ownerProfile`: the
 * platform admin, for any owner not closed to it; an institutional account
 * whose matrix grants PARAMETRES:MODIFIER and the owner right; nobody else.
 */
export function mayChangeParameter(
  role: string,
  matrix: AccessMatrix | null,
  ownerProfile: string,
): boolean {
  const right = parameterOwnerRight(ownerProfile);
  if (role === UserRole.PLATFORM_ADMIN) {
    return right === null || !right.closedToPlatform;
  }
  if (role !== UserRole.INSTITUTION || !matrix || !right) return false;
  return (
    grants(matrix, 'PARAMETRES', 'MODIFIER') &&
    grants(matrix, right.domain, right.action)
  );
}

/**
 * French refusal of a parameter change (`what`: « le paramètre « X » »), or
 * null when the caller may change it.
 */
export function parameterChangeRefusal(
  role: string,
  matrix: AccessMatrix | null,
  ownerProfile: string,
  what: string,
): string | null {
  if (mayChangeParameter(role, matrix, ownerProfile)) return null;
  const right = ownerRightLabel(ownerProfile);
  const owner = right
    ? `relève du profil « ${ownerProfile} » (droits ${DOMAIN_LABELS.PARAMETRES} : ${ACTION_LABELS.MODIFIER} et ${right})`
    : `relève du profil « ${ownerProfile} »`;
  const platform =
    role === UserRole.PLATFORM_ADMIN
      ? ' ; l’administrateur de la plateforme le consulte seulement'
      : '';
  return `Accès refusé : ${what} ${owner}${platform}.`;
}
// End POUFA lot A2 vet.

/**
 * Who reads deactivated list items and localités (`?all=true`): the profiles
 * that manage them, from their matrix. Any ADMINISTRATION right (programme
 * lists, territories), PARAMETRES:MODIFIER (the profiles that maintain the
 * programme settings: DGE, veterinary services, programme administrator by
 * default) and, for the sanitary lists the vets maintain, SANITAIRE:MODIFIER.
 * Reading inactive reference items changes nothing: a broad rule is safe.
 */
export function mayReadInactiveItems(
  matrix: AccessMatrix,
  opts: { sanitaryList?: boolean } = {},
): boolean {
  if ((matrix.ADMINISTRATION?.length ?? 0) > 0) return true;
  if (grants(matrix, 'PARAMETRES', 'MODIFIER')) return true;
  return opts.sanitaryList === true && grants(matrix, 'SANITAIRE', 'MODIFIER');
}
