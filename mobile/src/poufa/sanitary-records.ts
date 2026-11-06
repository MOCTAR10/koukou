// Treatment and vaccination register forms (CDC §5.2 n° 22-23), pure. Same
// rules as the server (`backend/src/modules/sanitary/treatment-rules.ts`) and
// web `components/flock/sanitaryRecords.ts`: keep them in step. The server stays the
// authority and its French message is shown on a refusal.

export interface ProductOption {
  code: string;
  label: string;
}

/** Shown while the vets have not filled PRODUIT_TRAITEMENT yet (initial setup, CDC §9). */
export const EMPTY_PRODUCT_LIST_NOTE =
  'Liste des produits non paramétrée par les services vétérinaires (paramétrage initial). En attendant, saisissez le nom du produit.';

/** The list could not be read (offline, never opened on this device). */
export const UNKNOWN_PRODUCT_LIST_NOTE =
  'Liste des produits indisponible hors connexion : saisissez le nom du produit. Le serveur le refusera si les services vétérinaires ont rempli la liste.';

export type Built<T> = { ok: true; body: T } | { ok: false; error: string };

export interface TreatmentForm {
  careType: string;
  /** Code picked in the list (list filled). */
  productCode: string;
  /** Free text (list empty or unknown). */
  productName: string;
  dosage: string;
  route: string;
  /** `YYYY-MM-DD`, first day. */
  administeredAt: string;
  /** `YYYY-MM-DD` or empty: last day. */
  endDate: string;
  reason: string;
  animalCount: string;
  withdrawalDays: string;
  notes: string;
}

export interface TreatmentBody {
  careType: string;
  productCode?: string;
  productName?: string;
  dosage?: string;
  route?: string;
  administeredAt: string;
  endDate?: string;
  reason: string;
  animalCount: number;
  withdrawalDays: number;
  notes?: string;
}

function positiveInt(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 ? n : null;
}

/**
 * `products`: active PRODUIT_TRAITEMENT items, or `null` when the list could
 * not be read (free text then, the server decides on its list).
 */
export function treatmentBody(form: TreatmentForm, products: readonly ProductOption[] | null): Built<TreatmentBody> {
  const fromList = products !== null && products.length > 0;
  const code = form.productCode.trim();
  const name = form.productName.trim();
  if (fromList && !products.some((p) => p.code === code)) {
    return { ok: false, error: 'Choisissez le produit dans la liste des services vétérinaires.' };
  }
  if (!fromList && !name) return { ok: false, error: 'Indiquez le nom du produit.' };
  if (!form.administeredAt) return { ok: false, error: 'Indiquez la date de début du traitement.' };
  const end = form.endDate.trim();
  if (end && end < form.administeredAt) {
    return { ok: false, error: 'La date de fin ne peut pas précéder la date de début.' };
  }
  const reason = form.reason.trim();
  if (!reason) return { ok: false, error: 'Indiquez le motif du traitement.' };
  const animalCount = positiveInt(form.animalCount);
  if (animalCount === null) return { ok: false, error: 'Indiquez le nombre d’animaux traités (au moins 1).' };
  const withdrawal = form.withdrawalDays.trim();
  if (withdrawal && !/^\d+$/.test(withdrawal)) {
    return { ok: false, error: 'Le délai d’attente est un nombre entier de jours.' };
  }
  const body: TreatmentBody = {
    careType: form.careType,
    administeredAt: form.administeredAt,
    reason,
    animalCount,
    withdrawalDays: withdrawal ? Number(withdrawal) : 0,
  };
  if (fromList) body.productCode = code;
  else body.productName = name;
  if (form.dosage.trim()) body.dosage = form.dosage.trim();
  if (form.route.trim()) body.route = form.route.trim();
  if (end) body.endDate = end;
  if (form.notes.trim()) body.notes = form.notes.trim();
  return { ok: true, body };
}

/** Last day the birds may not be sold, as the server computes it (from the end day). */
export function withdrawalEndPreview(administeredAt: string, endDate: string, withdrawalDays: string): string | null {
  const days = Number(withdrawalDays.trim() || '0');
  if (!Number.isInteger(days) || days <= 0 || !administeredAt) return null;
  const from = endDate.trim() && endDate >= administeredAt ? endDate : administeredAt;
  const d = new Date(`${from.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface CompletionForm {
  /** `YYYY-MM-DD`. */
  completedAt: string;
  animalCount: string;
  route: string;
  notes: string;
}

export interface CompletionBody {
  completedAt: string;
  animalCount: number;
  route?: string;
  notes?: string;
}

/** Completing a planned care (CDC n° 22: date, vaccine, route, number of animals). */
export function completionBody(form: CompletionForm, plannedRoute: string | null): Built<CompletionBody> {
  if (!form.completedAt) return { ok: false, error: 'Indiquez la date de réalisation.' };
  const animalCount = positiveInt(form.animalCount);
  if (animalCount === null) return { ok: false, error: 'Indiquez le nombre d’animaux vaccinés ou traités (au moins 1).' };
  const body: CompletionBody = { completedAt: form.completedAt, animalCount };
  const route = form.route.trim();
  if (route && route !== (plannedRoute ?? '').trim()) body.route = route;
  if (form.notes.trim()) body.notes = form.notes.trim();
  return { ok: true, body };
}

/** French label of the treatment period. */
export function treatmentPeriodLabel(start: string, end: string | null, fmt: (d: string) => string): string {
  if (!end || end.slice(0, 10) === start.slice(0, 10)) return fmt(start);
  return `du ${fmt(start)} au ${fmt(end)}`;
}

// POUFA lot A2 sante (CDC n° 22-23): the « Fait » of a care, wherever it is
// pressed (band sheet, advice list, sanitary page), and the reference calendar.
// Same rules as the server (`backend/src/modules/sanitary/care-reference-rules.ts`).

/** What a completion form needs to know about the care it closes. */
export interface CareRef {
  name: string;
  withdrawalDays: number;
  protocolStepId: string | null;
  productCode: string | null;
  isReference?: boolean;
  originalDate?: string | null;
}

/** A care with a withdrawal period opens a treatment record when done. */
export function careOpensTreatment(care: Pick<CareRef, 'withdrawalDays'>): boolean {
  return care.withdrawalDays > 0;
}

/**
 * A manual care (no programme step) that opens a treatment needs the
 * treatment register's data: product from the vets' list, end day, reason.
 */
export function careNeedsTreatmentDetails(care: Pick<CareRef, 'withdrawalDays' | 'protocolStepId'>): boolean {
  return careOpensTreatment(care) && !care.protocolStepId;
}

export interface CareTreatmentForm {
  /** Code picked in PRODUIT_TRAITEMENT (list filled). */
  productCode: string;
  /** `YYYY-MM-DD` or empty. */
  endDate: string;
  reason: string;
}

export interface CareTreatmentBody {
  productCode?: string;
  endDate?: string;
  reason?: string;
}

/**
 * Treatment fields of a completion (empty when the care opens none).
 * `products`: active PRODUIT_TRAITEMENT items, `null` when unknown (offline):
 * the server then checks the care's own name against its list.
 */
export function careTreatmentBody(
  care: CareRef,
  form: CareTreatmentForm,
  completedAt: string,
  products: readonly ProductOption[] | null,
): Built<CareTreatmentBody> {
  if (!careOpensTreatment(care)) return { ok: true, body: {} };
  const end = form.endDate.trim();
  if (end && completedAt && end < completedAt) {
    return { ok: false, error: 'La date de fin ne peut pas précéder la date de réalisation.' };
  }
  const reason = form.reason.trim();
  const body: CareTreatmentBody = {};
  if (end) body.endDate = end;
  if (reason) body.reason = reason;
  if (care.protocolStepId) return { ok: true, body };
  if (products !== null && products.length > 0) {
    const code = form.productCode.trim() || care.productCode || '';
    if (!products.some((p) => p.code === code)) {
      return { ok: false, error: 'Choisissez le produit dans la liste des services vétérinaires.' };
    }
    body.productCode = code;
  }
  if (!reason) return { ok: false, error: 'Indiquez le motif du traitement.' };
  if (!end) return { ok: false, error: 'Indiquez la date de fin du traitement.' };
  return { ok: true, body };
}

/** Badge of a step of the vets' reference calendar. */
export const REFERENCE_STEP_LABEL = 'Calendrier de référence';

/** Why the cancel and delete actions are missing on a reference step. */
export const REFERENCE_STEP_HINT =
  'Étape du calendrier de référence des services vétérinaires : la ferme peut la reporter, pas l’annuler ni la supprimer. Un report reste compté en retard à partir de la date de référence.';

/** « Reporté · référence le … » for a postponed care, else null. */
export function postponedLabel(
  care: Pick<CareRef, 'originalDate' | 'isReference'>,
  fmt: (d: string) => string,
): string | null {
  if (!care.originalDate) return null;
  return care.isReference ? `Reporté · date de référence ${fmt(care.originalDate)}` : `Reporté · prévu le ${fmt(care.originalDate)}`;
}

/** Only an institutional account (vets, through the matrix) withdraws a reference step. */
export function canRemoveCare(care: Pick<CareRef, 'isReference'>, isInstitution: boolean): boolean {
  return !care.isReference || isInstitution;
}
