/**
 * Institutional access of the programme (POUFA): access profiles, memberships
 * of institutional accounts, the caller's own access. Shapes of
 * `backend/src/modules/access` (`access-admin.service.ts`, `dto/access.dto.ts`).
 */

/** Programme domains an access profile may be granted (`PROGRAMME_DOMAINS`). */
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
export type AccessDomain = (typeof PROGRAMME_DOMAINS)[number];

/** Actions of the matrix, in the server's catalogue order (`ACCESS_ACTIONS`). */
export const ACCESS_ACTIONS = ['CONSULTER', 'CREER', 'MODIFIER', 'VALIDER', 'ADMINISTRER'] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];

export type ScopeKind = 'ALL' | 'PROVINCES' | 'FARMS' | 'FINANCED' | 'OPERATOR' | 'AGGREGATE' | 'AUDIT';

/** Domain → granted actions. A domain without actions is absent. */
export type AccessMatrix = Partial<Record<AccessDomain, AccessAction[]>>;

export interface CatalogEntry<C extends string = string> {
  code: C;
  label: string;
}

/** `GET /programme/access/catalog`. */
export interface AccessCatalog {
  domains: CatalogEntry<AccessDomain>[];
  actions: CatalogEntry<AccessAction>[];
  scopeKinds: CatalogEntry<ScopeKind>[];
}

/** `GET /programme/access/profiles` row. */
export interface AccessProfile {
  id: string;
  programId: string;
  code: string;
  label: string;
  scopeKind: ScopeKind;
  matrix: AccessMatrix;
  /** Seeded profile: tunable, never deleted, scope kind fixed. */
  system: boolean;
  createdAt: string;
  updatedAt: string;
}

/** `POST /programme/access/profiles`. */
export interface CreateProfileBody {
  code: string;
  label: string;
  scopeKind: ScopeKind;
  matrix: AccessMatrix;
}

/** `PATCH /programme/access/profiles/:id` (scope kind refused for a system profile). */
export interface UpdateProfileBody {
  label?: string;
  scopeKind?: ScopeKind;
  matrix?: AccessMatrix;
}

/** A membership as the administration lists it. */
export interface Membership {
  id: string;
  /** false: suspended by the administration. */
  active: boolean;
  /** End of validity (ISO); null: no limit. */
  validUntil: string | null;
  user: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    role: string;
    /** false: the account itself is suspended (platform). */
    active: boolean;
  } | null;
  profile: { id: string; code: string; label: string; scopeKind: ScopeKind } | null;
  provinceIds: string[];
  provinceCodes: string[];
  farmIds: string[];
  operatorId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Scope fields shared by the creation and the update of a membership. */
export interface MembershipScopeBody {
  provinceCodes?: string[];
  farmIds?: string[];
  /** ISO date-time in the future; null: no limit. */
  validUntil?: string | null;
}

/** `POST /programme/access/memberships`. */
export interface CreateMembershipBody extends MembershipScopeBody {
  fullName: string;
  phone: string;
  email?: string;
  profileCode: string;
}

/** `PATCH /programme/access/memberships/:id`. */
export interface UpdateMembershipBody extends MembershipScopeBody {
  profileCode?: string;
  active?: boolean;
}

/** Answer of the creation: the view plus the login code, shown once. */
export interface CreatedMembership extends Membership {
  loginCode: string;
}

/** `POST /admin/users/:userId/login-code` (platform admin): the new code, shown once. */
export interface LoginCodeReset {
  user: { id: string; fullName: string; phone: string };
  loginCode: string;
}

/** `GET /programme/access/me` (institutional account). */
export interface MyAccess {
  profile: {
    id: string;
    code: string;
    label: string;
    scopeKind: ScopeKind;
    matrix: AccessMatrix;
  };
  provinceCodes: string[];
  farmIds: string[];
  validUntil: string | null;
}

/** A province of `GET /programme/provinces` (localités left out). */
export interface ProvinceOption {
  id: string;
  code: string;
  name: string;
  sort: number;
}

/** A row of `GET /programme/farms` as the farm picker reads it. */
export interface FarmSearchItem {
  id: string;
  code: string | null;
  name: string;
  province: { id: string; code: string; name: string } | null;
  exploitantName: string | null;
}

/** `GET /programme/farms` page. */
export interface FarmSearchPage {
  total: number;
  page: number;
  pageSize: number;
  items: FarmSearchItem[];
}

/**
 * French labels of `access-domains.ts` / `SCOPE_KIND_LABELS`, for the screens
 * an account without the ADMINISTRATION domain opens (it can't read the
 * catalogue). The administration screens use the catalogue's labels.
 */
export const DOMAIN_LABELS: Readonly<Record<AccessDomain, string>> = {
  REGISTRE: 'Registre des fermes',
  TECHNIQUE: 'Suivi technique',
  INTRANTS: 'Intrants',
  SANITAIRE: 'Sanitaire',
  ECONOMIQUE: 'Économique',
  TRACABILITE: 'Traçabilité',
  PILOTAGE: 'Pilotage et agrégats',
  PARAMETRES: 'Paramètres du programme',
  AUDIT: 'Journal d’audit',
  ADMINISTRATION: 'Administration',
};

export const ACTION_LABELS: Readonly<Record<AccessAction, string>> = {
  CONSULTER: 'Consulter',
  CREER: 'Créer',
  MODIFIER: 'Modifier',
  VALIDER: 'Valider',
  ADMINISTRER: 'Administrer',
};

export const SCOPE_KIND_LABELS: Readonly<Record<ScopeKind, string>> = {
  ALL: 'Toutes les fermes du programme',
  PROVINCES: 'Fermes de ses provinces',
  FARMS: 'Ses fermes',
  FINANCED: 'Fermes financées (avec consentement)',
  OPERATOR: 'Lots qui le concernent (opérateur)',
  AGGREGATE: 'Données agrégées seulement',
  AUDIT: 'Journal d’audit seulement',
};
