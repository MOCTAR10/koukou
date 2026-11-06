// Gating of the POUFA field screens. Rights come from the server: the farm
// profile codes (`useFarmProfile`) and, for an institution, the access matrix
// of `GET /programme/access/me`. These helpers only mirror server rules so a
// button the server would refuse is not offered; the server stays the
// authority (403 messages are shown as they come).
import type { AccessAction, AccessDomain, AccessMatrix } from '@/api/poufa';
import type { UserRole } from '@/api/types';

/** Same rule as the backend `grants` (access-rules.ts): the domain lists the action. */
export function matrixGrants(matrix: AccessMatrix | null | undefined, domain: AccessDomain, action: AccessAction): boolean {
  return !!matrix?.[domain]?.includes(action);
}

/**
 * May read a programme domain route that carries no farm permission code
 * (deliveries, declarative stock): every farm account does; an institution
 * needs `domain:CONSULTER` in its matrix (unknown matrix = no).
 */
export function readsProgrammeDomain(role: UserRole | undefined, matrix: AccessMatrix | null | undefined, domain: AccessDomain): boolean {
  if (role === 'PROPRIETAIRE' || role === 'ELEVEUR' || role === 'PLATFORM_ADMIN') return true;
  if (role === 'INSTITUTION') return matrixGrants(matrix, domain, 'CONSULTER');
  return false;
}

/**
 * Confirming a delivery: `stock:gerer` and the farmer himself. The service
 * refuses institutions and the platform admin (separation of duties: who
 * records a delivery never confirms it), so they never get the button.
 */
export function canConfirmDeliveries(role: UserRole | undefined, hasStockRight: boolean): boolean {
  return (role === 'PROPRIETAIRE' || role === 'ELEVEUR') && hasStockRight;
}

/**
 * `PUT /programme/farms/:farmId/gps`: platform admin, or an institution whose
 * matrix grants REGISTRE:MODIFIER (farm in scope, checked by the server).
 * The owner is refused by the route today (backend gap, see the report).
 */
export function canSetFarmGps(role: UserRole | undefined, matrix: AccessMatrix | null | undefined): boolean {
  if (role === 'PLATFORM_ADMIN') return true;
  if (role === 'INSTITUTION') return matrixGrants(matrix, 'REGISTRE', 'MODIFIER');
  return false;
}

/** The notification inbox is a SESSION route: any signed-in account but a buyer or operator. */
export function hasInbox(role: UserRole | undefined): boolean {
  return role === 'PROPRIETAIRE' || role === 'ELEVEUR' || role === 'PLATFORM_ADMIN' || role === 'INSTITUTION';
}
