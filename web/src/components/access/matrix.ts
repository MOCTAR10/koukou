import {
  ACCESS_ACTIONS,
  PROGRAMME_DOMAINS,
  type AccessAction,
  type AccessDomain,
  type AccessMatrix,
  type ScopeKind,
} from '../../api/types-access';

/**
 * Pure rules of the access administration screens: the matrix editor, the
 * scope fields of a membership and its status. The server stays the
 * authority (`access-rules.ts` `validateMatrix`, `access-admin.service.ts`):
 * these only keep the form from sending what it would refuse.
 */

/** The matrix as checked cells (`DOMAIN:ACTION`), for the grid. */
export type MatrixCells = ReadonlySet<string>;

export const cellKey = (domain: AccessDomain, action: AccessAction): string => `${domain}:${action}`;

export function cellsOf(matrix: AccessMatrix | null | undefined): Set<string> {
  const cells = new Set<string>();
  for (const domain of PROGRAMME_DOMAINS) {
    for (const action of matrix?.[domain] ?? []) cells.add(cellKey(domain, action));
  }
  return cells;
}

/** A copy of the cells with one cell switched. */
export function toggleCell(cells: MatrixCells, domain: AccessDomain, action: AccessAction): Set<string> {
  const next = new Set(cells);
  const key = cellKey(domain, action);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** A copy of the cells with a whole domain on (every action) or off. */
export function setDomain(cells: MatrixCells, domain: AccessDomain, on: boolean): Set<string> {
  const next = new Set(cells);
  for (const action of ACCESS_ACTIONS) {
    if (on) next.add(cellKey(domain, action));
    else next.delete(cellKey(domain, action));
  }
  return next;
}

/**
 * The matrix the server stores: domains and actions in catalogue order,
 * empty domains dropped, cells the scope kind can't hold left out.
 */
export function matrixOf(cells: MatrixCells, scopeKind: ScopeKind): AccessMatrix {
  const matrix: AccessMatrix = {};
  for (const domain of PROGRAMME_DOMAINS) {
    if (!domainAllowed(domain, scopeKind)) continue;
    const actions = ACCESS_ACTIONS.filter((a) => cells.has(cellKey(domain, a)));
    if (actions.length > 0) matrix[domain] = actions;
  }
  return matrix;
}

/** The server keeps the journal apart: AUDIT belongs to an AUDIT scope profile, which holds nothing else. */
export function domainAllowed(domain: AccessDomain, scopeKind: ScopeKind): boolean {
  return scopeKind === 'AUDIT' ? domain === 'AUDIT' : domain !== 'AUDIT';
}

/** Why a row of the grid is locked for this scope kind (null: open). */
export function domainLockReason(domain: AccessDomain, scopeKind: ScopeKind): string | null {
  if (domainAllowed(domain, scopeKind)) return null;
  return scopeKind === 'AUDIT'
    ? 'Un profil d’audit ne donne accès qu’au journal.'
    : 'Réservé à un profil de périmètre « Journal d’audit ».';
}

/**
 * Domains granting some action but not « Consulter »: their screens stay out
 * of the account's menu (every screen reads first), worth a warning.
 */
export function domainsWithoutConsult(matrix: AccessMatrix): AccessDomain[] {
  return PROGRAMME_DOMAINS.filter((d) => {
    const actions = matrix[d];
    return !!actions && actions.length > 0 && !actions.includes('CONSULTER');
  });
}

/** Number of granted cells (list summary). */
export function grantCount(matrix: AccessMatrix): number {
  return PROGRAMME_DOMAINS.reduce((n, d) => n + (matrix[d]?.length ?? 0), 0);
}

/** Same grants, whatever the order: tells whether the form changed the matrix. */
export function sameMatrix(a: AccessMatrix, b: AccessMatrix): boolean {
  const ca = cellsOf(a);
  const cb = cellsOf(b);
  return ca.size === cb.size && [...ca].every((c) => cb.has(c));
}

/** Server rule of `CreateAccessProfileDto.code`. */
export const PROFILE_CODE_RE = /^[A-Z][A-Z0-9_]{1,39}$/;

export function normalizeProfileCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function profileCodeError(code: string): string | null {
  if (!code) return 'Le code du profil est obligatoire.';
  if (!PROFILE_CODE_RE.test(code)) {
    return 'Le code du profil : 2 à 40 caractères, lettres majuscules, chiffres et « _ », commençant par une lettre.';
  }
  return null;
}

/** OPERATOR opens with the traceability module: the server refuses it for now. */
export function scopeKindOpen(kind: ScopeKind): boolean {
  return kind !== 'OPERATOR';
}

// ----- Memberships -----

/** Which scope list a membership needs for its profile's scope kind. */
export type ScopeRequirement = 'provinces' | 'farms' | 'none';

export function scopeRequirement(kind: ScopeKind | null | undefined): ScopeRequirement {
  if (kind === 'PROVINCES') return 'provinces';
  if (kind === 'FARMS') return 'farms';
  return 'none';
}

/** What a scope kind gives, for the account form and the account's own screen. */
export function scopeKindNote(kind: ScopeKind): string {
  switch (kind) {
    case 'ALL':
      return 'Toutes les fermes du programme, sans liste à tenir.';
    case 'PROVINCES':
      return 'Les fermes des provinces choisies, y compris celles enregistrées plus tard.';
    case 'FARMS':
      return 'Seulement les fermes choisies une à une.';
    case 'FINANCED':
      return 'Les fermes financées dont l’exploitant a donné son consentement. Le consentement n’est pas encore en place : aucune ferme pour l’instant.';
    case 'OPERATOR':
      return 'Les lots qui concernent l’opérateur : ouvert avec le module de traçabilité.';
    case 'AGGREGATE':
      return 'Des données agrégées seulement : aucune fiche de ferme.';
    case 'AUDIT':
      return 'Le journal d’audit seulement : aucune donnée de ferme.';
  }
}

/** French error when the scope list required by the kind is empty (server: 400). */
export function membershipScopeError(kind: ScopeKind | null | undefined, provinceCodes: string[], farmIds: string[]): string | null {
  const need = scopeRequirement(kind);
  if (need === 'provinces' && provinceCodes.length === 0) return 'Choisissez au moins une province.';
  if (need === 'farms' && farmIds.length === 0) return 'Choisissez au moins une ferme.';
  if (kind === 'OPERATOR') return 'Le périmètre « opérateur » sera ouvert avec le module de traçabilité.';
  return null;
}

/** Only the list the scope kind reads is sent: the server ignores the others. */
export function scopeFieldsOf(kind: ScopeKind | null | undefined, provinceCodes: string[], farmIds: string[]): { provinceCodes?: string[]; farmIds?: string[] } {
  const need = scopeRequirement(kind);
  if (need === 'provinces') return { provinceCodes: [...provinceCodes] };
  if (need === 'farms') return { farmIds: [...farmIds] };
  return {};
}

/**
 * `validUntil` from a date field (`YYYY-MM-DD`): the end of that day, local
 * time, so a membership « valid until the 31st » still opens on the 31st.
 * Empty: no limit (null).
 */
export function validUntilFromDate(date: string): string | null {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
}

/** The date field's value (`YYYY-MM-DD`, local) for a stored `validUntil`. */
export function dateFromValidUntil(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/** Server rule: the end of validity is in the future. */
export function validUntilError(date: string, now: Date = new Date()): string | null {
  const iso = validUntilFromDate(date);
  if (!iso) return null;
  return new Date(iso).getTime() <= now.getTime() ? 'La fin de validité doit être dans le futur.' : null;
}

export type MembershipStatus = 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'ACCOUNT_SUSPENDED';

export const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, string> = {
  ACTIVE: 'Actif',
  EXPIRED: 'Expiré',
  SUSPENDED: 'Suspendu',
  ACCOUNT_SUSPENDED: 'Compte suspendu',
};

/** Same rule as the server's `isMembershipEffective`, plus the account's own suspension. */
export function membershipStatus(
  m: { active: boolean; validUntil: string | null; user: { active: boolean } | null },
  now: Date = new Date(),
): MembershipStatus {
  if (!m.active) return 'SUSPENDED';
  if (m.user && !m.user.active) return 'ACCOUNT_SUSPENDED';
  if (m.validUntil && new Date(m.validUntil).getTime() <= now.getTime()) return 'EXPIRED';
  return 'ACTIVE';
}

export interface MembershipFilters {
  profileCode: string;
  /** Province code ('' = all). */
  province: string;
  status: '' | 'ACTIVE' | 'INACTIVE';
  /** Name, phone or e-mail. */
  q: string;
}

export const NO_FILTERS: MembershipFilters = { profileCode: '', province: '', status: '', q: '' };

/**
 * Whether a membership passes the list filters. Province: accounts whose
 * scope covers it (ALL covers every province; FARMS through the provinces of
 * its farms, when known).
 */
export function membershipMatches(
  m: {
    active: boolean;
    validUntil: string | null;
    user: { fullName: string; phone: string; email: string | null; active: boolean } | null;
    profile: { code: string; scopeKind: ScopeKind } | null;
    provinceCodes: string[];
    farmIds: string[];
  },
  f: MembershipFilters,
  farmProvinceCode: (farmId: string) => string | null = () => null,
  now: Date = new Date(),
): boolean {
  if (f.profileCode && m.profile?.code !== f.profileCode) return false;
  if (f.status) {
    const active = membershipStatus(m, now) === 'ACTIVE';
    if ((f.status === 'ACTIVE') !== active) return false;
  }
  if (f.province) {
    const kind = m.profile?.scopeKind;
    const covered =
      kind === 'ALL' ||
      (kind === 'PROVINCES' && m.provinceCodes.includes(f.province)) ||
      (kind === 'FARMS' && m.farmIds.some((id) => farmProvinceCode(id) === f.province));
    if (!covered) return false;
  }
  const q = f.q.trim().toLowerCase();
  if (q) {
    const digits = q.replace(/\D/g, '');
    const u = m.user;
    const hit =
      !!u &&
      (u.fullName.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        (digits.length >= 3 && u.phone.replace(/\D/g, '').includes(digits)));
    if (!hit) return false;
  }
  return true;
}

/**
 * Phone of a new institutional account: a Gabon number is stored as
 * 0XXXXXXXX (sign-in normalizes the same way), an international one (`+…`)
 * as typed without separators (server rule `^\+?\d{8,15}$`).
 */
export function membershipPhone(raw: string): { phone: string } | { error: string } {
  const typed = raw.trim();
  if (!typed) return { error: 'Le téléphone est obligatoire.' };
  if (typed.startsWith('+')) {
    const intl = `+${typed.slice(1).replace(/\D/g, '')}`;
    if (intl.startsWith('+241')) return membershipPhone(intl.slice(4));
    return /^\+\d{8,15}$/.test(intl) ? { phone: intl } : { error: 'Numéro de téléphone invalide.' };
  }
  let n = typed.replace(/\D/g, '');
  if (n.startsWith('241') && n.length >= 11) n = n.slice(3);
  if (n.length === 8 && n[0] !== '0') n = `0${n}`;
  return /^0\d{8}$/.test(n) ? { phone: n } : { error: 'Numéro gabonais attendu : 9 chiffres commençant par 0 (ex. 074 12 34 56), ou un numéro international en +…' };
}
