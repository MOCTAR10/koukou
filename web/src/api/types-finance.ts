// API shapes for the finance area: expenses, rentabilité and SYSCOHADA accounting.

export type ExpenseCategory =
  | 'ACHAT_POUSSINS'
  | 'ALIMENTS'
  | 'VETERINAIRE'
  | 'TRANSPORT'
  | 'EAU'
  | 'ENERGIE_GAZ'
  | 'LOYER'
  | 'MAINTENANCE'
  | 'ASSURANCE'
  | 'MAIN_D_OEUVRE'
  | 'COTISATIONS'
  | 'FRAIS_BANCAIRES'
  | 'AUTRE';

export interface Expense {
  id: string;
  farmId: string;
  expenseDate: string;
  category: ExpenseCategory;
  amountFcfa: number;
  label: string | null;
  supplier: string | null;
  notes: string | null;
  paidByCaisse: boolean;
  batchId: string | null;
  cashMovementId: string | null;
  createdAt: string;
}

export interface CreateExpenseBody {
  category: ExpenseCategory;
  amountFcfa: number;
  label?: string;
  supplier?: string;
  notes?: string;
  paidByCaisse: boolean;
}

export interface UpdateExpenseBody {
  category: ExpenseCategory;
  label: string;
  supplier: string;
  notes: string;
}

export interface SyncExpensesResult {
  batchesSynced: number;
  inputsSynced: number;
}

export interface BreakdownProduct {
  productType: string;
  label: string;
  quantity: number;
  amountFcfa: number;
}

export interface BreakdownExpense {
  category: string;
  label: string;
  amountFcfa: number;
}

export interface OverviewPnl {
  period: { from: string; to: string };
  sales: { count: number; totalFcfa: number };
  collectedFcfa: number;
  outstandingFcfa: number;
  expenses: { count: number; totalFcfa: number };
  netFcfa: number;
  breakdown: {
    byProduct: BreakdownProduct[];
    byExpenseCategory: BreakdownExpense[];
    byPaymentMethod?: { method: string; label: string; amountFcfa: number }[];
  };
}

export interface BatchPnl {
  batchId: string;
  batchName: string | null;
  status: string;
  revenueFcfa: number;
  expensesFcfa: number;
  netFcfa: number;
  marginPct: number | null;
  costPerKgFcfa: number | null;
  kgSold: number;
  birdsSold: number;
  eggsSold: number;
  enrichment: {
    chickCostFcfa: number | null;
    feedLotsCostFcfa: number | null;
  } | null;
}

/** The fields of a sale the « ventes par canal » block reads. */
export interface ChannelSale {
  id: string;
  status: string;
  totalAmountFcfa: number;
  pointOfSaleId?: string | null;
}

export interface ChannelPointOfSale {
  id: string;
  name: string;
  province?: string | null;
}

export type AccountingSource =
  | 'SALE'
  | 'PAYMENT'
  | 'EXPENSE'
  | 'CAISSE'
  | 'ORDER'
  | 'INPUT'
  | 'REGULARISATION'
  | 'STOCK'
  | 'CLOTURE';

export interface JournalLine {
  id: string;
  accountCode: string;
  label: string | null;
  debitFcfa: number;
  creditFcfa: number;
}

export interface JournalEntry {
  id: string;
  reference: string;
  entryDate: string;
  label: string;
  source: AccountingSource;
  status: 'POSTED' | 'CANCELLED';
  lines: JournalLine[];
}

export interface JournalData {
  entries: JournalEntry[];
  totals: { debit: number; credit: number };
}

export interface AccountSoldes {
  code: string;
  label: string;
  classe: number;
  debitTotalFcfa: number;
  creditTotalFcfa: number;
  soldeFcfa: number;
}

export interface BalanceData {
  accounts: AccountSoldes[];
  byClasse: { classe: number; accounts: AccountSoldes[] }[];
  totals: {
    totalDebit: number;
    totalCredit: number;
    totalSoldeDebit: number;
    totalSoldeCredit: number;
  };
}

export interface CompteResultatData {
  charges: AccountSoldes[];
  produits: AccountSoldes[];
  totalCharges: number;
  totalProduits: number;
  resultatFcfa: number;
  resultatNegatif: boolean;
}

export interface BilanData {
  asOf: string;
  exercice: { id: string; label: string } | null;
  actif: AccountSoldes[];
  passif: AccountSoldes[];
  capitaux: AccountSoldes[];
  resultatFcfa: number;
  resultatNegatif: boolean;
  capitauxApportsFcfa: number;
  variationStockFcfa?: number;
  totalActif: number;
  totalPassifExterne: number;
  totalCapitaux: number;
  ecartFcfa: number;
}

export interface StockProvendeLot {
  lotId: string;
  productName: string;
  supplierLotNumber: string;
  availableKg: number;
  valueFcfa: number;
}

export interface StockProvende {
  totalValueFcfa: number;
  lots: StockProvendeLot[];
}

export interface ExerciceInfo {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface CloseExerciceResult {
  exercice: { id: string; label: string };
  next: { id: string; label: string };
  stockFcfa: number;
  resultatFcfa: number;
}

export interface RegularisationBody {
  date: string;
  label: string;
  lines: { account: string; debitFcfa?: number; creditFcfa?: number }[];
}

export interface GrandLivreMovement {
  date: string;
  reference: string;
  label: string;
  source: AccountingSource;
  sourceId: string;
  debitFcfa: number;
  creditFcfa: number;
}

export interface GrandLivreAccount {
  account: string;
  label: string | null;
  classe: number | null;
  nature: string | null;
  debitTotalFcfa: number;
  creditTotalFcfa: number;
  /** Net balance of the period (debit - credit). */
  soldeFcfa: number;
  mouvements: GrandLivreMovement[];
}

export type GrandLivreData = GrandLivreAccount[];
