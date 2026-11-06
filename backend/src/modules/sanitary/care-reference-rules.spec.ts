import { ProphylaxisStatus } from '../../common/enums/prophylaxis-status.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  REFERENCE_STEP_CANCEL_MESSAGE,
  REFERENCE_STEP_CONTENT_MESSAGE,
  STEP_AGE_PASSED,
  STEP_ALREADY_ON_BAND,
  TREATMENT_END_REQUIRED_MESSAGE,
  TREATMENT_REASON_REQUIRED_MESSAGE,
  completionOpensTreatment,
  completionTreatmentError,
  isCareLate,
  lateFrom,
  originalDateAfterMove,
  planSteps,
  referenceContentRefusal,
  referenceStepRemovalRefusal,
} from './care-reference-rules.js';

const STEPS = [
  { id: 's0', dayFrom: 0 },
  { id: 's7', dayFrom: 7 },
  { id: 's14', dayFrom: 14 },
  { id: 's21', dayFrom: 21 },
];

describe('reference calendar at opening (planSteps)', () => {
  it('plans every step of a band opened at J0', () => {
    const plan = planSteps(STEPS, '2026-11-06', '2026-11-06', new Set());
    expect(plan.planned.map((p) => [p.step.id, p.date])).toEqual([
      ['s0', '2026-11-06'],
      ['s7', '2026-11-13'],
      ['s14', '2026-11-20'],
      ['s21', '2026-11-27'],
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it('J+10 band: steps whose age is already past are skipped with a reason', () => {
    // Birds aged 10 days today: J0 was ten days ago.
    const plan = planSteps(STEPS, '2026-10-27', '2026-11-06', new Set());
    expect(plan.planned.map((p) => p.step.id)).toEqual(['s14', 's21']);
    expect(plan.skipped.map((s) => [s.step.id, s.date, s.reason])).toEqual([
      ['s0', '2026-10-27', STEP_AGE_PASSED],
      ['s7', '2026-11-03', STEP_AGE_PASSED],
    ]);
  });

  it('a step dated today is planned, not skipped', () => {
    const plan = planSteps(STEPS, '2026-10-30', '2026-11-06', new Set());
    expect(plan.planned[0]).toEqual({ step: STEPS[1], date: '2026-11-06' });
  });

  it('leaves out the steps already on the band', () => {
    const plan = planSteps(STEPS, '2026-11-06', '2026-11-06', new Set(['s7']));
    expect(plan.planned.map((p) => p.step.id)).toEqual(['s0', 's14', 's21']);
    expect(plan.skipped[0].reason).toBe(STEP_ALREADY_ON_BAND);
  });
});

describe('lateness against the reference date', () => {
  const ref = {
    isReference: true,
    scheduledDate: '2026-11-20',
    originalDate: '2026-11-10',
    status: ProphylaxisStatus.PLANIFIE,
  };

  it('a postponed reference step is late from its first planned date', () => {
    expect(lateFrom(ref)).toBe('2026-11-10');
    expect(isCareLate(ref, '2026-11-12')).toBe(true);
    expect(isCareLate(ref, '2026-11-10')).toBe(false);
  });

  it('a reference step brought forward is late from its new, earlier date', () => {
    const earlier = { ...ref, scheduledDate: '2026-11-05' };
    expect(lateFrom(earlier)).toBe('2026-11-05');
  });

  it('a postponed farm care is late from its new date', () => {
    const own = { ...ref, isReference: false };
    expect(lateFrom(own)).toBe('2026-11-20');
    expect(isCareLate(own, '2026-11-12')).toBe(false);
  });

  it('a step never postponed uses its planned date; done or cancelled is never late', () => {
    expect(lateFrom({ ...ref, originalDate: null })).toBe('2026-11-20');
    expect(isCareLate({ ...ref, status: ProphylaxisStatus.FAIT }, '2026-12-01')).toBe(false);
    expect(isCareLate({ ...ref, status: ProphylaxisStatus.ANNULE }, '2026-12-01')).toBe(false);
  });

  it('the first planned date survives every postponement', () => {
    expect(originalDateAfterMove({ scheduledDate: '2026-11-10', originalDate: null }, '2026-11-15')).toBe('2026-11-10');
    expect(originalDateAfterMove({ scheduledDate: '2026-11-15', originalDate: '2026-11-10' }, '2026-11-20')).toBe('2026-11-10');
    // Same date again: not a postponement.
    expect(originalDateAfterMove({ scheduledDate: '2026-11-10', originalDate: null }, '2026-11-10')).toBeNull();
  });
});

describe('reference steps stay on the band', () => {
  it('the farm cannot cancel nor delete a reference step', () => {
    expect(referenceStepRemovalRefusal({ isReference: true }, UserRole.PROPRIETAIRE)).toBe(REFERENCE_STEP_CANCEL_MESSAGE);
    expect(referenceStepRemovalRefusal({ isReference: true }, UserRole.ELEVEUR)).toBe(REFERENCE_STEP_CANCEL_MESSAGE);
    expect(referenceStepRemovalRefusal({ isReference: true }, UserRole.PLATFORM_ADMIN)).toBe(REFERENCE_STEP_CANCEL_MESSAGE);
  });

  it('an institutional account (matrix SANITAIRE) may, and any farm care stays free', () => {
    expect(referenceStepRemovalRefusal({ isReference: true }, UserRole.INSTITUTION)).toBeNull();
    expect(referenceStepRemovalRefusal({ isReference: false }, UserRole.PROPRIETAIRE)).toBeNull();
  });

  const step = {
    isReference: true,
    careType: 'VACCIN',
    name: 'Vaccin Gumboro',
    dosage: null,
    route: 'Eau de boisson',
    withdrawalDays: 0,
  };

  it('only the date and notes of a reference step change', () => {
    expect(referenceContentRefusal(step, { name: 'Autre vaccin' }, UserRole.PROPRIETAIRE)).toBe(REFERENCE_STEP_CONTENT_MESSAGE);
    expect(referenceContentRefusal(step, { careType: 'MEDICAMENT' }, UserRole.PROPRIETAIRE)).toBe(REFERENCE_STEP_CONTENT_MESSAGE);
    expect(referenceContentRefusal(step, { withdrawalDays: 3 }, UserRole.PROPRIETAIRE)).toBe(REFERENCE_STEP_CONTENT_MESSAGE);
    expect(referenceContentRefusal(step, { route: 'Spray' }, UserRole.PROPRIETAIRE)).toBe(REFERENCE_STEP_CONTENT_MESSAGE);
  });

  it('a whole form sent with the same values passes', () => {
    expect(
      referenceContentRefusal(
        step,
        { careType: 'VACCIN', name: ' Vaccin Gumboro ', route: 'Eau de boisson', dosage: '', withdrawalDays: 0 },
        UserRole.PROPRIETAIRE,
      ),
    ).toBeNull();
    expect(referenceContentRefusal({ ...step, isReference: false }, { name: 'Autre' }, UserRole.PROPRIETAIRE)).toBeNull();
  });
});

describe('treatment opened by a completion', () => {
  it('only a care with a withdrawal period opens one', () => {
    expect(completionOpensTreatment({ withdrawalDays: 5 })).toBe(true);
    expect(completionOpensTreatment({ withdrawalDays: 0 })).toBe(false);
  });

  it('a manual care needs its reason and end day', () => {
    const manual = { protocolStepId: null };
    expect(completionTreatmentError(manual, {})).toBe(TREATMENT_REASON_REQUIRED_MESSAGE);
    expect(completionTreatmentError(manual, { reason: '  ' })).toBe(TREATMENT_REASON_REQUIRED_MESSAGE);
    expect(completionTreatmentError(manual, { reason: 'Coryza' })).toBe(TREATMENT_END_REQUIRED_MESSAGE);
    expect(completionTreatmentError(manual, { reason: 'Coryza', endDate: '2026-11-08' })).toBeNull();
  });

  it('a programme step defaults its reason to the calendar', () => {
    expect(completionTreatmentError({ protocolStepId: 'step-1' }, {})).toBeNull();
  });
});
