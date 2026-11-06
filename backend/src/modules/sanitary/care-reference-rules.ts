import { UserRole } from '../../common/enums/role.enum.js';
import { ProphylaxisStatus } from '../../common/enums/prophylaxis-status.enum.js';

/**
 * POUFA lot A2 sante (CDC §5.2 n° 22-23), pure rules of the care calendar.
 *
 * - The vets' reference calendar (shared protocol `isDefault` for the band's
 *   species and type) is applied when a band opens. A step whose date
 *   (J0 + day of the step) is before the opening day is **not planned**: the
 *   birds were that age before entering the programme (J+x band) or the band
 *   was entered late (back-dated). The opening forms offer those steps as
 *   « soins déjà réalisés », recorded as treatments of the step.
 * - A reference step (`isReference`) cannot be cancelled nor deleted by the
 *   farm, nor its content changed: only its date (postponement) and notes.
 *   Postponing keeps the first planned date (`originalDate`), and lateness is
 *   measured from it: a postponed reference step still counts as late.
 * - A completion records the number of animals (required for a new one).
 * - A manual care whose completion opens a treatment (withdrawal period) takes
 *   its product from PRODUIT_TRAITEMENT (`resolveTreatmentProduct`), its real
 *   end day and its reason, like the treatment register.
 */

export interface PlannableStep {
  readonly id: string;
  readonly dayFrom: number;
}

export interface StepPlan<S extends PlannableStep> {
  planned: { step: S; date: string }[];
  /** Steps left out: already on the band, or dated before `today`. */
  skipped: { step: S; date: string; reason: string }[];
}

export const STEP_ALREADY_ON_BAND = 'Étape déjà au calendrier de la bande';
export const STEP_AGE_PASSED =
  "Âge de l'étape déjà dépassé à l'ouverture : non planifiée (à renseigner comme soin déjà réalisé)";

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Dates of `steps` for a band whose birds were born on `ageZero` (J0), as of
 * `today` (`YYYY-MM-DD`, UTC). Steps already on the band are left out.
 */
export function planSteps<S extends PlannableStep>(
  steps: readonly S[],
  ageZero: string,
  today: string,
  existingStepIds: ReadonlySet<string>,
): StepPlan<S> {
  const plan: StepPlan<S> = { planned: [], skipped: [] };
  for (const step of steps) {
    const date = addDays(ageZero, step.dayFrom);
    if (existingStepIds.has(step.id)) {
      plan.skipped.push({ step, date, reason: STEP_ALREADY_ON_BAND });
    } else if (date < today) {
      plan.skipped.push({ step, date, reason: STEP_AGE_PASSED });
    } else {
      plan.planned.push({ step, date });
    }
  }
  return plan;
}

export interface CareDates {
  readonly isReference: boolean;
  readonly scheduledDate: string;
  readonly originalDate: string | null;
}

/**
 * Day lateness is measured from: for a reference step, the earlier of its
 * first planned date and its current one (a postponement does not move it,
 * bringing it forward does); for any other care, its planned date.
 */
export function lateFrom(care: CareDates): string {
  const planned = care.scheduledDate.slice(0, 10);
  if (!care.isReference || !care.originalDate) return planned;
  const original = care.originalDate.slice(0, 10);
  return original < planned ? original : planned;
}

/** A planned care is late once `lateFrom` is before `limit` (today − tolerance). */
export function isCareLate(
  care: CareDates & { readonly status: ProphylaxisStatus },
  limit: string,
): boolean {
  if (
    care.status !== ProphylaxisStatus.PLANIFIE &&
    care.status !== ProphylaxisStatus.EN_RETARD
  ) {
    return false;
  }
  return lateFrom(care) < limit;
}

/**
 * `originalDate` to keep when a care moves from `current` to `next`: the
 * first planned date survives every postponement.
 */
export function originalDateAfterMove(
  care: Pick<CareDates, 'scheduledDate' | 'originalDate'>,
  next: string,
): string | null {
  if (care.originalDate) return care.originalDate;
  return next.slice(0, 10) === care.scheduledDate.slice(0, 10)
    ? null
    : care.scheduledDate.slice(0, 10);
}

export const REFERENCE_STEP_CANCEL_MESSAGE =
  "Étape du calendrier de référence des services vétérinaires : la ferme ne peut ni l'annuler ni la supprimer. Reportez-la si besoin ; elle reste comptée en retard à partir de sa date de référence.";

export const REFERENCE_STEP_CONTENT_MESSAGE =
  "Étape du calendrier de référence des services vétérinaires : seuls la date (report) et les notes peuvent être modifiées par la ferme.";

/**
 * Null when `role` may cancel or delete `care`. A reference step stays on the
 * band unless an institutional account removes it; that account reached the
 * route only through its matrix (SANITAIRE, `ProgramAccessGuard`), so this is
 * the vets' right, never a profile code.
 */
export function referenceStepRemovalRefusal(
  care: { readonly isReference: boolean },
  role: string,
): string | null {
  if (!care.isReference) return null;
  return role === UserRole.INSTITUTION ? null : REFERENCE_STEP_CANCEL_MESSAGE;
}

export interface CareContent {
  readonly careType: string;
  readonly name: string;
  readonly dosage: string | null;
  readonly route: string | null;
  readonly withdrawalDays: number;
}

/**
 * Null when the edit keeps the content of a reference step (fields sent with
 * their current value are fine: clients post their whole form).
 */
export function referenceContentRefusal(
  care: CareContent & { readonly isReference: boolean },
  edit: Partial<{
    careType: string;
    name: string;
    dosage: string | null;
    route: string | null;
    withdrawalDays: number;
  }>,
  role: string,
): string | null {
  if (!care.isReference || role === UserRole.INSTITUTION) return null;
  const same = (a: string | null | undefined, b: string | null) =>
    (a?.trim() || null) === (b?.trim() || null);
  const changed =
    (edit.careType != null && edit.careType !== care.careType) ||
    (edit.name != null &&
      edit.name.trim().length > 0 &&
      edit.name.trim() !== care.name.trim()) ||
    ('dosage' in edit && !same(edit.dosage, care.dosage)) ||
    ('route' in edit && !same(edit.route, care.route)) ||
    (edit.withdrawalDays != null &&
      edit.withdrawalDays !== care.withdrawalDays);
  return changed ? REFERENCE_STEP_CONTENT_MESSAGE : null;
}

export const ANIMAL_COUNT_REQUIRED_MESSAGE =
  "Indiquez le nombre d'animaux vaccinés ou traités.";
export const TREATMENT_REASON_REQUIRED_MESSAGE =
  'Indiquez le motif du traitement.';
export const TREATMENT_ANIMALS_REQUIRED_MESSAGE =
  "Indiquez le nombre d'animaux traités.";
export const TREATMENT_END_REQUIRED_MESSAGE =
  'Indiquez la date de fin du traitement.';

/** Reason of a treatment opened by a step of a vets' programme. */
export const PROGRAMME_STEP_TREATMENT_REASON =
  'Étape du calendrier sanitaire (prévention)';

/**
 * Does completing this care open a treatment record? Any care with a
 * withdrawal period does: the period protects the consumer, whatever the type.
 */
export function completionOpensTreatment(care: {
  readonly withdrawalDays: number;
}): boolean {
  return care.withdrawalDays > 0;
}

/**
 * Treatment fields a completion must carry, or the refusal. A manual care
 * (no programme step) needs the real reason and end day; a programme step
 * defaults its reason to the calendar.
 */
export function completionTreatmentError(
  care: { readonly protocolStepId: string | null },
  input: { reason?: string | null; endDate?: string | null },
): string | null {
  if (care.protocolStepId) return null;
  if (!input.reason?.trim()) return TREATMENT_REASON_REQUIRED_MESSAGE;
  if (!input.endDate) return TREATMENT_END_REQUIRED_MESSAGE;
  return null;
}
