import type { Role } from '../../api/client';
import type { MyAccess } from '../../api/types-access';
import { grantsAccess } from '../../app/menu-access';

type Profile = Pick<MyAccess['profile'], 'matrix' | 'scopeKind'>;

/** What the steering screens offer. The server stays the authority (scope, matrix, 403). */
export interface PilotageRights {
  /** Dashboard, map, objective, templates and runs (`PILOTAGE:CONSULTER`). */
  view: boolean;
  /** AGGREGATE scope (MAEDR): no farm row anywhere, small groups hidden. */
  aggregateOnly: boolean;
  /** Farm and band exports, farm points on the map (refused to an aggregate-only view). */
  farmRows: boolean;
  /** `PATCH /pilotage/reports/templates/:code` (`PILOTAGE:ADMINISTRER`). */
  editTemplates: boolean;
  /** `POST /pilotage/reports/templates/:code/runs` (POST = `PILOTAGE:CREER`). */
  generate: boolean;
  /** `GET /pilotage/reports/runs`: the steering profiles, and a farm account for its own bands' reports. */
  runs: boolean;
}

const NONE: PilotageRights = { view: false, aggregateOnly: false, farmRows: false, editTemplates: false, generate: false, runs: false };

/**
 * Steering rights per account, mirroring the server (`@Domain('PILOTAGE')`,
 * `@Roles(PLATFORM_ADMIN)` + `ProgramAccessGuard`: GET = CONSULTER, POST =
 * CREER, PATCH with `@Action('ADMINISTRER')`): the platform admin has them
 * all; an INSTITUTION gets them from its access profile; a farm owner or
 * member only reads the end-of-band reports of his farms (`restrictRuns`).
 * Unreadable access (offline, never loaded): nothing.
 */
export function pilotageRights(role: Role | null | undefined, access?: Profile | null): PilotageRights {
  if (role === 'PLATFORM_ADMIN') {
    return { view: true, aggregateOnly: false, farmRows: true, editTemplates: true, generate: true, runs: true };
  }
  if (role === 'PROPRIETAIRE' || role === 'ELEVEUR') return { ...NONE, runs: true };
  if (role !== 'INSTITUTION' || !access) return NONE;
  const view = grantsAccess(access, 'PILOTAGE', 'CONSULTER');
  const aggregateOnly = access.scopeKind === 'AGGREGATE';
  return {
    view,
    aggregateOnly,
    farmRows: view && !aggregateOnly,
    editTemplates: grantsAccess(access, 'PILOTAGE', 'ADMINISTRER'),
    generate: grantsAccess(access, 'PILOTAGE', 'CREER'),
    runs: view,
  };
}

/**
 * Who may correct a closed band (`POST …/bandes/:batchId/corrections`,
 * `@Roles(PLATFORM_ADMIN)` + `@Action('ADMINISTRER')` on domain TECHNIQUE):
 * the platform admin, or an institution whose profile the administration
 * granted TECHNIQUE + ADMINISTRER (no default profile has it). The server
 * also checks the farm is in scope.
 */
export function canCorrectClosedBand(role: Role | null | undefined, access?: Profile | null): boolean {
  if (role === 'PLATFORM_ADMIN') return true;
  return role === 'INSTITUTION' && !!access && grantsAccess(access, 'TECHNIQUE', 'ADMINISTRER');
}
