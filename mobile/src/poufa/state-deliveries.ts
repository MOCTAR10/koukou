// POUFA lot A bande (F5): a manual stock reception that duplicates a state
// delivery still waiting for confirmation. Saved by hand, the input is counted
// at full price and the subsidy of the delivery is lost. Pure.
import type { DeliveryLineView, DeliveryView } from '@/api/poufa';

import { lineLabel, pendingDeliveries } from './deliveries';

/** Manual reception types (stock `FeedEntryType`, plus chicks). */
export type ManualEntryType = 'BULKER' | 'BAG' | 'MATIERE_PREMIERE' | 'MEDICAMENT' | 'POUSSINS';

/** Intrant families (programme list INTRANT) a manual type can duplicate. */
const FAMILIES_BY_ENTRY: Record<ManualEntryType, readonly string[]> = {
  BAG: ['ALIMENT'],
  BULKER: ['ALIMENT'],
  MATIERE_PREMIERE: ['ALIMENT'],
  POUSSINS: ['POUSSIN'],
  MEDICAMENT: ['VACCIN', 'MEDICAMENT', 'AUTRE'],
};

export const STATE_DELIVERY_QUESTION = 'Est-ce une livraison de l’État ?';

export interface PendingLineMatch {
  delivery: DeliveryView;
  line: DeliveryLineView;
}

/** A feed phase both sides know (a custom phase compares as unknown). */
function knownPhase(phase: string | null | undefined): string | null {
  return phase && phase !== 'PERSONNALISE' ? phase : null;
}

/**
 * Lines of the pending (EXPEDIEE) deliveries the manual reception looks like:
 * same family, and the same feed phase when both are known. Oldest shipping first.
 */
export function pendingDeliveryMatches(
  entryType: ManualEntryType,
  feedPhase: string | null | undefined,
  deliveries: readonly DeliveryView[],
): PendingLineMatch[] {
  const families = FAMILIES_BY_ENTRY[entryType] ?? [];
  const phase = knownPhase(feedPhase);
  const out: PendingLineMatch[] = [];
  for (const delivery of pendingDeliveries(deliveries)) {
    for (const line of delivery.lines.slice().sort((a, b) => a.position - b.position)) {
      if (!families.includes(line.intrantFamily)) continue;
      const linePhase = knownPhase(line.feedPhase);
      if (phase && linePhase && phase !== linePhase) continue;
      out.push({ delivery, line });
    }
  }
  return out;
}

/** The first matching line, or null. */
export function pendingDeliveryMatch(
  entryType: ManualEntryType,
  feedPhase: string | null | undefined,
  deliveries: readonly DeliveryView[],
): PendingLineMatch | null {
  return pendingDeliveryMatches(entryType, feedPhase, deliveries)[0] ?? null;
}

/** « Livraison L-0001 du 05/11/2026 · 2 lignes », for the prompt list. */
export function pendingDeliveryLabel(d: DeliveryView): string {
  const [y, m, day] = d.shippedAt.slice(0, 10).split('-');
  const n = d.lines.length;
  return `Livraison ${d.code} du ${day}/${m}/${y} · ${n} ligne${n > 1 ? 's' : ''}`;
}

function fmtQty(n: number): string {
  return String(Math.round(n * 1000) / 1000).replace('.', ',');
}

/** Why the manual reception should not be saved, in French. */
export function duplicateDeliveryWarning(m: PendingLineMatch): string {
  const unit = m.line.unitLabel ?? m.line.unitCode;
  return (
    `Cette entrée ressemble à la livraison ${m.delivery.code} en attente de confirmation ` +
    `(${lineLabel(m.line)}, ${fmtQty(m.line.quantity)} ${unit.toLowerCase()}). ` +
    'Saisie à la main, elle est comptée au prix plein et la subvention de l’État est perdue : ' +
    'confirmez plutôt la livraison.'
  );
}
