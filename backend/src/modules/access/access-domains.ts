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
  'ECONOMIQUE',
  'TRACABILITE',
  'PILOTAGE',
  'PARAMETRES',
  'AUDIT',
  'ADMINISTRATION',
] as const;

/**
 * Fermia-only domains: the farm's own business (cash, sales operations,
 * Market, accounting, team and HR, crops, account self-service) and the
 * platform administration. They are never grantable to an institutional
 * profile: matrix validation refuses them.
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
 * SESSION: routes about the caller himself (his own access profile). Open to
 * any institutional account holding an effective membership, never listed in
 * a matrix.
 */
export const SESSION_DOMAIN = 'SESSION' as const;

export type ProgrammeDomain = (typeof PROGRAMME_DOMAINS)[number];
export type FermiaDomain = (typeof FERMIA_DOMAINS)[number];
export type AccessDomain =
  ProgrammeDomain | FermiaDomain | typeof SESSION_DOMAIN;

export const ACCESS_ACTIONS = [
  'CONSULTER',
  'CREER',
  'MODIFIER',
  'VALIDER',
  'ADMINISTRER',
] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];

/** Access matrix of a profile: programme domain → granted actions. */
export type AccessMatrix = Partial<Record<ProgrammeDomain, AccessAction[]>>;

export const DOMAIN_LABELS: Readonly<Record<AccessDomain, string>> = {
  REGISTRE: 'Registre des fermes',
  TECHNIQUE: 'Suivi technique',
  INTRANTS: 'Intrants',
  SANITAIRE: 'Sanitaire',
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
    (value === SESSION_DOMAIN ||
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
