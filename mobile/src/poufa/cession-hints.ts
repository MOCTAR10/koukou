// POUFA lot A bande (F4): a POS sale of poultry to a customer linked to a
// programme operator creates the traced cession (sub-lot and QR) on the
// server. The cashier is told, and reminded not to re-enter a sale already
// recorded as a band exit. Pure.

export const POS_OPERATOR_NOTICE =
  'Client lié à un opérateur du programme : cette vente de volailles créera une cession tracée (sous-lot et QR).';

export const POS_NO_DOUBLE_ENTRY_HINT =
  'Une vente déjà enregistrée comme sortie de bande (motif Vente) a créé sa vente : ne la ressaisissez pas en caisse.';

/** POS products that sell birds of a band (live or slaughtered). */
const POULTRY_PRODUCTS: ReadonlySet<string> = new Set(['PIECE', 'KG', 'ABATTU_PIECE', 'ABATTU_KG']);

export function isPoultryProduct(product: string): boolean {
  return POULTRY_PRODUCTS.has(product);
}

export interface PosCessionHints {
  /** The cession notice, when the customer is linked to an operator. */
  operator: string | null;
  /** The no-double-entry reminder, whenever poultry is in the cart. */
  noDoubleEntry: string | null;
}

export function posCessionHints(
  customer: { operatorId?: string | null } | null | undefined,
  products: readonly string[],
): PosCessionHints {
  const poultry = products.some(isPoultryProduct);
  if (!poultry) return { operator: null, noDoubleEntry: null };
  return {
    operator: customer?.operatorId ? POS_OPERATOR_NOTICE : null,
    noDoubleEntry: POS_NO_DOUBLE_ENTRY_HINT,
  };
}
