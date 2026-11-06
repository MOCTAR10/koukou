import type { RefItem } from '../../api/types-programme';
import type { CalendarStep, CalendarStepBody, CareTypeCode } from '../../api/types-surveillance';

/**
 * Settings the veterinary services own (POUFA L5): the sanitary lists and
 * the reference vaccination calendars. Same rules as the server
 * (`ref-item.dto.ts`, `sanitary-lists.service.ts`, `vaccination-calendars.service.ts`).
 */

export const SANITARY_LISTS = ['SIGNE_CLINIQUE', 'PRODUIT_TRAITEMENT', 'STATUT_ALERTE'] as const;
export type SanitaryList = (typeof SANITARY_LISTS)[number];

export const SANITARY_LIST_LABELS: Readonly<Record<SanitaryList, string>> = {
  SIGNE_CLINIQUE: 'Signes cliniques',
  PRODUIT_TRAITEMENT: 'Produits de traitement',
  STATUT_ALERTE: 'Statuts des alertes',
};

/** Families of STATUT_ALERTE (`ref-list-families.ts`); the other two lists take none. */
export const STATUT_ALERTE_FAMILIES = ['NOUVELLE', 'EN_ANALYSE', 'CONFIRMEE', 'INFIRMEE', 'CLOSE'] as const;

export function needsFamily(list: SanitaryList): boolean {
  return list === 'STATUT_ALERTE';
}

/** A stable code from a label: « Diarrhée verte » → DIARRHEE_VERTE (≤ 40 chars). */
export function codeFromLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/, '');
}

export interface NewItemForm {
  code: string;
  label: string;
  family: string;
}

export function newItemProblem(list: SanitaryList, form: NewItemForm, existing: readonly Pick<RefItem, 'code'>[]): string | null {
  if (!form.label.trim()) return 'Le libellé est obligatoire.';
  if (form.label.trim().length > 200) return 'Le libellé ne doit pas dépasser 200 caractères.';
  if (!/^[A-Z0-9_]{1,40}$/.test(form.code)) return 'Le code doit contenir de 1 à 40 caractères : majuscules, chiffres ou _.';
  if (existing.some((i) => i.code === form.code)) return `Le code « ${form.code} » existe déjà dans cette liste.`;
  if (needsFamily(list) && !form.family) return 'Choisissez la famille du statut (elle ne changera plus).';
  return null;
}

export function newItemBody(list: SanitaryList, form: NewItemForm, sort: number): { code: string; label: string; family?: string; sort: number } {
  return {
    code: form.code,
    label: form.label.trim(),
    ...(needsFamily(list) ? { family: form.family } : {}),
    sort,
  };
}

/** Next display order: after the last item. */
export function nextSort(items: readonly Pick<RefItem, 'sort'>[]): number {
  return items.reduce((max, i) => Math.max(max, i.sort), 0) + 10;
}

/**
 * Warning before deactivating the last active status of its family (the
 * server refuses it with « Dernier statut actif… »), or null.
 */
export function lastActiveWarning(list: SanitaryList, item: Pick<RefItem, 'code' | 'family' | 'active'>, items: readonly Pick<RefItem, 'code' | 'family' | 'active'>[]): string | null {
  if (list !== 'STATUT_ALERTE' || !item.active) return null;
  const others = items.filter((i) => i.active && i.family === item.family && i.code !== item.code);
  return others.length === 0 ? `Dernier statut actif de la famille ${item.family ?? ''} : le circuit des alertes en a besoin.` : null;
}

// ---------------------------------------------------------------------------
// Calendar steps
// ---------------------------------------------------------------------------

export interface StepForm {
  stepOrder: string;
  dayFrom: string;
  dayTo: string;
  careType: CareTypeCode;
  name: string;
  dosage: string;
  route: string;
  withdrawalDays: string;
}

export function emptyStepForm(order: number): StepForm {
  return { stepOrder: String(order), dayFrom: '', dayTo: '', careType: 'VACCIN', name: '', dosage: '', route: '', withdrawalDays: '0' };
}

export function stepFormOf(step: CalendarStep): StepForm {
  return {
    stepOrder: String(step.stepOrder),
    dayFrom: String(step.dayFrom),
    dayTo: String(step.dayTo),
    careType: step.careType,
    name: step.name,
    dosage: step.dosage ?? '',
    route: step.route ?? '',
    withdrawalDays: String(step.withdrawalDays ?? 0),
  };
}

const intOf = (raw: string): number | null => (/^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null);

export function stepProblem(form: StepForm): string | null {
  if (!form.name.trim()) return 'Le nom du soin est obligatoire.';
  if (intOf(form.stepOrder) === null) return 'L’ordre est un entier positif.';
  const from = intOf(form.dayFrom);
  const to = intOf(form.dayTo);
  if (from === null || to === null) return 'Les jours de début et de fin sont des âges en jours (entiers positifs).';
  if (to < from) return 'Le jour de fin d’une étape ne peut pas précéder son jour de début.';
  if (intOf(form.withdrawalDays || '0') === null) return 'Le délai d’attente est un nombre entier de jours.';
  return null;
}

export function stepBody(form: StepForm): CalendarStepBody {
  return {
    stepOrder: intOf(form.stepOrder) ?? 0,
    dayFrom: intOf(form.dayFrom) ?? 0,
    dayTo: intOf(form.dayTo) ?? 0,
    careType: form.careType,
    name: form.name.trim(),
    ...(form.dosage.trim() ? { dosage: form.dosage.trim() } : {}),
    ...(form.route.trim() ? { route: form.route.trim() } : {}),
    withdrawalDays: intOf(form.withdrawalDays || '0') ?? 0,
  };
}

/** Steps in the order the bands get them. */
export function sortedSteps<S extends Pick<CalendarStep, 'stepOrder' | 'dayFrom'>>(steps: readonly S[] | undefined): S[] {
  return [...(steps ?? [])].sort((a, b) => a.dayFrom - b.dayFrom || a.stepOrder - b.stepOrder);
}

/** Shared calendars only (`farmId` null): a farm's own programmes are managed from the farm. */
export function sharedCalendars<P extends { farmId: string | null }>(protocols: readonly P[]): P[] {
  return protocols.filter((p) => p.farmId === null);
}
