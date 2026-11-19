// Financer workspace (matrix domain FINANCEMENT). This file is the API contract:
// the backend DTOs and the web pages both follow it. Money is integer FCFA,
// dates are `YYYY-MM-DD` (Libreville day), timestamps ISO.

/** Steps of a financing file, in order. */
export const FINANCING_STEPS = ['DEMANDE', 'INSTRUCTION', 'DECISION', 'DECAISSEMENT', 'SUIVI', 'CLOTURE'] as const;
export type FinancingStep = (typeof FINANCING_STEPS)[number];

export const FINANCING_STEP_LABELS: Record<FinancingStep, string> = {
  DEMANDE: 'Demande',
  INSTRUCTION: 'Instruction',
  DECISION: 'Décision',
  DECAISSEMENT: 'Décaissement',
  SUIVI: 'Suivi',
  CLOTURE: 'Clôture',
};

export type FinancingDecision = 'ACCORDE' | 'REFUSE' | 'AJOURNE';

/**
 * Claim class, after COBAC R-2018/01. SAIN / IMPAYE / DOUTEUX are computed from
 * the oldest unpaid instalment (thresholds are programme parameters); SENSIBLE,
 * RESTRUCTURE and IRRECOUVRABLE are set by the bank; SOLDE = fully repaid;
 * SANS_OBJET = nothing granted or disbursed yet.
 */
export type ClaimClass = 'SANS_OBJET' | 'SAIN' | 'SENSIBLE' | 'IMPAYE' | 'DOUTEUX' | 'RESTRUCTURE' | 'IRRECOUVRABLE' | 'SOLDE';

export const CLAIM_CLASS_LABELS: Record<ClaimClass, string> = {
  SANS_OBJET: 'Sans encours',
  SAIN: 'Saine',
  SENSIBLE: 'Sensible',
  IMPAYE: 'Impayée',
  DOUTEUX: 'Douteuse',
  RESTRUCTURE: 'Restructurée',
  IRRECOUVRABLE: 'Irrécouvrable',
  SOLDE: 'Soldée',
};

/** Manual flag the bank may set; null = computed class only. */
export type ClaimFlag = 'SENSIBLE' | 'RESTRUCTURE' | 'IRRECOUVRABLE' | null;

export type Periodicity = 'MENSUELLE' | 'TRIMESTRIELLE' | 'SEMESTRIELLE' | 'PAR_BANDE';

export interface FinancingAmounts {
  requestedFcfa: number | null;
  grantedFcfa: number | null;
  disbursedFcfa: number;
  /** Total due over the whole schedule (principal + interest). */
  scheduledFcfa: number;
  repaidFcfa: number;
  /** Due to date and not repaid. */
  overdueFcfa: number;
  /** Disbursed principal not yet repaid. */
  outstandingFcfa: number;
}

/** Row of the files list. */
export interface FinancingFileRow {
  id: string;
  reference: string; // BCEG-2026-0001
  farmId: string;
  farmCode: string;
  farmName: string;
  provinceName: string | null;
  exploitantName: string | null;
  purpose: string;
  step: FinancingStep;
  decision: FinancingDecision | null;
  claimClass: ClaimClass;
  /** Days since the oldest unpaid due date, 0 when none. */
  daysLate: number;
  amounts: FinancingAmounts;
  /** Required documents of the steps reached: provided (validated or deposited) / expected. */
  documents: { expected: number; provided: number; validated: number; rejected: number };
  consent: ConsentStatus;
  nextDueDate: string | null;
  updatedAt: string;
}

export interface FinancingFilePage {
  items: FinancingFileRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Disbursement {
  id: string;
  number: number;
  plannedDate: string | null;
  amountFcfa: number;
  /** Condition to release (need assessed, field check done, commitments met…). */
  condition: string | null;
  status: 'PREVUE' | 'DEBLOQUEE' | 'ANNULEE';
  releasedOn: string | null;
  /** Technical visit used as the field check, if any. */
  visitId: string | null;
  note: string | null;
}

export interface Instalment {
  id: string;
  number: number;
  dueDate: string;
  principalFcfa: number;
  interestFcfa: number;
  dueFcfa: number;
  paidFcfa: number;
  status: 'A_VENIR' | 'PAYEE' | 'PARTIELLE' | 'EN_RETARD';
  daysLate: number;
}

export interface Repayment {
  id: string;
  paidOn: string;
  amountFcfa: number;
  method: 'VIREMENT' | 'MOBILE_MONEY' | 'ESPECES' | 'CHEQUE' | 'PRELEVEMENT';
  reference: string | null;
  note: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  recordedByName: string | null;
}

/** Item of the bank's document checklist (managed by the bank, never deleted, only deactivated). */
export interface FinancingRequirement {
  id: string;
  code: string;
  label: string;
  step: FinancingStep;
  required: boolean;
  /** Short regulatory source shown next to the item, e.g. « AUS OHADA, art. 14 ». */
  legalBasis: string | null;
  help: string | null;
  active: boolean;
  sort: number;
}

export interface FinancingDocument {
  id: string;
  requirementId: string | null;
  label: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  status: 'DEPOSE' | 'VALIDE' | 'REJETE';
  rejectReason: string | null;
  uploadedByName: string | null;
  uploadedAt: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
}

/** One line of the checklist of a file: the requirement and the documents filed under it. */
export interface ChecklistLine {
  requirement: FinancingRequirement;
  documents: FinancingDocument[];
  state: 'MANQUANTE' | 'DEPOSEE' | 'VALIDEE' | 'REJETEE' | 'EXPIREE';
}

export interface FinancingStepEvent {
  id: string;
  from: FinancingStep | null;
  to: FinancingStep;
  decision: FinancingDecision | null;
  note: string | null;
  byName: string | null;
  at: string;
}

export interface FinancingFile extends FinancingFileRow {
  amountNote: string | null;
  /** Annual rate in percent, two decimals at most. */
  ratePct: number | null;
  durationMonths: number | null;
  graceMonths: number | null;
  periodicity: Periodicity | null;
  decisionDate: string | null;
  decisionNote: string | null;
  /** Free description of the securities taken (cautionnement, gage de matériel, gage de stocks…). */
  guarantees: string | null;
  /** Share covered by a guarantee fund, in percent, and its name. */
  guaranteeFund: string | null;
  guaranteePct: number | null;
  claimFlag: ClaimFlag;
  claimFlagNote: string | null;
  notes: string | null;
  disbursements: Disbursement[];
  instalments: Instalment[];
  repayments: Repayment[];
  checklist: ChecklistLine[];
  /** Documents filed outside the checklist. */
  otherDocuments: FinancingDocument[];
  history: FinancingStepEvent[];
  /** Missing required documents of the current step: the step cannot be passed while non-empty. */
  blockers: string[];
  rights: FinancingRights;
}

/** What the caller may do, from the matrix (CONSULTER / CREER / MODIFIER / VALIDER on FINANCEMENT). */
export interface FinancingRights {
  read: boolean;
  create: boolean; // open a file, file a document, record a repayment
  edit: boolean; // edit terms, schedule, tranches, checklist
  validate: boolean; // pass a step, decide, release a tranche, review a document, manage the consent template
}

export interface CreateFinancingFileBody {
  farmId: string;
  purpose: string;
  requestedFcfa?: number | null;
  notes?: string | null;
}

export interface UpdateFinancingFileBody {
  purpose?: string;
  requestedFcfa?: number | null;
  grantedFcfa?: number | null;
  amountNote?: string | null;
  ratePct?: number | null;
  durationMonths?: number | null;
  graceMonths?: number | null;
  periodicity?: Periodicity | null;
  guarantees?: string | null;
  guaranteeFund?: string | null;
  guaranteePct?: number | null;
  claimFlag?: ClaimFlag;
  claimFlagNote?: string | null;
  notes?: string | null;
}

export interface PassStepBody {
  to: FinancingStep;
  decision?: FinancingDecision;
  decisionDate?: string;
  note?: string;
}

export interface GenerateScheduleBody {
  /** First due date; the following ones follow the periodicity. */
  firstDueDate: string;
}

export interface DisbursementBody {
  plannedDate?: string | null;
  amountFcfa: number;
  condition?: string | null;
  note?: string | null;
}

export interface ReleaseDisbursementBody {
  releasedOn: string;
  visitId?: string | null;
  note?: string | null;
}

export interface RepaymentBody {
  paidOn: string;
  amountFcfa: number;
  method: Repayment['method'];
  reference?: string | null;
  note?: string | null;
}

// ── Consent ────────────────────────────────────────────────────────────────

export type ConsentStatus = 'AUCUN' | 'ACTIF' | 'RETIRE';

export const CONSENT_STATUS_LABELS: Record<ConsentStatus, string> = {
  AUCUN: 'Non recueilli',
  ACTIF: 'Donné',
  RETIRE: 'Retiré',
};

/** Mandatory mention the bank confirms when it files a template (loi n° 001/2011 modifiée par la loi n° 025/2023). */
export interface ConsentClause {
  code: string;
  label: string;
  legalBasis: string; // « art. 100 »
}

export interface ConsentTemplate {
  id: string;
  version: number;
  title: string;
  /** Purpose stated to the farmer, shown on the consent screen. */
  purpose: string;
  /** Categories of data shared, shown on the consent screen. */
  dataCategories: string[];
  retention: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  /** Codes of the clauses the bank confirmed are in the document. */
  confirmedClauses: string[];
  active: boolean;
  createdByName: string | null;
  createdAt: string;
  /** Consents given under this version. */
  consentCount: number;
}

export interface ConsentTemplatesView {
  clauses: ConsentClause[];
  templates: ConsentTemplate[];
  /** Who the FINANCED scope reaches (programme parameter FINANCEMENT_PERIMETRE). */
  perimeter: FinancedPerimeter;
}

/** PROGRAMME = every farm of the programme; DOSSIERS = farms with a financing file; CONSENTEMENT = farms with an active consent. */
export type FinancedPerimeter = 'PROGRAMME' | 'DOSSIERS' | 'CONSENTEMENT';

export interface FarmConsent {
  id: string;
  farmId: string;
  farmCode: string;
  farmName: string;
  status: ConsentStatus;
  templateId: string | null;
  templateVersion: number | null;
  method: 'EN_LIGNE' | 'PAPIER' | null;
  signerName: string | null;
  signerQuality: string | null;
  grantedAt: string | null;
  recordedByName: string | null;
  /** True when a signed scan is stored. */
  hasProof: boolean;
  withdrawnAt: string | null;
  withdrawReason: string | null;
}

export interface ConsentCoverage {
  farms: number;
  active: number;
  withdrawn: number;
  none: number;
}

export interface ConsentsView {
  coverage: ConsentCoverage;
  items: FarmConsent[];
}

// ── Portfolio ──────────────────────────────────────────────────────────────

export interface PortfolioBucket {
  key: string;
  label: string;
  files: number;
  amountFcfa: number;
}

export interface PortfolioView {
  asOf: string;
  perimeter: FinancedPerimeter;
  farms: { inScope: number; withFile: number; financed: number };
  totals: {
    files: number;
    requestedFcfa: number;
    grantedFcfa: number;
    disbursedFcfa: number;
    outstandingFcfa: number;
    repaidFcfa: number;
    overdueFcfa: number;
    /** Repaid / due to date, in percent; null when nothing is due yet. */
    repaymentRatePct: number | null;
    /** Outstanding of IMPAYE + DOUTEUX files / total outstanding, in percent. */
    atRiskPct: number | null;
  };
  bySteps: PortfolioBucket[];
  byClaimClass: PortfolioBucket[];
  byProvince: PortfolioBucket[];
  /** Disbursed and repaid per month, last 12 months (`YYYY-MM`). */
  monthly: Array<{ month: string; disbursedFcfa: number; repaidFcfa: number; dueFcfa: number }>;
  late: FinancingFileRow[];
  upcoming: Array<{ fileId: string; reference: string; farmName: string; dueDate: string; dueFcfa: number }>;
  pendingDisbursements: Array<{ fileId: string; reference: string; farmName: string; number: number; plannedDate: string | null; amountFcfa: number }>;
  documents: { expected: number; provided: number; validated: number };
  consent: ConsentCoverage;
  /** Financed farms whose technical or economic signals deserve attention. */
  watchlist: Array<{ farmId: string; farmName: string; reference: string | null; reasons: string[] }>;
}

// ── Farm 360° ──────────────────────────────────────────────────────────────

export interface Farm360 {
  farm: {
    id: string;
    code: string;
    name: string;
    provinceName: string | null;
    locality: string | null;
    statusLabel: string | null;
    cohortLabel: string | null;
    exploitantName: string | null;
    exploitantPhone: string | null;
    capacityPlaces: number | null;
    latitude: number | null;
    longitude: number | null;
    biosecurityClass: string | null;
    lastVisitOn: string | null;
  };
  /** Null blocks = the caller's matrix does not open that domain. */
  production: {
    openBands: number;
    birdsPresent: number;
    occupancyPct: number | null;
    mortalityPct: number | null;
    feedConversion: number | null;
    avgWeightG: number | null;
    eggsPerDay: number | null;
    lastEntryOn: string | null;
    /** Mortality % per week, last 12 weeks. */
    mortalityTrend: Array<{ label: string; value: number }>;
    bands: Array<{ id: string; name: string; type: string; ageDays: number; birds: number; mortalityPct: number | null; status: string }>;
  } | null;
  economics: {
    periodLabel: string;
    salesFcfa: number;
    expensesFcfa: number;
    marginFcfa: number;
    marginRatePct: number | null;
    collectedFcfa: number;
    receivablesFcfa: number;
    /** Sales and expenses per month, last 12 months. */
    monthly: Array<{ month: string; salesFcfa: number; expensesFcfa: number }>;
  } | null;
  support: {
    /** State deliveries (chicks, feed…) received, with the subsidy share. */
    deliveries: number;
    valueFcfa: number;
    subsidyFcfa: number;
    lastDeliveryOn: string | null;
  } | null;
  alerts: { open: number; sanitaryOpen: number; items: Array<{ label: string; level: string; since: string }> } | null;
  financing: {
    files: FinancingFileRow[];
    consent: FarmConsent | null;
    /** Annual repayment due / margin of the period, in percent; null when unknown. */
    debtServiceToMarginPct: number | null;
  };
}

// ── Farmer side (GET /farms/:farmId/financing) ─────────────────────────────

export interface FarmFinancingView {
  consent: FarmConsent | null;
  /** Active template the farmer reads before consenting; null = the bank filed none yet. */
  template: Pick<ConsentTemplate, 'id' | 'version' | 'title' | 'purpose' | 'dataCategories' | 'retention' | 'fileName'> | null;
  /** Institution the data is shared with. */
  recipient: string;
  files: Array<
    Pick<FinancingFileRow, 'id' | 'reference' | 'purpose' | 'step' | 'decision' | 'claimClass' | 'amounts' | 'nextDueDate'> & {
      instalments: Instalment[];
      missingDocuments: string[];
    }
  >;
  /** True when the caller may give or withdraw the consent (owner or manager of the farm). */
  canConsent: boolean;
}

export interface LegalBasisRow {
  code: string;
  title: string;
  reference: string;
  articles: string | null;
  use: string;
  url: string | null;
  /** False = cited from secondary sources, to be confirmed by the bank's legal department. */
  verified: boolean;
}

/*
Routes (all under /api). Programme side, @Domain('FINANCEMENT'):
  GET    /programme/financing/portfolio                         → PortfolioView
  GET    /programme/financing/portfolio/export                  → xlsx (one row per file)
  GET    /programme/financing/files?step&claimClass&province&q&page&pageSize → FinancingFilePage
  POST   /programme/financing/files                             → FinancingFile            (CREER)
  GET    /programme/financing/files/:id                         → FinancingFile
  PATCH  /programme/financing/files/:id                         → FinancingFile            (MODIFIER)
  POST   /programme/financing/files/:id/step                    → FinancingFile            (VALIDER)
  POST   /programme/financing/files/:id/schedule                → FinancingFile            (MODIFIER)
  POST   /programme/financing/files/:id/disbursements           → FinancingFile            (MODIFIER)
  POST   /programme/financing/files/:id/disbursements/:did/release → FinancingFile         (VALIDER)
  POST   /programme/financing/files/:id/disbursements/:did/cancel  → FinancingFile         (VALIDER)
  POST   /programme/financing/files/:id/repayments              → FinancingFile            (CREER)
  POST   /programme/financing/files/:id/repayments/:rid/cancel  { reason } → FinancingFile (VALIDER)
  POST   /programme/financing/files/:id/documents               multipart file, requirementId?, label? → FinancingFile (CREER)
  GET    /programme/financing/files/:id/documents/:docId/file   → the file
  POST   /programme/financing/files/:id/documents/:docId/review { status: 'VALIDE'|'REJETE', reason? } → FinancingFile (VALIDER)
  GET    /programme/financing/requirements                      → FinancingRequirement[]
  POST   /programme/financing/requirements                      → FinancingRequirement     (VALIDER)
  PATCH  /programme/financing/requirements/:id                  → FinancingRequirement     (VALIDER)
  GET    /programme/financing/consent-templates                 → ConsentTemplatesView
  POST   /programme/financing/consent-templates                 multipart file, title, purpose, dataCategories (JSON), retention, confirmedClauses (JSON) → ConsentTemplate (VALIDER)
  GET    /programme/financing/consent-templates/:id/file        → the file
  GET    /programme/financing/consents?status&q                 → ConsentsView
  POST   /programme/financing/farms/:farmId/consent             multipart file (signed scan), signerName, signerQuality, grantedOn → FarmConsent (CREER)
  GET    /programme/financing/farms/:farmId/consent/proof       → the file
  POST   /programme/financing/farms/:farmId/consent/withdraw    { reason } → FarmConsent   (CREER)
  GET    /programme/financing/farms/:farmId/overview            → Farm360
  GET    /programme/financing/legal-basis                       → LegalBasisRow[]
Farmer side:
  GET    /farms/:farmId/financing                               → FarmFinancingView
  GET    /farms/:farmId/financing/consent-template/file         → the file
  POST   /farms/:farmId/financing/consent                       { templateId, signerName, signerQuality, accepted: true } → FarmFinancingView
  POST   /farms/:farmId/financing/consent/withdraw              { reason? } → FarmFinancingView
*/

// ── Financial statements (SYSCOHADA) for the financer ─────────────────────
// Needs COMPTABILITE:CONSULTER besides FINANCEMENT:CONSULTER, and the farm in
// the caller's perimeter. Figures come from the farm's own bookkeeping.

export interface StatementLine {
  code: string; // account class or SYSCOHADA heading
  label: string;
  amountFcfa: number;
}

export interface FarmFinancials {
  farmId: string;
  from: string;
  to: string;
  /** False = the farm never opened its accounting: every block below is null. */
  initialized: boolean;
  /** How far the figures can be trusted: they are the farmer's entries, not audited. */
  reliability: {
    daysInPeriod: number;
    /** Days of the period with at least one daily entry or accounting entry. */
    daysWithEntries: number;
    journalEntries: number;
    lastEntryOn: string | null;
    /** True when the period's fiscal year is closed. */
    closed: boolean;
  };
  incomeStatement: {
    products: StatementLine[];
    charges: StatementLine[];
    revenueFcfa: number;
    chargesFcfa: number;
    netResultFcfa: number;
  } | null;
  balanceSheet: {
    asOf: string;
    assets: StatementLine[];
    liabilities: StatementLine[];
    totalAssetsFcfa: number;
    totalLiabilitiesFcfa: number;
  } | null;
  /** Cash view, always filled when initialized: what a small farm on cash accounting can show. */
  cash: {
    openingFcfa: number;
    inflowsFcfa: number;
    outflowsFcfa: number;
    closingFcfa: number;
    monthly: Array<{ month: string; inflowsFcfa: number; outflowsFcfa: number }>;
  } | null;
  /** Banker's ratios; a null value = not computable from the data, never a guess. */
  ratios: Array<{
    code: 'CAF' | 'MARGE_NETTE' | 'SERVICE_DETTE' | 'TRESORERIE_NETTE' | 'DELAI_CLIENTS' | 'ENDETTEMENT' | 'FONDS_ROULEMENT';
    label: string;
    value: number | null;
    unit: 'FCFA' | '%' | 'jours' | 'x';
    /** One plain sentence: how it is computed. */
    formula: string;
    /** BON / A_SURVEILLER / FAIBLE against thresholds held as programme parameters; null when no threshold applies. */
    reading: 'BON' | 'A_SURVEILLER' | 'FAIBLE' | null;
  }>;
  /** Same headline figures before and after the first disbursement; null when no tranche was released. */
  beforeAfter: {
    pivotDate: string;
    before: { months: number; revenueFcfa: number; chargesFcfa: number; netResultFcfa: number; mortalityPct: number | null };
    after: { months: number; revenueFcfa: number; chargesFcfa: number; netResultFcfa: number; mortalityPct: number | null };
  } | null;
}

/*
  GET  /programme/financing/farms/:farmId/financials?from&to   → FarmFinancials (default: last 12 months)
  GET  /programme/financing/farms/:farmId/financials/pdf?from&to → PDF « États financiers » (bilan, compte de résultat, trésorerie, ratios, mention non audité)
  POST /programme/financing/files/:id/financial-statements { from, to } → FinancingFile
       (generates that PDF and files it as a document under the requirement « États financiers ou état de trésorerie », status DEPOSE; CREER)
*/

// ── Third pass: documents supplied by the farmer, configured by the BCEG ───
// These fields are ADDED to the types above (same JSON objects).

export type DocumentProvider = 'EXPLOITANT' | 'BCEG';
export type DocumentFormat = 'PDF' | 'IMAGE';
/** Who filed a document: the farmer, the BCEG, a technical agent for the farmer, or Fermia (generated statements). */
export type DocumentSource = 'EXPLOITANT' | 'BCEG' | 'AGENT' | 'FERMIA';

/** Added to FinancingRequirement. */
export interface RequirementConfig {
  /** Who must supply the document. Only EXPLOITANT items appear on the farmer's list. */
  providedBy: DocumentProvider;
  /** Accepted formats; empty = both. */
  formats: DocumentFormat[];
  /** Months a document stays valid after its issue date; null = never expires. */
  validityMonths: number | null;
  /** Blank form the BCEG attached for the farmer to download, fill and file back. */
  templateFileName: string | null;
}

/** Added to FinancingDocument. */
export interface DocumentExtras {
  source: DocumentSource;
  /** Issue date given at filing, used with validityMonths. */
  issuedOn: string | null;
  expiresOn: string | null;
  expired: boolean;
}

// ChecklistLine.state gains 'EXPIREE' (the only valid document has expired).

/** One item of the farmer's own list (GET /farms/:farmId/financing → files[].checklist). */
export interface FarmerChecklistLine {
  requirementId: string;
  label: string;
  step: FinancingStep;
  required: boolean;
  help: string | null;
  formats: DocumentFormat[];
  templateFileName: string | null;
  state: 'MANQUANTE' | 'DEPOSEE' | 'VALIDEE' | 'REJETEE' | 'EXPIREE';
  /** Reason given by the BCEG when the last document was rejected. */
  rejectReason: string | null;
  expiresOn: string | null;
  documents: Array<Pick<FinancingDocument, 'id' | 'fileName' | 'sizeBytes' | 'status' | 'uploadedAt' | 'uploadedByName'> & { source: DocumentSource }>;
  /** False once validated and still valid, or when the file is closed. */
  canFile: boolean;
}
// FarmFinancingView.files[] gains: checklist: FarmerChecklistLine[]; toFile: number (items MANQUANTE, REJETEE or EXPIREE that are required).
// FarmFinancingView gains: canFile: boolean (owner, manager, or a technical agent acting for the farmer).

/*
  POST   /programme/financing/requirements/:id/template         multipart file → FinancingRequirement (VALIDER)
  DELETE /programme/financing/requirements/:id/template         → FinancingRequirement (VALIDER)
  GET    /programme/financing/requirements/:id/template         → the file
  POST and PATCH /programme/financing/requirements accept providedBy, formats, validityMonths.
  POST   /programme/financing/files/:id/documents accepts issuedOn.
Farmer side:
  POST   /farms/:farmId/financing/files/:id/documents           multipart file, requirementId, issuedOn? → FarmFinancingView
  GET    /farms/:farmId/financing/files/:id/documents/:docId/file → the file (own file's documents supplied by the farm side only)
  GET    /farms/:farmId/financing/requirements/:rid/template    → the blank form
*/

/** Row of GET /programme/financing/farms?q= (farm picker of a new file). */
export interface FinancingFarmOption {
  id: string;
  code: string;
  name: string;
  provinceName: string | null;
  exploitantName: string | null;
}
