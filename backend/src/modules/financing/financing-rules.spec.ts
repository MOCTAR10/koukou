import {
  ClaimFlag,
  DisbursementStatus,
  FinancingDecision,
  FinancingPeriodicity,
  FinancingStep,
} from '../../common/enums/financing.enum.js';
import {
  addMonths,
  allocateRepayments,
  canReleaseAtStep,
  claimClassOf,
  daysBetween,
  generateSchedule,
  instalmentState,
  scheduleTermsProblem,
  stepPassVerdict,
  trancheProblem,
} from './financing-rules.js';

const sum = (rows: { principalFcfa: number }[]) =>
  rows.reduce((s, r) => s + r.principalFcfa, 0);

describe('dates', () => {
  it('adds months keeping the day, clamped to the end of month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
  });
  it('counts days between two days', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(daysBetween('2026-02-01', '2026-01-01')).toBe(-31);
  });
});

describe('generateSchedule', () => {
  const base = {
    grantedFcfa: 5_000_000,
    ratePct: 12,
    durationMonths: 12,
    graceMonths: 0,
    periodicity: FinancingPeriodicity.MENSUELLE,
    firstDueDate: '2026-12-05',
  };

  it('repays exactly the amount granted, in integer FCFA', () => {
    for (const periodicity of Object.values(FinancingPeriodicity)) {
      for (const grantedFcfa of [5_000_000, 1_234_567, 999_999, 3]) {
        const rows = generateSchedule({ ...base, grantedFcfa, periodicity });
        expect(sum(rows)).toBe(grantedFcfa);
        for (const r of rows) {
          expect(Number.isInteger(r.principalFcfa)).toBe(true);
          expect(Number.isInteger(r.interestFcfa)).toBe(true);
          expect(r.principalFcfa).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('is a constant annuity (last instalment absorbs the rounding)', () => {
    const rows = generateSchedule(base);
    expect(rows).toHaveLength(12);
    const dues = rows.map((r) => r.principalFcfa + r.interestFcfa);
    // 12 % a year over 12 months on 5 M: about 444 244 per month.
    expect(dues[0]).toBeGreaterThan(444_000);
    expect(dues[0]).toBeLessThan(445_000);
    for (const d of dues.slice(0, -1)) expect(Math.abs(d - dues[0])).toBeLessThanOrEqual(1);
    expect(Math.abs(dues[11] - dues[0])).toBeLessThan(20);
    expect(rows[0].interestFcfa).toBe(50_000);
  });

  it('spaces the due dates by the periodicity', () => {
    const q = generateSchedule({ ...base, periodicity: FinancingPeriodicity.TRIMESTRIELLE });
    expect(q.map((r) => r.dueDate)).toEqual([
      '2026-12-05',
      '2027-03-05',
      '2027-06-05',
      '2027-09-05',
    ]);
    const band = generateSchedule({ ...base, periodicity: FinancingPeriodicity.PAR_BANDE });
    expect(band).toHaveLength(6);
    expect(band[1].dueDate).toBe('2027-02-05');
    const s = generateSchedule({ ...base, periodicity: FinancingPeriodicity.SEMESTRIELLE });
    expect(s).toHaveLength(2);
  });

  it('pays interest only during the grace months', () => {
    const rows = generateSchedule({ ...base, graceMonths: 3 });
    expect(rows).toHaveLength(12);
    expect(rows.slice(0, 3).every((r) => r.principalFcfa === 0)).toBe(true);
    expect(rows.slice(0, 3).every((r) => r.interestFcfa === 50_000)).toBe(true);
    expect(rows[3].principalFcfa).toBeGreaterThan(0);
    expect(sum(rows)).toBe(5_000_000);
  });

  it('handles a zero rate', () => {
    const rows = generateSchedule({ ...base, ratePct: 0, grantedFcfa: 1_000_001 });
    expect(rows.every((r) => r.interestFcfa === 0)).toBe(true);
    expect(sum(rows)).toBe(1_000_001);
  });

  it('refuses incomplete or inconsistent terms', () => {
    expect(scheduleTermsProblem({ ...base, grantedFcfa: 0 })).toMatch(/montant/);
    expect(scheduleTermsProblem({ ...base, durationMonths: 0 })).toMatch(/durée/);
    expect(scheduleTermsProblem({ ...base, graceMonths: 12 })).toMatch(/différé/);
    expect(scheduleTermsProblem(base)).toBeNull();
    expect(() => generateSchedule({ ...base, ratePct: -1 })).toThrow();
  });
});

describe('allocateRepayments', () => {
  const its = [
    { number: 1, dueDate: '2026-01-10', principalFcfa: 80, interestFcfa: 20 },
    { number: 2, dueDate: '2026-02-10', principalFcfa: 80, interestFcfa: 20 },
    { number: 3, dueDate: '2026-03-10', principalFcfa: 80, interestFcfa: 20 },
  ];

  it('fills the oldest instalment first', () => {
    const a = allocateRepayments(its, [100, 50]);
    expect(a.paid).toEqual([100, 50, 0]);
    // 100 settles #1 (20 interest + 80 principal); 50 on #2: 20 interest, 30 principal.
    expect(a.principalRepaidFcfa).toBe(110);
    expect(a.surplusFcfa).toBe(0);
  });

  it('is independent of the order of the instalments and repayments', () => {
    const shuffled = [its[2], its[0], its[1]];
    const a = allocateRepayments(shuffled, [30, 120]);
    expect(a.paid).toEqual([0, 100, 50]);
  });

  it('counts a surplus as early repayment of principal', () => {
    const a = allocateRepayments(its, [350]);
    expect(a.paid).toEqual([100, 100, 100]);
    expect(a.surplusFcfa).toBe(50);
    expect(a.principalRepaidFcfa).toBe(290);
  });

  it('without a schedule, everything repaid is principal', () => {
    expect(allocateRepayments([], [40, 60])).toEqual({
      paid: [],
      principalRepaidFcfa: 100,
      surplusFcfa: 100,
    });
  });
});

describe('instalmentState', () => {
  const it1 = { number: 1, dueDate: '2026-11-10', principalFcfa: 80, interestFcfa: 20 };
  it('is paid, late, partial or upcoming', () => {
    expect(instalmentState(it1, 100, '2026-12-31').status).toBe('PAYEE');
    expect(instalmentState(it1, 0, '2026-11-10').status).toBe('A_VENIR');
    expect(instalmentState(it1, 40, '2026-11-10').status).toBe('PARTIELLE');
    const late = instalmentState(it1, 40, '2026-11-20');
    expect(late.status).toBe('EN_RETARD');
    expect(late.daysLate).toBe(10);
  });
});

describe('claimClassOf', () => {
  const ok = {
    grantedFcfa: 1000,
    disbursedFcfa: 1000,
    scheduledFcfa: 1100,
    allPaid: false,
    daysLate: 0,
    claimFlag: null,
    impayeDays: 90,
  };
  it('is SANS_OBJET without grant or disbursement', () => {
    expect(claimClassOf({ ...ok, grantedFcfa: null })).toBe('SANS_OBJET');
    expect(claimClassOf({ ...ok, disbursedFcfa: 0 })).toBe('SANS_OBJET');
  });
  it('is SOLDE when everything scheduled is paid', () => {
    expect(claimClassOf({ ...ok, allPaid: true })).toBe('SOLDE');
    expect(claimClassOf({ ...ok, allPaid: true, scheduledFcfa: 0 })).toBe('SAIN');
  });
  it('follows the days late and the 90-day threshold', () => {
    expect(claimClassOf(ok)).toBe('SAIN');
    expect(claimClassOf({ ...ok, daysLate: 1 })).toBe('IMPAYE');
    expect(claimClassOf({ ...ok, daysLate: 90 })).toBe('IMPAYE');
    expect(claimClassOf({ ...ok, daysLate: 91 })).toBe('DOUTEUX');
    expect(claimClassOf({ ...ok, daysLate: 31, impayeDays: 30 })).toBe('DOUTEUX');
  });
  it('lets the bank flag win as specified', () => {
    expect(claimClassOf({ ...ok, claimFlag: ClaimFlag.SENSIBLE })).toBe('SENSIBLE');
    expect(claimClassOf({ ...ok, claimFlag: ClaimFlag.SENSIBLE, daysLate: 10 })).toBe('IMPAYE');
    expect(claimClassOf({ ...ok, claimFlag: ClaimFlag.IRRECOUVRABLE, daysLate: 10 })).toBe('IRRECOUVRABLE');
    expect(claimClassOf({ ...ok, claimFlag: ClaimFlag.RESTRUCTURE, daysLate: 200 })).toBe('RESTRUCTURE');
    expect(claimClassOf({ ...ok, claimFlag: ClaimFlag.RESTRUCTURE, allPaid: true })).toBe('RESTRUCTURE');
  });
});

describe('tranches', () => {
  const file = { grantedFcfa: 1000, decision: FinancingDecision.ACCORDE, step: FinancingStep.DECAISSEMENT };
  const t = (amountFcfa: number, status = DisbursementStatus.PREVUE) => ({ amountFcfa, status });
  it('keeps the sum of non-cancelled tranches under the amount granted', () => {
    expect(trancheProblem(file, [t(600)], 400)).toBeNull();
    expect(trancheProblem(file, [t(600)], 401)).toMatch(/dépasseraient/);
    expect(trancheProblem(file, [t(600, DisbursementStatus.ANNULEE)], 1000)).toBeNull();
  });
  it('refuses a closed or ungranted file', () => {
    expect(trancheProblem({ ...file, decision: FinancingDecision.REFUSE }, [], 1)).toMatch(/clos/);
    expect(trancheProblem({ ...file, grantedFcfa: null }, [], 1)).toMatch(/accordé/);
  });
  it('is released from DECAISSEMENT or SUIVI only', () => {
    expect(canReleaseAtStep(FinancingStep.DECAISSEMENT)).toBe(true);
    expect(canReleaseAtStep(FinancingStep.SUIVI)).toBe(true);
    expect(canReleaseAtStep(FinancingStep.DECISION)).toBe(false);
    expect(canReleaseAtStep(FinancingStep.CLOTURE)).toBe(false);
  });
});

describe('stepPassVerdict', () => {
  const base = {
    step: FinancingStep.DEMANDE,
    to: FinancingStep.INSTRUCTION,
    decision: null,
    grantedFcfa: null,
    blockers: [] as string[],
    outstandingFcfa: 0,
  };
  it('goes forward one step at a time', () => {
    expect(stepPassVerdict(base).ok).toBe(true);
    const skip = stepPassVerdict({ ...base, to: FinancingStep.DECISION });
    expect(skip).toMatchObject({ ok: false, status: 400 });
    const back = stepPassVerdict({ ...base, step: FinancingStep.INSTRUCTION, to: FinancingStep.DEMANDE });
    expect(back.ok).toBe(false);
  });
  it('is blocked while a required document is missing, with the list', () => {
    const v = stepPassVerdict({ ...base, blockers: ['Formulaire', 'Pièce d’identité'] });
    expect(v).toMatchObject({ ok: false, status: 409 });
    expect((v as { message: string }).message).toContain('Formulaire ; Pièce d’identité');
  });
  it('needs a decision to leave DECISION; REFUSE closes, AJOURNE stays', () => {
    const at = { ...base, step: FinancingStep.DECISION, to: FinancingStep.DECAISSEMENT, grantedFcfa: 1000 };
    expect(stepPassVerdict(at)).toMatchObject({ ok: false, status: 400 });
    expect(stepPassVerdict({ ...at, decision: FinancingDecision.ACCORDE })).toMatchObject({
      ok: true,
      to: FinancingStep.DECAISSEMENT,
    });
    // A refusal is not held up by the documents of the step.
    expect(
      stepPassVerdict({ ...at, decision: FinancingDecision.REFUSE, blockers: ['Contrat'] }),
    ).toMatchObject({ ok: true, to: FinancingStep.CLOTURE });
    expect(stepPassVerdict({ ...at, decision: FinancingDecision.AJOURNE })).toMatchObject({
      ok: true,
      to: FinancingStep.DECISION,
    });
  });
  it('needs the amount granted for DECAISSEMENT', () => {
    const at = { ...base, step: FinancingStep.DECISION, to: FinancingStep.DECAISSEMENT, decision: FinancingDecision.ACCORDE };
    expect(stepPassVerdict(at)).toMatchObject({ ok: false, status: 400 });
  });
  it('closes only with nothing outstanding', () => {
    const at = { ...base, step: FinancingStep.SUIVI, to: FinancingStep.CLOTURE };
    expect(stepPassVerdict({ ...at, outstandingFcfa: 10 })).toMatchObject({ ok: false, status: 409 });
    expect(stepPassVerdict(at).ok).toBe(true);
    expect(stepPassVerdict({ ...at, step: FinancingStep.CLOTURE }).ok).toBe(false);
  });
});
