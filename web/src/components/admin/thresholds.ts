import type { ReferenceConstant } from '../../api/types';
import type { AdminRights } from './adminRights';
import { mayPropose } from './adminRights';

/**
 * POUFA lot A droits (F8): the Fermia conduct thresholds (`/reference-constants`:
 * vide sanitaire, prophylaxie, marges, autonomie d'aliment…) exposed in the
 * programme settings, each owned by a profile: the veterinary services for
 * the sanitary ones, the DGE for the rest. Pure; the server checks every write
 * (`PATCH /reference-constants/:key`: platform admin, or the owner profile
 * with PARAMETRES:MODIFIER).
 */

export type ThresholdGroup = 'SANITAIRE' | 'CONDUITE';

export const THRESHOLD_GROUP_LABELS: Readonly<Record<ThresholdGroup, string>> = {
  SANITAIRE: 'Seuils sanitaires (services vétérinaires)',
  CONDUITE: 'Seuils de conduite (DGE)',
};

/** The group the server sent, else the owner it implies (a VETERINAIRE threshold is sanitary). */
export function groupOf(row: Pick<ReferenceConstant, 'group' | 'ownerProfile'>): ThresholdGroup {
  if (row.group) return row.group;
  return row.ownerProfile === 'VETERINAIRE' ? 'SANITAIRE' : 'CONDUITE';
}

/** Owner profile code, DGE when the server didn't say. */
export function ownerOf(row: Pick<ReferenceConstant, 'ownerProfile'>): 'DGE' | 'VETERINAIRE' {
  return row.ownerProfile ?? 'DGE';
}

/** Whether the caller may change this threshold: editable, and the owner profile (the platform admin: all but the vets' ones). */
export function mayEditThreshold(rights: AdminRights['parameters'], row: Pick<ReferenceConstant, 'isEditable' | 'ownerProfile'>): boolean {
  return row.isEditable && mayPropose(rights, ownerOf(row));
}

/** The thresholds by group (sanitary first), keys sorted, search on key and description. */
export function groupThresholds(rows: readonly ReferenceConstant[], query = ''): Array<{ group: ThresholdGroup; rows: ReferenceConstant[] }> {
  const q = query.trim().toLowerCase();
  const kept = rows.filter((r) => !q || r.key.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q));
  return (['SANITAIRE', 'CONDUITE'] as const)
    .map((group) => ({ group, rows: kept.filter((r) => groupOf(r) === group).sort((a, b) => a.key.localeCompare(b.key)) }))
    .filter((g) => g.rows.length > 0);
}

/** French error of a typed value, or null (a finite number, never negative: thresholds are counts, days or rates). */
export function thresholdValueError(raw: string): string | null {
  const text = raw.trim().replace(',', '.');
  if (!text) return 'Indiquez une valeur.';
  const n = Number(text);
  if (!Number.isFinite(n)) return 'La valeur doit être un nombre.';
  if (n < 0) return 'La valeur ne peut pas être négative.';
  return null;
}

export function parseThreshold(raw: string): number {
  return Number(raw.trim().replace(',', '.'));
}
