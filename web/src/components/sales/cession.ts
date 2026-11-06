// POUFA F4 (CDC n° 9 and T3): a sale of birds or carcasses to a customer linked
// to a programme operator (`customers.operator_id`) is a cession: the server
// creates the traceability sub-lot and its QR code in the same transaction.
// A sale already recorded as a band sortie (motif Vente) must not be typed
// again at the register: the sortie booked it.

export const OPERATOR_CESSION_NOTICE =
  'Client lié à un opérateur du programme : cette vente de volailles créera une cession tracée (sous-lot et QR).';

export const SORTIE_ALREADY_SOLD_HINT =
  'Une vente déjà enregistrée par une sortie de bande (motif Vente) ne doit pas être ressaisie ici : la sortie a déjà créé la vente.';

/** Products whose birds come from a band (live or slaughtered). */
const BIRD_PRODUCTS: ReadonlySet<string> = new Set([
  'PIECE',
  'KG',
  'ABATTU_PIECE',
  'ABATTU_KG',
  // Sale item types, for the order screens.
  'POULET_PIECE',
  'POULET_KG',
]);

export function hasBirdLines(lines: readonly { product?: string; productType?: string }[]): boolean {
  return lines.some((l) => BIRD_PRODUCTS.has(l.product ?? l.productType ?? ''));
}

/** Notices for the register or a delivery, in display order. */
export function saleCessionNotices(
  customer: { operatorId?: string | null } | null | undefined,
  lines: readonly { product?: string; productType?: string }[],
): { cession: string | null; noDoubleEntry: string | null } {
  const birds = hasBirdLines(lines);
  return {
    cession: birds && customer?.operatorId ? OPERATOR_CESSION_NOTICE : null,
    noDoubleEntry: birds ? SORTIE_ALREADY_SOLD_HINT : null,
  };
}
