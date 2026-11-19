import {
  ClaimFlag,
  DisbursementStatus,
  FinancingDecision,
  FinancingPeriodicity,
  FinancingStep,
} from '../../common/enums/financing.enum.js';

/**
 * Pure rules of the financer workspace: step passing, tranches, schedule
 * (constant annuity), allocation of the repayments, claim class (COBAC
 * R-2018/01). No I/O. Money is integer FCFA, dates `YYYY-MM-DD` (Libreville
 * day, passed in by the caller).
 */

export const FINANCING_STEP_ORDER: readonly FinancingStep[] = [
  FinancingStep.DEMANDE,
  FinancingStep.INSTRUCTION,
  FinancingStep.DECISION,
  FinancingStep.DECAISSEMENT,
  FinancingStep.SUIVI,
  FinancingStep.CLOTURE,
];

export const FINANCING_STEP_LABELS: Readonly<Record<FinancingStep, string>> = {
  DEMANDE: 'Demande',
  INSTRUCTION: 'Instruction',
  DECISION: 'Décision',
  DECAISSEMENT: 'Décaissement',
  SUIVI: 'Suivi',
  CLOTURE: 'Clôture',
};

/** Months between two instalments (PAR_BANDE = every two months, a band cycle). */
export const PERIODICITY_MONTHS: Readonly<Record<FinancingPeriodicity, number>> =
  {
    MENSUELLE: 1,
    TRIMESTRIELLE: 3,
    SEMESTRIELLE: 6,
    PAR_BANDE: 2,
  };

/** Largest amount stored (integer column). */
export const MAX_FCFA = 2_000_000_000;

// ── Dates ──────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` + `months`, the day kept (clamped to the month's last day). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

// ── Schedule ───────────────────────────────────────────────────────────────

export interface ScheduleInput {
  grantedFcfa: number;
  /** Annual rate, percent. */
  ratePct: number;
  durationMonths: number;
  /** Interest-only months at the start. */
  graceMonths: number;
  periodicity: FinancingPeriodicity;
  firstDueDate: string;
}

export interface ScheduleRow {
  number: number;
  dueDate: string;
  principalFcfa: number;
  interestFcfa: number;
}

/** French reason why the terms cannot give a schedule, or null. */
export function scheduleTermsProblem(
  t: Partial<Omit<ScheduleInput, 'firstDueDate'>>,
): string | null {
  if (!t.grantedFcfa || t.grantedFcfa <= 0) {
    return 'Le montant accordé est à renseigner avant de générer l’échéancier.';
  }
  if (t.ratePct === undefined || t.ratePct === null || t.ratePct < 0) {
    return 'Le taux annuel est à renseigner avant de générer l’échéancier.';
  }
  if (!t.durationMonths || t.durationMonths < 1) {
    return 'La durée (en mois) est à renseigner avant de générer l’échéancier.';
  }
  if (!t.periodicity) {
    return 'La périodicité est à renseigner avant de générer l’échéancier.';
  }
  const grace = t.graceMonths ?? 0;
  if (grace < 0 || grace >= t.durationMonths) {
    return 'Le différé doit être inférieur à la durée du crédit.';
  }
  return null;
}

/**
 * Constant-annuity schedule in integer FCFA. Periods = ceil(duration / step);
 * the first ceil(grace / step) are interest-only (capped so one amortising
 * period remains); the annuity is constant on the others; the last instalment
 * repays the remaining principal, so the principal sums exactly to the
 * amount granted and rounding never accumulates.
 */
export function generateSchedule(input: ScheduleInput): ScheduleRow[] {
  const problem = scheduleTermsProblem(input);
  if (problem) throw new Error(problem);
  const step = PERIODICITY_MONTHS[input.periodicity];
  const periods = Math.max(1, Math.ceil(input.durationMonths / step));
  const graceCount = Math.min(
    Math.ceil(input.graceMonths / step),
    periods - 1,
  );
  const amortising = periods - graceCount;
  const rate = (input.ratePct / 100) * (step / 12);
  const annuity =
    rate === 0
      ? input.grantedFcfa / amortising
      : (input.grantedFcfa * rate) / (1 - Math.pow(1 + rate, -amortising));
  const rows: ScheduleRow[] = [];
  let balance = input.grantedFcfa;
  for (let k = 0; k < periods; k++) {
    const interest = Math.round(balance * rate);
    let principal: number;
    if (k < graceCount) principal = 0;
    else if (k === periods - 1) principal = balance;
    else principal = Math.min(balance, Math.max(0, Math.round(annuity) - interest));
    rows.push({
      number: k + 1,
      dueDate: addMonths(input.firstDueDate, k * step),
      principalFcfa: principal,
      interestFcfa: interest,
    });
    balance -= principal;
  }
  return rows;
}

// ── Allocation of the repayments ───────────────────────────────────────────

export interface AllocInstalment {
  number: number;
  dueDate: string;
  principalFcfa: number;
  interestFcfa: number;
}

export interface Allocation {
  /** Paid amount of each instalment (same order as the input). */
  paid: number[];
  /** Principal repaid: the paid part beyond interest, plus any surplus. */
  principalRepaidFcfa: number;
  /** Paid beyond the whole schedule (early repayment, counted as principal). */
  surplusFcfa: number;
}

/**
 * Non-cancelled repayments fill the instalments oldest first, an instalment
 * being settled (interest then principal) before the next one receives
 * anything. What exceeds the schedule is early repayment of principal.
 */
export function allocateRepayments(
  instalments: readonly AllocInstalment[],
  repaymentAmounts: readonly number[],
): Allocation {
  let pool = repaymentAmounts.reduce((s, a) => s + a, 0);
  const ordered = instalments
    .map((it, index) => ({ it, index }))
    .sort(
      (a, b) =>
        a.it.dueDate.localeCompare(b.it.dueDate) || a.it.number - b.it.number,
    );
  const paid = Array.from<number>({ length: instalments.length }).fill(0);
  let principal = 0;
  for (const { it, index } of ordered) {
    const due = it.principalFcfa + it.interestFcfa;
    const take = Math.min(pool, due);
    paid[index] = take;
    pool -= take;
    principal += Math.max(0, take - it.interestFcfa);
  }
  return {
    paid,
    principalRepaidFcfa: principal + pool,
    surplusFcfa: pool,
  };
}

export type InstalmentStatus = 'A_VENIR' | 'PAYEE' | 'PARTIELLE' | 'EN_RETARD';

export interface InstalmentState {
  paidFcfa: number;
  dueFcfa: number;
  status: InstalmentStatus;
  daysLate: number;
}

/** Status and days late of one instalment on `today`. */
export function instalmentState(
  it: AllocInstalment,
  paidFcfa: number,
  today: string,
): InstalmentState {
  const dueFcfa = it.principalFcfa + it.interestFcfa;
  if (paidFcfa >= dueFcfa) {
    return { paidFcfa, dueFcfa, status: 'PAYEE', daysLate: 0 };
  }
  const late = daysBetween(it.dueDate, today);
  if (late > 0) {
    return { paidFcfa, dueFcfa, status: 'EN_RETARD', daysLate: late };
  }
  return {
    paidFcfa,
    dueFcfa,
    status: paidFcfa > 0 ? 'PARTIELLE' : 'A_VENIR',
    daysLate: 0,
  };
}

// ── Claim class ────────────────────────────────────────────────────────────

export type ClaimClass =
  | 'SANS_OBJET'
  | 'SAIN'
  | 'SENSIBLE'
  | 'IMPAYE'
  | 'DOUTEUX'
  | 'RESTRUCTURE'
  | 'IRRECOUVRABLE'
  | 'SOLDE';

export interface ClaimInput {
  grantedFcfa: number | null;
  disbursedFcfa: number;
  scheduledFcfa: number;
  /** Every instalment paid in full (and at least one scheduled). */
  allPaid: boolean;
  /** Days since the oldest unpaid due date, 0 when none. */
  daysLate: number;
  claimFlag: ClaimFlag | null;
  /** Programme parameter FINANCEMENT_IMPAYE_JOURS (COBAC R-2018/01 art. 8-9). */
  impayeDays: number;
}

/**
 * Claim class at read time. IRRECOUVRABLE and RESTRUCTURE (set by the bank)
 * always win; nothing granted or disbursed = SANS_OBJET; all paid = SOLDE;
 * otherwise by days late (0 = SAIN, up to the threshold = IMPAYE, beyond =
 * DOUTEUX), the bank's SENSIBLE flag replacing SAIN only.
 */
export function claimClassOf(i: ClaimInput): ClaimClass {
  if (
    i.claimFlag === ClaimFlag.IRRECOUVRABLE ||
    i.claimFlag === ClaimFlag.RESTRUCTURE
  ) {
    return i.claimFlag;
  }
  if (!i.grantedFcfa || i.disbursedFcfa <= 0) return 'SANS_OBJET';
  if (i.scheduledFcfa > 0 && i.allPaid) return 'SOLDE';
  if (i.daysLate <= 0) {
    return i.claimFlag === ClaimFlag.SENSIBLE ? 'SENSIBLE' : 'SAIN';
  }
  return i.daysLate > i.impayeDays ? 'DOUTEUX' : 'IMPAYE';
}

// ── Tranches ───────────────────────────────────────────────────────────────

export interface TrancheLike {
  amountFcfa: number;
  status: DisbursementStatus;
}

export const sumTranches = (
  tranches: readonly TrancheLike[],
  only?: DisbursementStatus,
): number =>
  tranches
    .filter((t) =>
      only ? t.status === only : t.status !== DisbursementStatus.ANNULEE,
    )
    .reduce((s, t) => s + t.amountFcfa, 0);

/** French reason why a tranche of `amount` cannot be added, or null. */
export function trancheProblem(
  file: { grantedFcfa: number | null; decision: FinancingDecision | null; step: FinancingStep },
  tranches: readonly TrancheLike[],
  amount: number,
): string | null {
  if (file.decision === FinancingDecision.REFUSE || file.step === FinancingStep.CLOTURE) {
    return 'Le dossier est clos : aucune tranche ne peut être ajoutée.';
  }
  if (!file.grantedFcfa || file.grantedFcfa <= 0) {
    return 'Le montant accordé est à renseigner avant de prévoir des tranches.';
  }
  const planned = sumTranches(tranches);
  if (planned + amount > file.grantedFcfa) {
    return `Les tranches (${planned + amount} FCFA) dépasseraient le montant accordé (${file.grantedFcfa} FCFA).`;
  }
  return null;
}

/** A tranche is released from the step DECAISSEMENT or SUIVI only. */
export function canReleaseAtStep(step: FinancingStep): boolean {
  return step === FinancingStep.DECAISSEMENT || step === FinancingStep.SUIVI;
}

// ── Step passing ───────────────────────────────────────────────────────────

export interface StepPassInput {
  step: FinancingStep;
  to: FinancingStep;
  /** Decision sent with the pass (or already stored). */
  decision: FinancingDecision | null;
  grantedFcfa: number | null;
  /** Labels of the missing required documents of the current step. */
  blockers: readonly string[];
  outstandingFcfa: number;
}

export type StepPassVerdict =
  | { ok: true; to: FinancingStep; decision: FinancingDecision | null }
  | { ok: false; status: 400 | 409; message: string };

/**
 * Whether a file may pass from its step to `to`. Steps go forward one at a
 * time; a pass is refused while a required document of the current step is
 * missing (409, listed); leaving DECISION needs a decision (REFUSE closes the
 * file, AJOURNE keeps it at DECISION); DECAISSEMENT needs the amount granted;
 * CLOTURE needs nothing outstanding, or a REFUSE.
 */
export function stepPassVerdict(i: StepPassInput): StepPassVerdict {
  const bad = (message: string): StepPassVerdict => ({ ok: false, status: 400, message });
  const conflict = (message: string): StepPassVerdict => ({ ok: false, status: 409, message });
  if (i.step === FinancingStep.CLOTURE) {
    return conflict('Le dossier est clos : il ne change plus d’étape.');
  }
  if (i.step === FinancingStep.DECISION) {
    if (!i.decision) {
      return bad('La décision du comité (accordé, refusé ou ajourné) est à renseigner.');
    }
    if (i.decision === FinancingDecision.REFUSE) {
      return { ok: true, to: FinancingStep.CLOTURE, decision: i.decision };
    }
    if (i.decision === FinancingDecision.AJOURNE) {
      return { ok: true, to: FinancingStep.DECISION, decision: i.decision };
    }
  }
  const index = FINANCING_STEP_ORDER.indexOf(i.step);
  const expected = FINANCING_STEP_ORDER[index + 1];
  if (i.to !== expected) {
    return bad(
      `Les étapes se franchissent une à une : après « ${FINANCING_STEP_LABELS[i.step]} » vient « ${FINANCING_STEP_LABELS[expected]} ».`,
    );
  }
  if (i.blockers.length > 0) {
    return conflict(
      `Étape « ${FINANCING_STEP_LABELS[i.step]} » : document(s) obligatoire(s) manquant(s) : ${i.blockers.join(' ; ')}.`,
    );
  }
  if (i.to === FinancingStep.DECAISSEMENT && (!i.grantedFcfa || i.grantedFcfa <= 0)) {
    return bad('Le montant accordé est à renseigner avant le décaissement.');
  }
  if (i.to === FinancingStep.CLOTURE && i.outstandingFcfa > 0) {
    return conflict(
      `Clôture impossible : il reste ${i.outstandingFcfa} FCFA d’encours à rembourser.`,
    );
  }
  return {
    ok: true,
    to: i.to,
    decision: i.step === FinancingStep.DECISION ? i.decision : null,
  };
}
