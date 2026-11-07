import { ExpenseCategory } from '../../common/enums/expense-category.enum.js';

/**
 * CDC 7.3a: expenses carry a « poste de charge » from the admin-managed
 * reference list `POSTE_CHARGE`. The accounting category (SYSCOHADA account)
 * stays the internal enum: the seeded poste codes map onto it, any other
 * (admin-added) poste falls back on `AUTRE`.
 */
export const POSTE_TO_CATEGORY: Readonly<Record<string, ExpenseCategory>> = {
  POUSSINS: ExpenseCategory.ACHAT_POUSSINS,
  ALIMENT: ExpenseCategory.ALIMENTS,
  VETERINAIRE: ExpenseCategory.VETERINAIRE,
  MAIN_OEUVRE: ExpenseCategory.MAIN_D_OEUVRE,
  ENERGIE: ExpenseCategory.ENERGIE_GAZ,
  TRANSPORT: ExpenseCategory.TRANSPORT,
  AUTRES: ExpenseCategory.AUTRE,
};

/** Poste recorded for an expense sent with a legacy category only (older clients). */
export const CATEGORY_TO_POSTE: Readonly<Partial<Record<ExpenseCategory, string>>> =
  {
    [ExpenseCategory.ACHAT_POUSSINS]: 'POUSSINS',
    [ExpenseCategory.ALIMENTS]: 'ALIMENT',
    [ExpenseCategory.VETERINAIRE]: 'VETERINAIRE',
    [ExpenseCategory.MAIN_D_OEUVRE]: 'MAIN_OEUVRE',
    [ExpenseCategory.ENERGIE_GAZ]: 'ENERGIE',
    [ExpenseCategory.TRANSPORT]: 'TRANSPORT',
  };

export function categoryForPoste(poste: string): ExpenseCategory {
  return POSTE_TO_CATEGORY[poste] ?? ExpenseCategory.AUTRE;
}

export function posteForCategory(category: ExpenseCategory): string {
  return CATEGORY_TO_POSTE[category] ?? 'AUTRES';
}
