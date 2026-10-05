import { SaleItemProductType } from '../../common/enums/sale-item-type.enum.js';
import { ExpenseCategory } from '../../common/enums/expense-category.enum.js';
import { InputKind } from '../../common/enums/input-kind.enum.js';
import type { PostingLine } from './accounting.service.js';

/** Compte de trésorerie par méthode de paiement (Phase 1 : espèces 571). */
export function cashAccountForMethod(method: string): string {
  return method === 'CASH' ? '571' : '52';
}

/** Compte produit SYSCOHADA selon le type d'article vendu. */
export function revenueAccountForProduct(type: SaleItemProductType): string {
  switch (type) {
    case SaleItemProductType.POULET_PIECE:
    case SaleItemProductType.POULET_KG:
    case SaleItemProductType.ABATTU_PIECE:
    case SaleItemProductType.ABATTU_KG:
      return '7011';
    case SaleItemProductType.OEUFS:
      return '7012';
    case SaleItemProductType.PROVENDE:
      return '7013';
    default:
      return '7019';
  }
}

/**
 * Répartit `target` entre les comptes de ventes proportionnellement aux
 * montants bruts des articles (remises ventilées), arrondis en FCFA entiers.
 * Retourne des lignes créditrices 701x prêtes à poster.
 */
export function revenueLines(
  items: { productType: SaleItemProductType; amountFcfa: number }[],
  netTotalFcfa: number,
): PostingLine[] {
  const rawTotal = items.reduce((s, i) => s + i.amountFcfa, 0);
  if (rawTotal <= 0) {
    return netTotalFcfa > 0
      ? [{ account: '701', credit: netTotalFcfa, label: 'Ventes de produits de la ferme' }]
      : [];
  }
  const groups = new Map<string, number>();
  for (const item of items) {
    const account = revenueAccountForProduct(item.productType);
    groups.set(account, (groups.get(account) ?? 0) + item.amountFcfa);
  }
  const rows = [...groups.entries()].map(([account, amount]) => ({
    account,
    amount,
  }));
  const target = Math.max(0, netTotalFcfa);
  const scaled = splitAmounts(
    rows.map((r) => r.amount),
    target,
  );
  return rows.map((r, i) => ({
    account: r.account,
    credit: scaled[i],
    label: null,
  }));
}

/** Rèpartit un total entre montants proportionnellement, en entiers (éventuel reste sur le dernier). */
export function splitAmounts(amounts: number[], target: number): number[] {
  if (amounts.length === 0) return [];
  const rawTotal = amounts.reduce((s, a) => s + a, 0) || 1;
  const scaled = amounts.map((a) => Math.floor((target * a) / rawTotal));
  const adjustment = target - scaled.reduce((s, a) => s + a, 0);
  scaled[scaled.length - 1] += adjustment;
  return scaled;
}

/** Compte de charge SYSCOHADA selon la catégorie de dépense. */
export function expenseAccountForCategory(category: ExpenseCategory): string {
  switch (category) {
    // Classe 60 — Achats
    case ExpenseCategory.ACHAT_POUSSINS:
      return '6010';
    case ExpenseCategory.ALIMENTS:
      return '6011';
    case ExpenseCategory.VETERINAIRE:
      return '6012';
    case ExpenseCategory.TRANSPORT:
      return '604';
    // Classe 61 — Services extérieurs
    case ExpenseCategory.EAU:
      return '6052';
    case ExpenseCategory.ENERGIE_GAZ:
      return '6061';
    case ExpenseCategory.LOYER:
      return '613';
    case ExpenseCategory.MAINTENANCE:
      return '615';
    case ExpenseCategory.ASSURANCE:
      return '616';
    // Classe 64 — Personnel / impôts
    case ExpenseCategory.MAIN_D_OEUVRE:
      return '641';
    case ExpenseCategory.COTISATIONS:
      return '645';
    // Classe 66 — Charges financières
    case ExpenseCategory.FRAIS_BANCAIRES:
      return '661';
    // Classe 65 — Autres charges
    default:
      return '65';
  }
}

/** Compte de charge SYSCOHADA selon le type d'intrant réceptionné. */
export function inputAccountForKind(kind: InputKind): string {
  switch (kind) {
    case InputKind.POUSSINS:
      return '6010';
    case InputKind.ALIMENT:
      return '6011';
    case InputKind.MEDICAMENT:
    case InputKind.VITAMINE:
      return '6012';
    default:
      return '6018';
  }
}

/**
 * Valorisation « best-effort » d'un intrant réceptionné (FCFA) :
 * totalCostFcfa (vrac/matière première) → coût au MT × tonnage →
 * prix unitaire × nombre de sacs. 0 = intrant non valorisé (pas d'écriture).
 */
export function inputValueFcfa(input: {
  totalCostFcfa: number | null;
  costPerMtFcfa: number | null;
  unitPriceFcfa: number | null;
  tonnageMt: number | null;
  numberOfBags: number | null;
  quantity: number | null;
  bagSizeKg: number | null;
}): number {
  if (input.totalCostFcfa != null && input.totalCostFcfa > 0) {
    return input.totalCostFcfa;
  }
  if (input.costPerMtFcfa != null && input.tonnageMt != null && input.tonnageMt > 0) {
    return Math.round(input.costPerMtFcfa * input.tonnageMt);
  }
  if (input.unitPriceFcfa != null && input.unitPriceFcfa > 0) {
    const count = input.numberOfBags ?? 1;
    return Math.round(input.unitPriceFcfa * count);
  }
  return 0;
}