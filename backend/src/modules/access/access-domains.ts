/**
 * Access domains and actions of the institutional access matrix (POUFA plan
 * §5.2, CDC §3 and §8). Every controller declares its domain with
 * `@Domain(...)`; an institutional account reaches a route only when its
 * profile grants the route's action on that domain.
 */

/**
 * Programme domains: the ones an institutional profile may be granted.
 * PARAMETRES (programme parameters, lists in force) is split from
 * ADMINISTRATION (accounts, profiles, lists, territories) so that the DGE and
 * the veterinary services can own their thresholds without administering.
 */
export const PROGRAMME_DOMAINS = [
  'REGISTRE',
  'TECHNIQUE',
  'INTRANTS',
  'SANITAIRE',
  'DECLARATIONS',
  'ECONOMIQUE',
  'TRACABILITE',
  'PILOTAGE',
  'PARAMETRES',
  'AUDIT',
  'ADMINISTRATION',
] as const;

/**
 * Programme domains granted in consultation only. DECLARATIONS = « lire les
 * déclarations sanitaires des fermes de son périmètre » (CDC §3, agent
 * technique), read-only: creating, qualifying, validating and publishing stay
 * SANITAIRE:VALIDER (veterinary services).
 */
export const READ_ONLY_PROGRAMME_DOMAINS = ['DECLARATIONS'] as const;

/**
 * Fermia-only domains: the farm's own business (cash, sales operations,
 * Market, accounting, team and HR, crops, account self-service) and the
 * platform administration. Only the bonus ones of
 * {@link INSTITUTION_FERMIA_DOMAINS} are grantable to an institutional
 * profile; matrix validation refuses the others.
 */
export const FERMIA_DOMAINS = [
  'VENTES',
  'MARCHE',
  'COMPTABILITE',
  'EQUIPE',
  'CULTURES',
  'COMPTE',
  'PLATEFORME',
] as const;

/**
 * Fermia bonus domains an institutional profile may be granted (user
 * decision 2026-11-06: the government benefits from the caisse and sales,
 * the Market, the SYSCOHADA accounting and the HR files too), **in
 * consultation only**: the farm's business stays the farm's, so matrix
 * validation refuses any other action on them. The admin grants each one
 * separately; reads are journaled (`@AuditRead`), never masked.
 */
export const INSTITUTION_FERMIA_DOMAINS = [
  'VENTES',
  'MARCHE',
  'COMPTABILITE',
  'EQUIPE',
] as const;

/**
 * SESSION: routes about the caller himself (his own access profile). Open to
 * any institutional account holding an effective membership, never listed in
 * a matrix.
 */
export const SESSION_DOMAIN = 'SESSION' as const;

/**
 * REFERENCE: shared reference data every programme account needs to display
 * a screen (provinces and their localités, active list items). Open, like
 * SESSION, to any institutional account holding an effective membership,
 * whatever its matrix; never listed in a matrix. Writes on the same data stay
 * in their own domain (ADMINISTRATION).
 */
export const REFERENCE_DOMAIN = 'REFERENCE' as const;

/** Domains open to any effective membership, outside the matrix. */
export const MEMBER_DOMAINS: readonly string[] = [
  SESSION_DOMAIN,
  REFERENCE_DOMAIN,
];

export type ProgrammeDomain = (typeof PROGRAMME_DOMAINS)[number];
export type FermiaDomain = (typeof FERMIA_DOMAINS)[number];
export type InstitutionFermiaDomain =
  (typeof INSTITUTION_FERMIA_DOMAINS)[number];
/** Domains a matrix may hold: the programme ones and the Fermia bonus ones. */
export type GrantableDomain = ProgrammeDomain | InstitutionFermiaDomain;

/** Every domain a matrix may hold, in catalogue order. */
export const GRANTABLE_DOMAINS: readonly GrantableDomain[] = [
  ...PROGRAMME_DOMAINS,
  ...INSTITUTION_FERMIA_DOMAINS,
];
export type AccessDomain =
  | ProgrammeDomain
  | FermiaDomain
  | typeof SESSION_DOMAIN
  | typeof REFERENCE_DOMAIN;

export const ACCESS_ACTIONS = [
  'CONSULTER',
  'CREER',
  'MODIFIER',
  'VALIDER',
  'ADMINISTRER',
] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];

/** Access matrix of a profile: grantable domain → granted actions. */
export type AccessMatrix = Partial<Record<GrantableDomain, AccessAction[]>>;

/** Actions an institutional profile may hold on an {@link INSTITUTION_FERMIA_DOMAINS} or {@link READ_ONLY_PROGRAMME_DOMAINS} domain. */
export const FERMIA_GRANTABLE_ACTIONS: readonly AccessAction[] = ['CONSULTER'];

export const DOMAIN_LABELS: Readonly<Record<AccessDomain, string>> = {
  REGISTRE: 'Registre des fermes',
  TECHNIQUE: 'Suivi technique',
  INTRANTS: 'Intrants',
  SANITAIRE: 'Sanitaire',
  DECLARATIONS: 'Déclarations sanitaires (lecture)',
  ECONOMIQUE: 'Économique',
  TRACABILITE: 'Traçabilité',
  PILOTAGE: 'Pilotage et agrégats',
  PARAMETRES: 'Paramètres du programme',
  AUDIT: "Journal d'audit",
  ADMINISTRATION: 'Administration',
  VENTES: 'Ventes et caisse (Fermia)',
  MARCHE: 'Market (Fermia)',
  COMPTABILITE: 'Comptabilité (Fermia)',
  EQUIPE: 'Équipe et RH (Fermia)',
  CULTURES: 'Cultures (Fermia)',
  COMPTE: 'Compte Fermia',
  PLATEFORME: 'Administration de la plateforme Fermia',
  SESSION: 'Ma session',
  REFERENCE: 'Données de référence',
};

export const ACTION_LABELS: Readonly<Record<AccessAction, string>> = {
  CONSULTER: 'Consulter',
  CREER: 'Créer',
  MODIFIER: 'Modifier',
  VALIDER: 'Valider',
  ADMINISTRER: 'Administrer',
};

export function isAccessDomain(value: unknown): value is AccessDomain {
  return (
    typeof value === 'string' &&
    (MEMBER_DOMAINS.includes(value) ||
      (PROGRAMME_DOMAINS as readonly string[]).includes(value) ||
      (FERMIA_DOMAINS as readonly string[]).includes(value))
  );
}

export function isProgrammeDomain(value: unknown): value is ProgrammeDomain {
  return (
    typeof value === 'string' &&
    (PROGRAMME_DOMAINS as readonly string[]).includes(value)
  );
}

export function isInstitutionFermiaDomain(
  value: unknown,
): value is InstitutionFermiaDomain {
  return (
    typeof value === 'string' &&
    (INSTITUTION_FERMIA_DOMAINS as readonly string[]).includes(value)
  );
}

export function isReadOnlyProgrammeDomain(value: unknown): boolean {
  return (READ_ONLY_PROGRAMME_DOMAINS as readonly string[]).includes(
    value as string,
  );
}

/** A domain a matrix may hold (programme or Fermia bonus domain). */
export function isGrantableDomain(value: unknown): value is GrantableDomain {
  return isProgrammeDomain(value) || isInstitutionFermiaDomain(value);
}

/** Actions a matrix may hold on `domain` (consultation only on a Fermia domain). */
export function grantableActions(
  domain: GrantableDomain,
): readonly AccessAction[] {
  return isInstitutionFermiaDomain(domain) || isReadOnlyProgrammeDomain(domain)
    ? FERMIA_GRANTABLE_ACTIONS
    : ACCESS_ACTIONS;
}

export function isAccessAction(value: unknown): value is AccessAction {
  return (
    typeof value === 'string' &&
    (ACCESS_ACTIONS as readonly string[]).includes(value)
  );
}

/** Default action of a route: GET = consult, POST = create, other writes = modify. */
export function actionForMethod(method: string): AccessAction {
  switch (method.toUpperCase()) {
    case 'GET':
    case 'HEAD':
    case 'OPTIONS':
      return 'CONSULTER';
    case 'POST':
      return 'CREER';
    default:
      return 'MODIFIER';
  }
}
