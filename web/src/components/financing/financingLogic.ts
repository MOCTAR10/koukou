import {
  CLAIM_CLASS_LABELS,
  FINANCING_STEPS,
  FINANCING_STEP_LABELS,
  type ChecklistLine,
  type ClaimClass,
  type ClaimFlag,
  type ConsentClause,
  type ConsentStatus,
  type ConsentTemplate,
  type FinancedPerimeter,
  type FinancingDecision,
  type FinancingDocument,
  type FinancingFile,
  type FinancingRequirement,
  type FinancingStep,
  type Instalment,
  type Periodicity,
  type Repayment,
  type UpdateFinancingFileBody,
} from '../../api/types-financing';
import type { StatusTone } from '../ui';

// ── Labels ────────────────────────────────────────────────────────────────

export const DECISION_LABELS: Record<FinancingDecision, string> = { ACCORDE: 'Accordé', REFUSE: 'Refusé', AJOURNE: 'Ajourné' };

export const PERIODICITY_LABELS: Record<Periodicity, string> = {
  MENSUELLE: 'Mensuelle',
  TRIMESTRIELLE: 'Trimestrielle',
  SEMESTRIELLE: 'Semestrielle',
  PAR_BANDE: 'Par bande (à la vente)',
};

export const CLAIM_FLAG_LABELS: Record<Exclude<ClaimFlag, null>, string> = {
  SENSIBLE: 'Sensible',
  RESTRUCTURE: 'Restructurée',
  IRRECOUVRABLE: 'Irrécouvrable',
};

export const METHOD_LABELS: Record<Repayment['method'], string> = {
  VIREMENT: 'Virement',
  MOBILE_MONEY: 'Mobile money',
  ESPECES: 'Espèces',
  CHEQUE: 'Chèque',
  PRELEVEMENT: 'Prélèvement',
};

export const INSTALMENT_LABELS: Record<Instalment['status'], string> = {
  A_VENIR: 'À venir',
  PAYEE: 'Payée',
  PARTIELLE: 'Partielle',
  EN_RETARD: 'En retard',
};

export const INSTALMENT_TONES: Record<Instalment['status'], StatusTone> = {
  A_VENIR: 'neutral',
  PAYEE: 'ok',
  PARTIELLE: 'warning',
  EN_RETARD: 'danger',
};

export const DOC_STATE_LABELS: Record<ChecklistLine['state'], string> = {
  MANQUANTE: 'Manquante',
  DEPOSEE: 'Déposée',
  VALIDEE: 'Validée',
  REJETEE: 'Rejetée',
  EXPIREE: 'Expirée',
};

export const DOC_STATE_TONES: Record<ChecklistLine['state'], StatusTone> = {
  MANQUANTE: 'neutral',
  DEPOSEE: 'info',
  VALIDEE: 'ok',
  REJETEE: 'danger',
  EXPIREE: 'danger',
};

export const DOC_STATUS_LABELS: Record<FinancingDocument['status'], string> = { DEPOSE: 'Déposé', VALIDE: 'Validé', REJETE: 'Rejeté' };

export const DISBURSEMENT_LABELS = { PREVUE: 'Prévue', DEBLOQUEE: 'Débloquée', ANNULEE: 'Annulée' } as const;
export const DISBURSEMENT_TONES: Record<keyof typeof DISBURSEMENT_LABELS, StatusTone> = { PREVUE: 'info', DEBLOQUEE: 'ok', ANNULEE: 'neutral' };

export const CONSENT_TONES: Record<ConsentStatus, StatusTone> = { AUCUN: 'neutral', ACTIF: 'ok', RETIRE: 'warning' };

export const STEP_HINTS: Record<FinancingStep, string> = {
  DEMANDE: 'Le dossier est ouvert et ses pièces se rassemblent.',
  INSTRUCTION: 'La BCEG examine le dossier et vérifie les pièces.',
  DECISION: 'Le comité décide : accord, refus ou ajournement.',
  DECAISSEMENT: 'Les tranches accordées sont débloquées.',
  SUIVI: 'Le crédit est en cours de remboursement.',
  CLOTURE: 'Le dossier est clos.',
};

/** Colours of the claim classes in charts; always paired with the label (never colour alone). */
export const CLAIM_CLASS_COLORS: Record<ClaimClass, string> = {
  SAIN: '#059669',
  SENSIBLE: '#d97706',
  IMPAYE: '#dc2626',
  DOUTEUX: '#7f1d1d',
  RESTRUCTURE: '#2a789f',
  IRRECOUVRABLE: '#1e293b',
  SOLDE: '#94a3b8',
  SANS_OBJET: '#cbd5e1',
};

export const CLAIM_CLASS_TONES: Record<ClaimClass, StatusTone> = {
  SANS_OBJET: 'neutral',
  SAIN: 'ok',
  SENSIBLE: 'warning',
  IMPAYE: 'danger',
  DOUTEUX: 'danger',
  RESTRUCTURE: 'info',
  IRRECOUVRABLE: 'danger',
  SOLDE: 'neutral',
};

/** Order of the classes in the breakdown: healthy first, then by severity. */
export const CLAIM_CLASS_ORDER: readonly ClaimClass[] = ['SAIN', 'SENSIBLE', 'RESTRUCTURE', 'IMPAYE', 'DOUTEUX', 'IRRECOUVRABLE', 'SOLDE', 'SANS_OBJET'];

export function claimClassLabel(key: string): string {
  return CLAIM_CLASS_LABELS[key as ClaimClass] ?? key;
}

export function claimClassColor(key: string): string {
  return CLAIM_CLASS_COLORS[key as ClaimClass] ?? '#94a3b8';
}

/** Buckets in the severity order (unknown keys last, order kept). */
export function sortClassBuckets<T extends { key: string }>(buckets: readonly T[]): T[] {
  const rank = (k: string) => {
    const i = CLAIM_CLASS_ORDER.indexOf(k as ClaimClass);
    return i === -1 ? CLAIM_CLASS_ORDER.length : i;
  };
  return [...buckets].sort((a, b) => rank(a.key) - rank(b.key));
}

export function perimeterText(p: FinancedPerimeter): { title: string; meaning: string } {
  switch (p) {
    case 'PROGRAMME':
      return { title: 'Toutes les fermes du programme', meaning: 'La BCEG peut lire les fermes du programme, qu’un dossier ou un consentement existe ou non.' };
    case 'DOSSIERS':
      return { title: 'Les fermes qui ont un dossier de financement', meaning: 'Une ferme devient lisible dès qu’un dossier est ouvert à son nom.' };
    case 'CONSENTEMENT':
      return {
        title: 'Les fermes dont l’exploitant a donné son consentement',
        meaning: 'Un retrait de consentement ferme aussitôt l’accès aux données de la ferme.',
      };
  }
}

// ── Numbers ────────────────────────────────────────────────────────────────

const nf = (n: number, digits: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: digits });

/** Compact amount for tiles and axes: « 1,25 Md FCFA », « 250,5 M FCFA », « 12 000 FCFA ». */
export function fcfaCompact(n: number | null | undefined, unit = true): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const suffix = unit ? ' FCFA' : '';
  if (abs >= 1_000_000_000) return `${nf(n / 1_000_000_000, 2)} Md${suffix}`;
  if (abs >= 1_000_000) return `${nf(n / 1_000_000, 1)} M${suffix}`;
  return `${nf(Math.round(n) || 0, 0)}${suffix}`;
}

export function pctText(n: number | null | undefined, digits = 1): string {
  return n == null || !Number.isFinite(n) ? '—' : `${nf(n, digits)} %`;
}

export function daysLateText(days: number): string {
  if (!days || days <= 0) return '—';
  return days === 1 ? '1 jour' : `${days.toLocaleString('fr-FR')} jours`;
}

/** Share of `part` in `total` as a percent, 0 when nothing. */
export function sharePct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** `2026-03` -> « mars »; January carries its year (« janv. 26 ») so a 12-month axis reads. */
export function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(month);
  if (!m) return month;
  const idx = Number(m[2]) - 1;
  const name = MONTHS[idx] ?? month;
  return idx === 0 ? `${name} ${m[1].slice(2)}` : name;
}

// ── Stepper ────────────────────────────────────────────────────────────────

export type StepState = 'done' | 'current' | 'todo';

export interface StepItem {
  step: FinancingStep;
  label: string;
  state: StepState;
}

export function stepperState(current: FinancingStep): StepItem[] {
  const at = FINANCING_STEPS.indexOf(current);
  return FINANCING_STEPS.map((step, i) => ({
    step,
    label: FINANCING_STEP_LABELS[step],
    state: i < at ? 'done' : i === at ? 'current' : 'todo',
  }));
}

export function nextStep(step: FinancingStep): FinancingStep | null {
  const i = FINANCING_STEPS.indexOf(step);
  return i >= 0 && i < FINANCING_STEPS.length - 1 ? FINANCING_STEPS[i + 1] : null;
}

/**
 * Step a decision leads to: an agreement opens the disbursement, a refusal closes the file, an adjournment
 * keeps it at the decision step (the contract names `to` and `decision` but not their pairing).
 */
export function targetForDecision(decision: FinancingDecision): FinancingStep {
  return decision === 'ACCORDE' ? 'DECAISSEMENT' : decision === 'REFUSE' ? 'CLOTURE' : 'DECISION';
}

export interface PassStepState {
  /** The button exists: the account may validate and a next step exists. */
  available: boolean;
  /** The button is clickable. */
  enabled: boolean;
  /** Missing items, shown in clear. */
  blockers: string[];
  /** The decision step asks for the decision instead of a plain pass. */
  needsDecision: boolean;
  next: FinancingStep | null;
}

export function passStepState(file: Pick<FinancingFile, 'step' | 'blockers' | 'rights'>): PassStepState {
  const next = nextStep(file.step);
  const available = file.rights.validate && next !== null;
  return {
    available,
    enabled: available && file.blockers.length === 0,
    blockers: file.blockers,
    needsDecision: file.step === 'DECISION',
    next,
  };
}

// ── Checklist ──────────────────────────────────────────────────────────────

export interface ChecklistGroup {
  step: FinancingStep;
  label: string;
  lines: ChecklistLine[];
  /** Required lines of the group with a deposited or validated document. */
  provided: number;
  required: number;
}

const PROVIDED: ReadonlyArray<ChecklistLine['state']> = ['DEPOSEE', 'VALIDEE'];

/** Lines grouped by step, in step order then `sort`; a deactivated requirement stays only when documents hang on it. */
export function groupChecklist(lines: readonly ChecklistLine[]): ChecklistGroup[] {
  const groups: ChecklistGroup[] = [];
  for (const step of FINANCING_STEPS) {
    const inStep = lines
      .filter((l) => l.requirement.step === step && (l.requirement.active || l.documents.length > 0))
      .sort((a, b) => a.requirement.sort - b.requirement.sort || a.requirement.label.localeCompare(b.requirement.label, 'fr'));
    if (inStep.length === 0) continue;
    const requiredLines = inStep.filter((l) => l.requirement.required && l.requirement.active);
    groups.push({
      step,
      label: FINANCING_STEP_LABELS[step],
      lines: inStep,
      required: requiredLines.length,
      provided: requiredLines.filter((l) => PROVIDED.includes(l.state)).length,
    });
  }
  return groups;
}

/** Same grouping for the bank's requirement list (framework editor): all items, inactive included. */
export function groupRequirements(items: readonly FinancingRequirement[]): Array<{ step: FinancingStep; label: string; items: FinancingRequirement[] }> {
  return FINANCING_STEPS.map((step) => ({
    step,
    label: FINANCING_STEP_LABELS[step],
    items: items.filter((r) => r.step === step).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'fr')),
  })).filter((g) => g.items.length > 0);
}

/** Swap with the neighbour: the two `{ id, sort }` updates, or null at the edge. */
export function moveRequirement(
  siblings: readonly FinancingRequirement[],
  id: string,
  dir: -1 | 1,
): Array<{ id: string; sort: number }> | null {
  const i = siblings.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= siblings.length) return null;
  const a = siblings[i];
  const b = siblings[j];
  // Equal sorts (never ordered yet) must still swap: fall back on positions.
  const sa = a.sort === b.sort ? j : b.sort;
  const sb = a.sort === b.sort ? i : a.sort;
  return [
    { id: a.id, sort: sa },
    { id: b.id, sort: sb },
  ];
}

export function documentProgress(d: { expected: number; provided: number; validated: number }): { providedPct: number; validatedPct: number } {
  return { providedPct: sharePct(d.provided, d.expected), validatedPct: sharePct(d.validated, d.expected) };
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${nf(n / 1024, 0)} Ko`;
  return `${nf(n / (1024 * 1024), 1)} Mo`;
}

// ── Schedule and repayments ────────────────────────────────────────────────

export function scheduleTotals(instalments: readonly Instalment[]): { principal: number; interest: number; due: number; paid: number; remaining: number; late: number } {
  let principal = 0;
  let interest = 0;
  let due = 0;
  let paid = 0;
  let late = 0;
  for (const i of instalments) {
    principal += i.principalFcfa;
    interest += i.interestFcfa;
    due += i.dueFcfa;
    paid += i.paidFcfa;
    if (i.status === 'EN_RETARD') late += Math.max(0, i.dueFcfa - i.paidFcfa);
  }
  return { principal, interest, due, paid, remaining: Math.max(0, due - paid), late };
}

/** First instalment not fully paid (the next one to collect). */
export function nextInstalment(instalments: readonly Instalment[]): Instalment | null {
  return [...instalments].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).find((i) => i.status !== 'PAYEE') ?? null;
}

// ── Consent template ───────────────────────────────────────────────────────

export function allClausesTicked(clauses: readonly ConsentClause[], ticked: readonly string[]): boolean {
  return clauses.length > 0 && clauses.every((c) => ticked.includes(c.code));
}

export function currentTemplate(templates: readonly ConsentTemplate[]): ConsentTemplate | null {
  return templates.find((t) => t.active) ?? null;
}

export function templateHistory(templates: readonly ConsentTemplate[]): ConsentTemplate[] {
  return [...templates].sort((a, b) => b.version - a.version);
}

export function addCategory(list: readonly string[], raw: string): string[] {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (!value || list.some((c) => c.toLowerCase() === value.toLowerCase())) return [...list];
  return [...list, value];
}

export interface TemplateDraft {
  title: string;
  purpose: string;
  retention: string;
  dataCategories: string[];
  confirmedClauses: string[];
  hasFile: boolean;
}

/** French reason why the template form can't be sent yet, or null. */
export function templateError(d: TemplateDraft, clauses: readonly ConsentClause[]): string | null {
  if (!d.hasFile) return 'Choisissez le document PDF du modèle.';
  if (!d.title.trim()) return 'Donnez un titre au modèle.';
  if (!d.purpose.trim()) return 'Indiquez la finalité : à quoi servent les données.';
  if (d.dataCategories.length === 0) return 'Ajoutez au moins une catégorie de données.';
  if (!d.retention.trim()) return 'Indiquez la durée de conservation.';
  if (!allClausesTicked(clauses, d.confirmedClauses)) return 'Cochez toutes les mentions obligatoires : la BCEG confirme qu’elles figurent dans son document.';
  return null;
}

// ── Filters and terms ──────────────────────────────────────────────────────

export const FILES_PAGE_SIZE = 25;

export interface FileFilters {
  step: FinancingStep | '';
  claimClass: ClaimClass | '';
  province: string;
  q: string;
  page: number;
}

export const EMPTY_FILE_FILTERS: FileFilters = { step: '', claimClass: '', province: '', q: '', page: 1 };

export function parseFileFilters(params: URLSearchParams): FileFilters {
  const step = params.get('etape') ?? '';
  const cls = params.get('classe') ?? '';
  const page = Number(params.get('page') ?? 1);
  return {
    step: (FINANCING_STEPS as readonly string[]).includes(step) ? (step as FinancingStep) : '',
    claimClass: cls in CLAIM_CLASS_LABELS ? (cls as ClaimClass) : '',
    province: params.get('province') ?? '',
    q: (params.get('q') ?? '').trim(),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** URL params of the filters, keeping the unrelated ones (`dossier`). */
export function fileFilterParams(f: FileFilters, base?: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams(base);
  const set = (k: string, v: string) => (v ? out.set(k, v) : out.delete(k));
  set('etape', f.step);
  set('classe', f.claimClass);
  set('province', f.province);
  set('q', f.q);
  set('page', f.page > 1 ? String(f.page) : '');
  return out;
}

/** Query string of `GET /programme/financing/files`. */
export function filesQuery(f: FileFilters, pageSize = FILES_PAGE_SIZE): string {
  const qs = new URLSearchParams();
  if (f.step) qs.set('step', f.step);
  if (f.claimClass) qs.set('claimClass', f.claimClass);
  if (f.province) qs.set('province', f.province);
  if (f.q) qs.set('q', f.q);
  qs.set('page', String(f.page));
  qs.set('pageSize', String(pageSize));
  return `?${qs.toString()}`;
}

/** « 26–50 sur 112 ». */
export function pageRange(page: number, pageSize: number, total: number): string {
  if (total === 0) return '0 résultat';
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return `${from}–${to} sur ${total.toLocaleString('fr-FR')}`;
}

/** The terms the form changed, as a PATCH body (nothing equal to the file's value). */
export function termsPatch(file: FinancingFile, draft: UpdateFinancingFileBody): UpdateFinancingFileBody {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    const current = (file as unknown as Record<string, unknown>)[key] ?? null;
    const next = value === '' ? null : (value ?? null);
    if (next !== current) out[key] = next;
  }
  return out as UpdateFinancingFileBody;
}

/** Percent typed with a comma (« 8,5 ») to a number; null when empty, undefined when invalid. */
export function parsePct(raw: string): number | null | undefined {
  const t = raw.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : undefined;
}

/** Whole number of months; null when empty, undefined when invalid. */
export function parseCount(raw: string): number | null | undefined {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= 600 ? n : undefined;
}
