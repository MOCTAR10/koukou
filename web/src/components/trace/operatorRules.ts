import type { OperatorView } from '../../api/types-trace';
import { isIsoDay } from '../supply/deliveryRules';

/**
 * Operators registry form (`POST` / `PATCH /trace/operators`), mirroring
 * `operator.dto.ts`. The name is unique once accents, case and punctuation are
 * ignored: the server answers 409 with the operator already holding it.
 */

const PHONE = /^\+?[0-9\s.()-]{6,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface OperatorDraft {
  typeCode: string;
  name: string;
  localiteId: string;
  address: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  conventionRef: string;
  conventionSignedAt: string;
}

export type OperatorPayload = Partial<Record<keyof OperatorDraft, string | null>> & { active?: boolean };

export function draftOf(op?: OperatorView | null): OperatorDraft {
  return {
    typeCode: op?.typeCode ?? '',
    name: op?.name ?? '',
    localiteId: op?.localite?.id ?? '',
    address: op?.address ?? '',
    contactName: op?.contactName ?? '',
    contactPhone: op?.contactPhone ?? '',
    contactEmail: op?.contactEmail ?? '',
    conventionRef: op?.conventionRef ?? '',
    conventionSignedAt: op?.conventionSignedAt?.slice(0, 10) ?? '',
  };
}

export function validateOperator(d: OperatorDraft): string[] {
  const errors: string[] = [];
  if (!d.typeCode) errors.push("Le type d'opérateur est obligatoire.");
  if (!d.name.trim()) errors.push("Le nom de l'opérateur est obligatoire.");
  else if (d.name.trim().length > 160) errors.push('Nom trop long (160 caractères au plus).');
  if (d.contactPhone.trim() && !PHONE.test(d.contactPhone.trim())) errors.push('Le numéro de téléphone n’est pas valide.');
  if (d.contactEmail.trim() && !EMAIL.test(d.contactEmail.trim())) errors.push('Adresse e-mail invalide.');
  if (d.conventionRef.trim().length > 80) errors.push('Référence de convention trop longue (80 caractères au plus).');
  if (d.conventionSignedAt && !isIsoDay(d.conventionSignedAt)) errors.push('Date de signature invalide.');
  return errors;
}

const OPTIONAL: Array<keyof OperatorDraft> = [
  'localiteId',
  'address',
  'contactName',
  'contactPhone',
  'contactEmail',
  'conventionRef',
  'conventionSignedAt',
];

/** Creation body: blank optional fields left out. */
export function createPayload(d: OperatorDraft): OperatorPayload {
  const body: OperatorPayload = { typeCode: d.typeCode, name: d.name.trim() };
  for (const k of OPTIONAL) {
    const v = d[k].trim();
    if (v) body[k] = v;
  }
  return body;
}

/** Edit body: only what changed; a cleared optional field is sent as null (the server clears it). */
export function patchPayload(before: OperatorDraft, after: OperatorDraft): OperatorPayload {
  const body: OperatorPayload = {};
  if (after.typeCode !== before.typeCode) body.typeCode = after.typeCode;
  if (after.name.trim() !== before.name.trim()) body.name = after.name.trim();
  for (const k of OPTIONAL) {
    const a = after[k].trim();
    if (a !== before[k].trim()) body[k] = a || null;
  }
  return body;
}

/** Operators matching a search (name or code), the active ones first. */
export function filterOperators(rows: readonly OperatorView[], q: string, type: string): OperatorView[] {
  const needle = q
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return rows
    .filter((o) => (!type || o.typeCode === type) && (!needle || norm(o.name).includes(needle) || norm(o.code).includes(needle)))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'fr'));
}

/** Active operators of the ABATTOIR family: the ones a slaughter order can be ceded to (F4). */
export function abattoirs(operators: readonly OperatorView[]): OperatorView[] {
  return operators.filter((o) => o.active && o.typeFamily === 'ABATTOIR');
}
