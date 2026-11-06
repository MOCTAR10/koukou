// POUFA F5 (audit A4): a programme delivery already shipped (EXPEDIEE) must be
// confirmed from « Mes livraisons », not typed again as a manual reception.
// Typed by hand, it is counted at full price (the subsidy is lost) and the
// declarative stock never sees it. This matcher finds the pending delivery
// lines that a manual reception looks like.

import type { DeliveryLineView, DeliveryView } from '../../api/types-supply';

/** The manual reception kinds (`FeedEntryType`), plus the chicks of a band opening. */
export type ManualReceptionKind = 'BAG' | 'BULKER' | 'MATIERE_PREMIERE' | 'MEDICAMENT' | 'POUSSINS';

export const STATE_DELIVERY_QUESTION = 'Est-ce une livraison de l’État ?';

export const STATE_DELIVERY_HINT =
  'Une livraison du programme expédiée à votre ferme se confirme depuis « Mes livraisons » : elle entre alors au stock avec sa subvention.';

export const MANUAL_DUPLICATE_WARNING =
  'Ce produit correspond à une livraison de l’État en attente. Saisi ici, il sera compté au prix plein, la subvention sera perdue et le stock déclaratif sera faux. Confirmez plutôt la livraison.';

/** Delivery families each manual kind may duplicate. */
const FAMILIES: Record<ManualReceptionKind, readonly string[]> = {
  BAG: ['ALIMENT'],
  BULKER: ['ALIMENT'],
  MATIERE_PREMIERE: ['ALIMENT'],
  POUSSINS: ['POUSSIN'],
  MEDICAMENT: ['VACCIN', 'MEDICAMENT', 'AUTRE'],
};

export interface StateDeliveryMatch {
  delivery: DeliveryView;
  line: DeliveryLineView;
}

/**
 * Pending delivery lines the manual reception matches: same family, and for
 * feed the same phase when both sides know it.
 */
export function matchStateDeliveries(
  kind: ManualReceptionKind,
  feedPhase: string | null | undefined,
  deliveries: readonly DeliveryView[],
): StateDeliveryMatch[] {
  const families = FAMILIES[kind];
  const phase = families.includes('ALIMENT') && feedPhase ? feedPhase : null;
  const out: StateDeliveryMatch[] = [];
  for (const delivery of deliveries) {
    if (delivery.status !== 'EXPEDIEE') continue;
    for (const line of delivery.lines) {
      if (!families.includes(line.intrantFamily)) continue;
      if (phase && line.feedPhase && line.feedPhase !== phase) continue;
      out.push({ delivery, line });
    }
  }
  return out;
}

/** The pending deliveries only, oldest shipping first. */
export function pendingStateDeliveries(deliveries: readonly DeliveryView[]): DeliveryView[] {
  return deliveries
    .filter((d) => d.status === 'EXPEDIEE')
    .slice()
    .sort((a, b) => a.shippedAt.localeCompare(b.shippedAt) || a.code.localeCompare(b.code));
}
