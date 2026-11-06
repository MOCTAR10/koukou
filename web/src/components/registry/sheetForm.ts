import type {
  CreateRegistryFarmBody,
  GpsFixBody,
  InfrastructureLineBody,
  RegistrySheet,
  SetGpsBody,
  UpdateRegistryFarmBody,
} from '../../api/types-programme';

/** The registry sheet form, as typed (every field a string). */
export interface SheetDraft {
  name: string;
  provinceCode: string;
  localiteId: string;
  exploitantName: string;
  exploitantPhone: string;
  amiRef: string;
  cohort: string;
  capacityPlaces: string;
}

/** Creation only: first status, first GPS fix, infrastructures. */
export interface CreateDraft extends SheetDraft {
  statusCode: string;
  latitude: string;
  longitude: string;
  accuracyM: string;
  infrastructures: InfraDraft[];
}

export interface InfraDraft {
  code: string;
  count: string;
  surfaceM2: string;
}

export const EMPTY_SHEET_DRAFT: SheetDraft = {
  name: '',
  provinceCode: '',
  localiteId: '',
  exploitantName: '',
  exploitantPhone: '',
  amiRef: '',
  cohort: '',
  capacityPlaces: '',
};

export const EMPTY_CREATE_DRAFT: CreateDraft = {
  ...EMPTY_SHEET_DRAFT,
  statusCode: '',
  latitude: '',
  longitude: '',
  accuracyM: '',
  infrastructures: [],
};

/** The sheet's current values in the form. */
export function draftOfSheet(sheet: RegistrySheet): SheetDraft {
  return {
    name: sheet.name,
    provinceCode: sheet.province?.code ?? '',
    localiteId: sheet.localite?.id ?? '',
    exploitantName: sheet.exploitant.name ?? '',
    exploitantPhone: sheet.exploitant.phone ?? '',
    amiRef: sheet.amiRef ?? '',
    cohort: sheet.cohort?.code ?? '',
    capacityPlaces: sheet.capacityPlaces != null ? String(sheet.capacityPlaces) : '',
  };
}

/** Same separators as the server (`common/utils/phone.ts`): no country code is guessed. */
export function normalizeRegistryPhone(value: string): string {
  return value.trim().replace(/[\s.\-()]/g, '');
}

const PHONE_PATTERN = /^\+?\d{6,15}$/;

/** `"0,39"` or `"0.39"`; empty → null; garbage → NaN. */
export function parseDecimal(value: string): number | null {
  const v = value.trim().replace(',', '.');
  if (!v) return null;
  return /^[-+]?\d+(\.\d+)?$/.test(v) ? Number(v) : Number.NaN;
}

function parseCount(value: string): number | null {
  const v = value.trim().replace(/\s/g, '');
  if (!v) return null;
  return /^\d+$/.test(v) ? Number(v) : Number.NaN;
}

type Checked<T> = { body: T } | { error: string };

interface SheetValues {
  name: string;
  provinceCode: string;
  localiteId: string | null;
  exploitantName: string | null;
  exploitantPhone: string | null;
  amiRef: string | null;
  cohort: string | null;
  capacityPlaces: number | null;
}

function checkSheet(d: SheetDraft): { values: SheetValues } | { error: string } {
  const name = d.name.trim();
  if (!name) return { error: 'Le nom de la ferme est obligatoire.' };
  if (name.length > 200) return { error: 'Le nom ne doit pas dépasser 200 caractères.' };
  if (!d.provinceCode) return { error: 'La province est obligatoire.' };
  const exploitantName = d.exploitantName.trim() || null;
  if (exploitantName && exploitantName.length > 160) {
    return { error: 'Le nom de l’exploitant ne doit pas dépasser 160 caractères.' };
  }
  const phone = normalizeRegistryPhone(d.exploitantPhone) || null;
  if (phone && !PHONE_PATTERN.test(phone)) {
    return { error: 'Téléphone invalide : 6 à 15 chiffres, éventuellement précédés de +.' };
  }
  const amiRef = d.amiRef.trim() || null;
  if (amiRef && amiRef.length > 64) return { error: 'La référence AMI ne doit pas dépasser 64 caractères.' };
  const capacity = parseCount(d.capacityPlaces);
  if (Number.isNaN(capacity)) return { error: 'La capacité doit être un nombre entier de places.' };
  return {
    values: {
      name,
      provinceCode: d.provinceCode,
      localiteId: d.localiteId || null,
      exploitantName,
      exploitantPhone: phone,
      amiRef,
      cohort: d.cohort || null,
      capacityPlaces: capacity,
    },
  };
}

/** A GPS fix typed by hand; both coordinates or none. */
export function checkGpsFix(latitude: string, longitude: string, accuracyM: string): { fix: GpsFixBody | null } | { error: string } {
  const lat = parseDecimal(latitude);
  const lng = parseDecimal(longitude);
  if (lat === null && lng === null) return { fix: null };
  if (lat === null || lng === null) return { error: 'Indiquez la latitude et la longitude, ou aucune des deux.' };
  if (Number.isNaN(lat) || lat < -90 || lat > 90) return { error: 'Latitude invalide (entre -90 et 90, en degrés décimaux).' };
  if (Number.isNaN(lng) || lng < -180 || lng > 180) return { error: 'Longitude invalide (entre -180 et 180, en degrés décimaux).' };
  const accuracy = parseDecimal(accuracyM);
  if (accuracy !== null && (Number.isNaN(accuracy) || accuracy < 0)) return { error: 'La précision doit être un nombre positif (mètres).' };
  return { fix: { latitude: lat, longitude: lng, ...(accuracy !== null ? { accuracyM: accuracy } : {}) } };
}

/** Infrastructure lines: one per code, a whole count, an optional surface. Empty lines are dropped. */
export function checkInfrastructures(lines: readonly InfraDraft[]): { items: InfrastructureLineBody[] } | { error: string } {
  const items: InfrastructureLineBody[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (!line.code) {
      if (line.count.trim() || line.surfaceM2.trim()) return { error: 'Choisissez le type de chaque infrastructure.' };
      continue;
    }
    if (seen.has(line.code)) return { error: 'Chaque type d’infrastructure ne figure qu’une fois.' };
    seen.add(line.code);
    const count = parseCount(line.count);
    if (count === null || Number.isNaN(count)) return { error: 'Le nombre de chaque infrastructure doit être un entier.' };
    const surface = parseDecimal(line.surfaceM2);
    if (surface !== null && (Number.isNaN(surface) || surface < 0)) return { error: 'La surface doit être un nombre positif (m²).' };
    items.push({ code: line.code, count, ...(surface !== null ? { surfaceM2: surface } : {}) });
  }
  return { items };
}

/** `POST /programme/farms` body (empty optional fields left out). */
export function buildCreateBody(d: CreateDraft, confirmDuplicate = false): Checked<CreateRegistryFarmBody> {
  const sheet = checkSheet(d);
  if ('error' in sheet) return sheet;
  const gps = checkGpsFix(d.latitude, d.longitude, d.accuracyM);
  if ('error' in gps) return gps;
  const infra = checkInfrastructures(d.infrastructures);
  if ('error' in infra) return infra;
  const v = sheet.values;
  const body: CreateRegistryFarmBody = { name: v.name, provinceCode: v.provinceCode };
  if (v.localiteId) body.localiteId = v.localiteId;
  if (v.exploitantName) body.exploitantName = v.exploitantName;
  if (v.exploitantPhone) body.exploitantPhone = v.exploitantPhone;
  if (v.amiRef) body.amiRef = v.amiRef;
  if (v.cohort) body.cohort = v.cohort;
  if (v.capacityPlaces !== null) body.capacityPlaces = v.capacityPlaces;
  if (d.statusCode) body.statusCode = d.statusCode;
  // A point typed in the form: MANUEL (the server's default for a creation is APPAREIL).
  if (gps.fix) body.gps = { ...gps.fix, source: 'MANUEL' };
  if (infra.items.length) body.infrastructures = infra.items;
  if (confirmDuplicate) body.confirmDuplicate = true;
  return { body };
}

/**
 * `PATCH /programme/farms/:id` body: only the fields that changed (a field
 * cleared is sent as null). `{ unchanged: true }` when nothing changed.
 */
export function buildUpdateBody(
  d: SheetDraft,
  sheet: RegistrySheet,
  confirmDuplicate = false,
): Checked<UpdateRegistryFarmBody> | { unchanged: true } {
  const checked = checkSheet(d);
  if ('error' in checked) return checked;
  const v = checked.values;
  const body: UpdateRegistryFarmBody = {};
  if (v.name !== sheet.name) body.name = v.name;
  const provinceChanged = v.provinceCode !== (sheet.province?.code ?? '');
  if (provinceChanged) body.provinceCode = v.provinceCode;
  // A new province drops the localité on the server unless one is sent.
  if (v.localiteId !== (sheet.localite?.id ?? null) || (provinceChanged && v.localiteId)) body.localiteId = v.localiteId;
  if (v.exploitantName !== (sheet.exploitant.name ?? null)) body.exploitantName = v.exploitantName;
  if (v.exploitantPhone !== (normalizeRegistryPhone(sheet.exploitant.phone ?? '') || null)) body.exploitantPhone = v.exploitantPhone;
  if (v.amiRef !== (sheet.amiRef ?? null)) body.amiRef = v.amiRef;
  if (v.cohort !== (sheet.cohort?.code ?? null)) body.cohort = v.cohort;
  if (v.capacityPlaces !== (sheet.capacityPlaces ?? null)) body.capacityPlaces = v.capacityPlaces;
  if (Object.keys(body).length === 0) return { unchanged: true };
  if (confirmDuplicate) body.confirmDuplicate = true;
  return { body };
}

/** `PUT /programme/farms/:id/gps` body from the new-fix form. */
export function buildGpsBody(draft: {
  latitude: string;
  longitude: string;
  accuracyM: string;
  capturedAt: string;
  reason: string;
  today: string;
  /** `APPAREIL` when the fields hold the browser's fix as read (`geolocation.ts` `gpsSourceOf`). */
  source?: 'APPAREIL' | 'MANUEL';
}): Checked<SetGpsBody> {
  const gps = checkGpsFix(draft.latitude, draft.longitude, draft.accuracyM);
  if ('error' in gps) return gps;
  if (!gps.fix) return { error: 'Indiquez la latitude et la longitude du relevé.' };
  const capturedAt = draft.capturedAt.trim();
  if (capturedAt && capturedAt > draft.today) return { error: 'La date du relevé ne peut pas être future.' };
  const reason = draft.reason.trim();
  if (reason.length > 500) return { error: 'Le motif ne doit pas dépasser 500 caractères.' };
  return {
    body: {
      ...gps.fix,
      source: draft.source ?? 'MANUEL',
      ...(capturedAt && capturedAt !== draft.today ? { capturedAt } : {}),
      ...(reason ? { reason } : {}),
    },
  };
}
