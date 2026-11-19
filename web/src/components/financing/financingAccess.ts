import type { Role } from '../../api/client';
import type { MyAccess } from '../../api/types-access';
import { FINANCING_PATH, grantsAccess, scopeReachesFarms } from '../../app/menu-access';

export { FINANCING_PATH };

/**
 * Rights of the bank's financer workspace (matrix domain FINANCEMENT), same
 * pattern as `economieRights`: decided from the matrix and the scope only,
 * never from a profile code. The server stays the authority (and resolves the
 * farms of the FINANCED scope).
 *
 * CONSULTER reads everything; CREER opens a file, files a document, records a
 * repayment and a signed paper consent; MODIFIER edits terms, schedule,
 * tranches; VALIDER passes a step, decides, releases a tranche, reviews a
 * document, manages the checklist and the consent template.
 */
export interface FinancingAccess {
  view: boolean;
  create: boolean;
  edit: boolean;
  validate: boolean;
  /** COMPTABILITE: Consulter, besides FINANCEMENT: the farm's financial statements (SYSCOHADA). */
  financials: boolean;
}

const NONE: FinancingAccess = { view: false, create: false, edit: false, validate: false, financials: false };

export function financingRights(
  role: Role | null | undefined,
  access?: Pick<MyAccess['profile'], 'matrix' | 'scopeKind'> | null,
): FinancingAccess {
  if (role === 'PLATFORM_ADMIN') return { view: true, create: true, edit: true, validate: true, financials: true };
  if (role !== 'INSTITUTION' || !access) return NONE;
  if (!scopeReachesFarms(access.scopeKind) || !grantsAccess(access, 'FINANCEMENT', 'CONSULTER')) return NONE;
  return {
    view: true,
    create: grantsAccess(access, 'FINANCEMENT', 'CREER'),
    edit: grantsAccess(access, 'FINANCEMENT', 'MODIFIER'),
    validate: grantsAccess(access, 'FINANCEMENT', 'VALIDER'),
    financials: grantsAccess(access, 'COMPTABILITE', 'CONSULTER'),
  };
}

export const FINANCING_FILES_PATH = '/app/financement/dossiers';
export const FINANCING_CONSENTS_PATH = '/app/financement/consentements';
export const FINANCING_FRAMEWORK_PATH = '/app/financement/cadre';
/** The farmer's own page (farm space). */
export const FARM_FINANCING_PATH = '/app/financement-ferme';

/**
 * Whether to ask `GET /farms/:id/financing` at all. The farm's owner and staff always may; an institution only
 * when its farm profile (`/farms/:id/me`) holds `saisie:creer` (delegated entry), as the server answers 403 to
 * every other institution. An unread profile is not a yes: no request until it is known.
 */
export function farmFinancingEnabled(
  role: Role | null | undefined,
  farmPermissions: readonly string[] | null | undefined,
  spaceReady: boolean,
): boolean {
  if (!spaceReady) return false;
  if (role === 'PROPRIETAIRE' || role === 'ELEVEUR') return true;
  if (role === 'INSTITUTION') return !!farmPermissions && (farmPermissions.includes('saisie:creer') || farmPermissions.includes('*'));
  return false;
}

export const farm360Path = (farmId: string): string => `${FINANCING_PATH}/fermes/${farmId}`;
export const filePath = (fileId: string): string => `${FINANCING_FILES_PATH}?dossier=${encodeURIComponent(fileId)}`;

/** Programme-wide financing pages (no farm picker, no quick actions): the farmer's page is not one. */
export function isFinancingPath(pathname: string): boolean {
  return pathname === FINANCING_PATH || pathname.startsWith(`${FINANCING_PATH}/`);
}

export interface FinancingEntry {
  to: string;
  label: string;
  kind: 'portfolio' | 'files' | 'consents' | 'framework';
}

/** Menu group « Financement », in display order. */
export const FINANCING_ENTRIES: readonly FinancingEntry[] = [
  { to: FINANCING_PATH, label: 'Portefeuille', kind: 'portfolio' },
  { to: FINANCING_FILES_PATH, label: 'Dossiers', kind: 'files' },
  { to: FINANCING_CONSENTS_PATH, label: 'Consentements', kind: 'consents' },
  { to: FINANCING_FRAMEWORK_PATH, label: 'Pièces et cadre', kind: 'framework' },
];

/** Header title of a financing page. */
export function financingHeader(pathname: string): string {
  if (pathname.startsWith(FINANCING_FILES_PATH)) return 'Dossiers de financement';
  if (pathname.startsWith(FINANCING_CONSENTS_PATH)) return 'Consentements des exploitants';
  if (pathname.startsWith(FINANCING_FRAMEWORK_PATH)) return 'Pièces et cadre réglementaire';
  if (pathname.startsWith(`${FINANCING_PATH}/fermes/`)) return 'Vue 360° d’une ferme';
  return 'Portefeuille de financement';
}
