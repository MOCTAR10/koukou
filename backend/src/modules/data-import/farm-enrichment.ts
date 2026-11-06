import { normalizePhone } from '../../common/utils/phone.js';
import { parseCount, parseDecimal } from '../programme/farms/import-mapping.js';
import {
  foldText,
  matchByCodeOrName,
  matchListItem,
  normalizeAmiRef,
} from '../programme/farms/registry-rules.js';

/**
 * Completion of a registry farm already present by an AMI sheet (pure): only
 * EMPTY registry fields are filled; a different value already on the sheet
 * is never overwritten (warning: the sheet is corrected through the
 * registry, with its own checks and history). Status changes are never
 * taken from a file (they have their own dated history).
 */

export interface FarmSheet {
  readonly id: string;
  readonly code: string | null;
  readonly localiteId: string | null;
  readonly exploitantName: string | null;
  readonly exploitantPhone: string | null;
  readonly amiRef: string | null;
  readonly cohort: string | null;
  readonly capacityPlaces: number | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly statusCode: string | null;
}

export interface NamedItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface ListItem {
  readonly code: string;
  readonly label: string;
}

export interface EnrichmentContext {
  /** Active localités of the farm's province. */
  readonly localites: readonly NamedItem[];
  readonly localiteNames: ReadonlyMap<string, string>;
  readonly cohorts: readonly ListItem[];
  readonly statuses: readonly ListItem[];
  /** AMI references held by another farm or planned on an earlier line. */
  readonly takenAmiRefs: ReadonlySet<string>;
}

export interface EnrichmentPatch {
  localiteId?: string;
  exploitantName?: string;
  exploitantPhone?: string;
  amiRef?: string;
  cohort?: string;
  capacityPlaces?: number;
}

export interface EnrichmentPlan {
  readonly patch: EnrichmentPatch;
  readonly gps: { latitude: number; longitude: number } | null;
  /** French labels of the fields completed. */
  readonly fields: string[];
  readonly warnings: string[];
}

/** Identity signals of the duplicate detector (re-checked by the caller). */
export const IDENTITY_FIELDS: readonly (keyof EnrichmentPatch)[] = [
  'localiteId',
  'exploitantName',
  'exploitantPhone',
];

const LABELS: Record<keyof EnrichmentPatch | 'gps', string> = {
  localiteId: 'localité',
  exploitantName: 'exploitant',
  exploitantPhone: 'téléphone',
  amiRef: 'référence AMI',
  cohort: 'cohorte',
  capacityPlaces: 'capacité',
  gps: 'position GPS',
};

/** ~10 m: two readings closer than this are the same point. */
const GPS_EPSILON = 0.0001;

export function fieldLabel(key: keyof EnrichmentPatch | 'gps'): string {
  return LABELS[key];
}

export function planEnrichment(
  farm: FarmSheet,
  values: Readonly<Record<string, string>>,
  ctx: EnrichmentContext,
): EnrichmentPlan {
  const patch: EnrichmentPatch = {};
  const warnings: string[] = [];
  const differs = (label: string, registry: string, file: string) =>
    warnings.push(
      `Valeur « ${label} » différente du registre (registre : ${registry}, fichier : ${file}) : non modifiée, corrigez la fiche si besoin.`,
    );

  if (values.amiRef) {
    const ami = normalizeAmiRef(values.amiRef);
    if (ami && !farm.amiRef) {
      if (ctx.takenAmiRefs.has(ami)) {
        warnings.push(
          `Référence AMI « ${ami} » déjà attribuée : non reprise pour cette ferme.`,
        );
      } else patch.amiRef = ami;
    } else if (ami && farm.amiRef !== ami) {
      differs(LABELS.amiRef, farm.amiRef as string, ami);
    }
  }
  if (values.localite) {
    const found = matchByCodeOrName(values.localite, ctx.localites);
    if (found && !farm.localiteId) patch.localiteId = found.id;
    else if (found && farm.localiteId !== found.id) {
      differs(
        LABELS.localiteId,
        ctx.localiteNames.get(farm.localiteId as string) ?? '?',
        found.name,
      );
    }
  }
  if (values.exploitantName) {
    const name = values.exploitantName.trim().slice(0, 160);
    if (!farm.exploitantName) patch.exploitantName = name;
    else if (foldText(farm.exploitantName) !== foldText(name)) {
      differs('exploitant', farm.exploitantName, name);
    }
  }
  if (values.exploitantPhone) {
    const phone = normalizePhone(values.exploitantPhone);
    if (!farm.exploitantPhone) patch.exploitantPhone = phone;
    else if (farm.exploitantPhone !== phone) {
      differs('téléphone', farm.exploitantPhone, phone);
    }
  }
  if (values.cohort) {
    const item = matchListItem(values.cohort, ctx.cohorts);
    if (item && !farm.cohort) patch.cohort = item.code;
    else if (item && farm.cohort !== item.code) {
      differs(LABELS.cohort, farm.cohort as string, item.code);
    }
  }
  if (values.capacityPlaces) {
    const n = parseCount(values.capacityPlaces);
    if (n !== undefined && !Number.isNaN(n)) {
      if (farm.capacityPlaces === null) patch.capacityPlaces = n;
      else if (farm.capacityPlaces !== n) {
        differs(LABELS.capacityPlaces, String(farm.capacityPlaces), String(n));
      }
    }
  }
  let gps: EnrichmentPlan['gps'] = null;
  const lat = parseDecimal(values.latitude);
  const lng = parseDecimal(values.longitude);
  if (
    lat !== undefined &&
    lng !== undefined &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng)
  ) {
    if (farm.latitude === null || farm.longitude === null) {
      gps = { latitude: lat, longitude: lng };
    } else if (
      Math.abs(farm.latitude - lat) > GPS_EPSILON ||
      Math.abs(farm.longitude - lng) > GPS_EPSILON
    ) {
      warnings.push(
        'Position GPS différente du registre : non modifiée (correction GPS depuis la fiche, avec historique).',
      );
    }
  }
  if (values.status) {
    const item = matchListItem(values.status, ctx.statuses);
    if (item && item.code !== farm.statusCode) {
      warnings.push(
        `Statut « ${item.label} » non repris : le statut change depuis la fiche (historique daté).`,
      );
    }
  }
  const fields = (Object.keys(patch) as (keyof EnrichmentPatch)[]).map(
    (k) => LABELS[k],
  );
  if (gps) fields.push(LABELS.gps);
  return { patch, gps, fields, warnings };
}
