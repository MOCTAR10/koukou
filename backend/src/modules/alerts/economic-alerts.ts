import { AlertKind } from '../../common/enums/alert-level.enum.js';

/**
 * Alert kinds that carry economic data (margin, net result, unsold stock):
 * served only to readers of the economic domain (POUFA audit F6). An
 * institution without ECONOMIQUE:CONSULTER (the agent technique by default)
 * gets the other alerts of the farm. Pure, unit-tested.
 */
export const ECONOMIC_ALERT_KINDS: ReadonlySet<AlertKind> = new Set([
  AlertKind.RENTABILITE,
  AlertKind.VENTE,
]);

/** The alerts `readsEconomics` may see: all of them, or the non-economic ones. */
export function visibleAlerts<T extends { kind: AlertKind }>(
  alerts: readonly T[],
  readsEconomics: boolean,
): T[] {
  return readsEconomics
    ? [...alerts]
    : alerts.filter((a) => !ECONOMIC_ALERT_KINDS.has(a.kind));
}
