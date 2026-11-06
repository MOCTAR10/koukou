import type { Role } from '../../api/client';
import type { MyAccess } from '../../api/types-access';
import { grantsAccess, scopeReachesFarms } from '../../app/menu-access';

type Profile = Pick<MyAccess['profile'], 'matrix' | 'scopeKind'>;

/** What the programme deliveries screen (`/app/intrants`) offers. The server stays the authority. */
export interface ProgrammeDeliveryRights {
  /** `GET /programme/input-deliveries[/:id]` (INTRANTS:CONSULTER). */
  view: boolean;
  /** Record (`POST`) and cancel (`POST …/cancel`, `@Action('CREER')`): INTRANTS:CREER on a scope reaching farms. */
  record: boolean;
}

/**
 * Programme side: the platform admin, or an institution whose profile grants
 * INTRANTS (Consulter to read, Créer to record and cancel; a scope that
 * reaches no farm gets a 403 from the service). Farm accounts: none.
 */
export function programmeDeliveryRights(role: Role | null | undefined, access: Profile | null | undefined): ProgrammeDeliveryRights {
  if (role === 'PLATFORM_ADMIN') return { view: true, record: true };
  if (role !== 'INSTITUTION' || !access || !scopeReachesFarms(access.scopeKind)) return { view: false, record: false };
  return { view: grantsAccess(access, 'INTRANTS', 'CONSULTER'), record: grantsAccess(access, 'INTRANTS', 'CREER') };
}

/** What the farm's deliveries screen offers. */
export interface FarmDeliveryRights {
  /** Confirm the reception and link a band (`stock:gerer`; the farmer only: never an institution nor the platform admin). */
  confirm: boolean;
  /** Open the band after chicks (`POST /farms/:farmId/batches`, `production:gerer`). */
  openBand: boolean;
}

/**
 * Farm side: who records a delivery never confirms it (separation of duties,
 * `FARMER_CONFIRMS_MESSAGE` on the server), so the confirmation is the owner's
 * or a member's with `stock:gerer`; an ELEVEUR (fixed rights, no
 * `stock:gerer`) reads.
 */
export function farmDeliveryRights(role: Role | null | undefined, hasPermission: (...codes: string[]) => boolean): FarmDeliveryRights {
  const farmer = role === 'PROPRIETAIRE' || role === 'ELEVEUR';
  const confirm = farmer && hasPermission('stock:gerer');
  return { confirm, openBand: confirm && hasPermission('production:gerer') };
}
