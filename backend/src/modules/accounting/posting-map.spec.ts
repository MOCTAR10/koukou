import { describe, expect, it } from 'vitest';
import { SaleItemProductType } from '../../common/enums/sale-item-type.enum.js';
import { ExpenseCategory } from '../../common/enums/expense-category.enum.js';
import { InputKind } from '../../common/enums/input-kind.enum.js';
import {
  revenueLines,
  splitAmounts,
  expenseAccountForCategory,
  inputAccountForKind,
  inputValueFcfa,
  revenueAccountForProduct,
  cashAccountForMethod,
} from './posting-map.js';
import { ACCOUNT_PLAN } from './account-plan.data.js';

describe('posting-map', () => {
  describe('revenueAccountForProduct', () => {
    it('ventile les avicoles sur 7011, œufs 7012, provende 7013, divers 7019', () => {
      expect(
        revenueAccountForProduct(SaleItemProductType.POULET_PIECE),
      ).toBe('7011');
      expect(revenueAccountForProduct(SaleItemProductType.ABATTU_KG)).toBe(
        '7011',
      );
      expect(revenueAccountForProduct(SaleItemProductType.OEUFS)).toBe('7012');
      expect(revenueAccountForProduct(SaleItemProductType.PROVENDE)).toBe(
        '7013',
      );
      expect(revenueAccountForProduct(SaleItemProductType.AUTRE)).toBe('7019');
    });
  });

  describe('splitAmounts', () => {
    it('répartit proportionnellement en entiers avec le reste sur le dernier', () => {
      expect(splitAmounts([10, 10], 15)).toEqual([7, 8]);
      expect(splitAmounts([30, 10, 10], 50)).toEqual([30, 10, 10]);
      expect(splitAmounts([30, 10, 10], 51)).toEqual([30, 10, 11]);
      expect(splitAmounts([100], 250)).toEqual([250]);
      expect(splitAmounts([], 10)).toEqual([]);
    });
  });

  describe('revenueLines', () => {
    it('produit des lignes créditrices équilibrées sur le net (remise incluse)', () => {
      const lines = revenueLines(
        [
          { productType: SaleItemProductType.POULET_PIECE, amountFcfa: 5000 },
          { productType: SaleItemProductType.OEUFS, amountFcfa: 3000 },
        ],
        6500,
      );
      const totalCredit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
      expect(totalCredit).toBe(6500);
      expect(lines.map((l) => l.account).sort()).toEqual(['7011', '7012']);
      for (const line of lines) expect(line.debit ?? 0).toBe(0);
    });

    it('retombe sur 701 (générique) sans articles mais avec un net', () => {
      const lines = revenueLines([], 1200);
      expect(lines).toEqual([{ account: '701', credit: 1200, label: 'Ventes de produits de la ferme' }]);
    });

    it('ne renvoie rien sans articles ni net', () => {
      expect(revenueLines([], 0)).toEqual([]);
    });
  });

  describe('expenseAccountForCategory', () => {
    it('mappe chaque catégorie sur son compte de charge OHADA', () => {
      // Classe 60 — Achats
      expect(expenseAccountForCategory(ExpenseCategory.ACHAT_POUSSINS)).toBe('6010');
      expect(expenseAccountForCategory(ExpenseCategory.ALIMENTS)).toBe('6011');
      expect(expenseAccountForCategory(ExpenseCategory.VETERINAIRE)).toBe('6012');
      expect(expenseAccountForCategory(ExpenseCategory.TRANSPORT)).toBe('604');
      // Classe 61 — Services extérieurs
      expect(expenseAccountForCategory(ExpenseCategory.EAU)).toBe('6052');
      expect(expenseAccountForCategory(ExpenseCategory.ENERGIE_GAZ)).toBe('6061');
      expect(expenseAccountForCategory(ExpenseCategory.LOYER)).toBe('613');
      expect(expenseAccountForCategory(ExpenseCategory.MAINTENANCE)).toBe('615');
      expect(expenseAccountForCategory(ExpenseCategory.ASSURANCE)).toBe('616');
      // Classe 64 — Personnel / impôts
      expect(expenseAccountForCategory(ExpenseCategory.MAIN_D_OEUVRE)).toBe('641');
      expect(expenseAccountForCategory(ExpenseCategory.COTISATIONS)).toBe('645');
      // Classe 66 — Charges financières
      expect(expenseAccountForCategory(ExpenseCategory.FRAIS_BANCAIRES)).toBe('661');
      // Classe 65 — Autres charges
      expect(expenseAccountForCategory(ExpenseCategory.AUTRE)).toBe('65');
    });

    it('ne renvoie que des comptes présents dans le plan (sinon post() échoue)', () => {
      const plan = new Set(ACCOUNT_PLAN.map((a) => a.code));
      for (const category of Object.values(ExpenseCategory)) {
        expect(plan.has(expenseAccountForCategory(category))).toBe(true);
      }
      for (const kind of Object.values(InputKind)) {
        expect(plan.has(inputAccountForKind(kind))).toBe(true);
      }
      for (const type of Object.values(SaleItemProductType)) {
        expect(plan.has(revenueAccountForProduct(type))).toBe(true);
      }
    });
  });

  describe('inputAccountForKind', () => {
    it('mappe chaque type d’intrant sur son compte de charge OHADA', () => {
      expect(inputAccountForKind(InputKind.POUSSINS)).toBe('6010');
      expect(inputAccountForKind(InputKind.ALIMENT)).toBe('6011');
      expect(inputAccountForKind(InputKind.MEDICAMENT)).toBe('6012');
      expect(inputAccountForKind(InputKind.VITAMINE)).toBe('6012');
      expect(inputAccountForKind(InputKind.AUTRE)).toBe('6018');
    });
  });

  describe('inputValueFcfa', () => {
    it('priorise le coût total, puis le coût par MT, puis le prix sac', () => {
      expect(
        inputValueFcfa({ totalCostFcfa: 120000, costPerMtFcfa: 1000, tonnageMt: 2, unitPriceFcfa: 25000, numberOfBags: 5, quantity: 100, bagSizeKg: 50 }),
      ).toBe(120000);
      expect(
        inputValueFcfa({ totalCostFcfa: null, costPerMtFcfa: 300000, tonnageMt: 1.5, unitPriceFcfa: 5000, numberOfBags: 10, quantity: 1500, bagSizeKg: 50 }),
      ).toBe(450000);
      expect(
        inputValueFcfa({ totalCostFcfa: null, costPerMtFcfa: null, tonnageMt: null, unitPriceFcfa: 25000, numberOfBags: 4, quantity: 200, bagSizeKg: 50 }),
      ).toBe(100000);
      expect(
        inputValueFcfa({ totalCostFcfa: null, costPerMtFcfa: null, tonnageMt: null, unitPriceFcfa: null, numberOfBags: 3, quantity: 150, bagSizeKg: 50 }),
      ).toBe(0);
      // Sans nombre de sacs : prix unitaire × quantité reçue (2 SAC à 15 000).
      expect(
        inputValueFcfa({ totalCostFcfa: null, costPerMtFcfa: null, tonnageMt: null, unitPriceFcfa: 15000, numberOfBags: null, quantity: 2, bagSizeKg: null }),
      ).toBe(30000);
      // Sacs saisis au tonnage (quantity en kg) : 2 t / 50 kg = 40 sacs.
      expect(
        inputValueFcfa({ totalCostFcfa: null, costPerMtFcfa: null, tonnageMt: 2, unitPriceFcfa: 15000, numberOfBags: null, quantity: 2000, bagSizeKg: 50 }),
      ).toBe(600000);
    });
  });

  describe('cashAccountForMethod', () => {
    it('espèces sur 571, mobiles/bancaires ailleurs', () => {
      expect(cashAccountForMethod('CASH')).toBe('571');
      expect(cashAccountForMethod('MOBILE_MONEY')).toBe('52');
      expect(cashAccountForMethod('QR_CODE')).toBe('52');
    });
  });
});