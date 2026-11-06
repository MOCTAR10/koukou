import { BatchType } from '../../common/enums/batch-type.enum.js';
import { ImportRowOutcome } from '../../common/enums/import-job.enum.js';
import {
  compactKey,
  normalizeAmiRef,
  normalizeFarmName,
} from '../programme/farms/registry-rules.js';

/**
 * Controls of the historical band recovery (pure, unit-tested): one line per
 * daily entry, the band's own columns repeated or given once. Lines of the
 * same band (same farm + band reference) are integrated together, and a
 * band is all or nothing: one line in error blocks its whole band, so a band
 * is never recovered with days missing.
 */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar day `YYYY-MM-DD` if `y-m-d` exists, else null. */
function dayOf(y: number, m: number, d: number): string | null {
  const t = Date.UTC(y, m - 1, d);
  const date = new Date(t);
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Day from `2026-08-01`, `01/08/2026`, `01-08-2026`, `01.08.2026`,
 * `01/08/26` (20xx) or an ISO date-time. `undefined` when blank, `null`
 * when not a real date (« 31/02/2026 »).
 */
export function parseDay(value: string | undefined): string | null | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const t = value.trim();
  const iso = DAY.exec(t.slice(0, 10));
  if (iso && (t.length === 10 || t[10] === 'T' || t[10] === ' ')) {
    return dayOf(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (fr) {
    const year = fr[3].length === 2 ? 2000 + Number(fr[3]) : Number(fr[3]);
    return dayOf(year, Number(fr[2]), Number(fr[1]));
  }
  return null;
}

/** Number from `1 250,5` or `1250.5`; undefined when blank, NaN when invalid. */
export function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const t = value.replace(/[\s  ]/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** Integer ≥ 0; undefined when blank, NaN when invalid. */
export function parseInteger(value: string | undefined): number | undefined {
  const n = parseNumber(value);
  if (n === undefined || Number.isNaN(n)) return n;
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

/** CHAIR or PONDEUSE from a tolerant label; null when unknown. */
export function parseBandType(value: string): BatchType | null {
  const key = compactKey(value);
  if (!key) return null;
  if (key.includes('chair') || key === 'broiler' || key === 'broilers') {
    return BatchType.CHAIR;
  }
  if (key.startsWith('pond') || key.startsWith('ponte') || key === 'layer') {
    return BatchType.PONDEUSE;
  }
  return null;
}

export function addDay(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** `01/08/2026` for French messages. */
export function frDay(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

// ---------------------------------------------------------------------------
// Context (pre-loaded by the service) and results
// ---------------------------------------------------------------------------

export interface FarmRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly provinceCode: string | null;
  readonly provinceName: string | null;
  readonly amiRef: string | null;
  readonly capacityPlaces: number | null;
}

export interface BreedRef {
  readonly id: string;
  readonly name: string;
  readonly refCode: string | null;
  readonly type: BatchType;
  /** null = shared reference breed. */
  readonly farmId: string | null;
}

export interface BuildingRef {
  readonly id: string;
  readonly name: string;
}

/** A band already recovered under the same source key. */
export interface LinkedBand {
  readonly batchId: string;
  readonly code: string | null;
  readonly closed: boolean;
  readonly integrationDate: string;
  readonly quantityAtStart: number;
  /** Days that already have a daily entry. */
  readonly entryDates: ReadonlySet<string>;
}

export interface ExistingBand {
  readonly id: string;
  readonly code: string | null;
  readonly integrationDate: string;
  readonly quantityAtStart: number;
}

export interface BandControlContext {
  /** UTC day of the run. */
  readonly today: string;
  readonly farms: readonly FarmRef[];
  readonly breeds: readonly BreedRef[];
  readonly buildingsByFarm: ReadonlyMap<string, readonly BuildingRef[]>;
  /** By source key (`bandSourceKey`). */
  readonly links: ReadonlyMap<string, LinkedBand>;
  /** Bands of each farm, for the duplicate rule. */
  readonly bandsByFarm: ReadonlyMap<string, readonly ExistingBand[]>;
  readonly confirmDuplicate: boolean;
}

export interface BandRowInput {
  readonly line: number;
  readonly values: Readonly<Record<string, string>>;
}

export interface RowControl {
  readonly line: number;
  errors: string[];
  warnings: string[];
  planned: ImportRowOutcome | null;
  groupKey: string | null;
  sourceKey: string | null;
  details: Record<string, unknown> | null;
}

export interface BandOpening {
  readonly integrationDate: string;
  readonly initialAgeDays: number;
  readonly quantityAtStart: number;
  readonly type: BatchType;
  readonly breedId: string | null;
  readonly buildingId: string | null;
  readonly initialWeightG: number | null;
  readonly closureDate: string | null;
}

export interface EntryPlan {
  readonly line: number;
  readonly entryDate: string;
  readonly deaths?: number;
  readonly feedKg?: number;
  readonly waterL?: number;
  readonly avgWeightKg?: number;
  readonly sampleSize?: number;
}

/** What the integration does for one band (lines in error excluded). */
export interface BandPlan {
  readonly groupKey: string;
  readonly sourceKey: string;
  readonly farm: FarmRef;
  readonly bandRef: string;
  readonly lines: readonly number[];
  readonly linked: LinkedBand | null;
  readonly opening: BandOpening;
  /** New daily entries, oldest first. */
  readonly entries: readonly EntryPlan[];
  /** Lines whose day is already recovered (linked band). */
  readonly alreadyPresentLines: readonly number[];
}

export interface BandControlResult {
  readonly rows: RowControl[];
  /** Bands without any line in error. */
  readonly plans: BandPlan[];
}

/** Idempotency key of a band: farm code + band reference (compacted). */
export function bandSourceKey(farmCode: string, bandRef: string): string {
  return `${farmCode}|${compactKey(bandRef).toUpperCase()}`;
}

const ENTRY_FIELDS = [
  'deaths',
  'feedKg',
  'waterL',
  'avgWeightG',
  'sampleSize',
] as const;

const BAND_LEVEL_FIELDS = [
  'integrationDate',
  'initialAgeDays',
  'quantityAtStart',
  'type',
  'breed',
  'building',
  'initialWeightG',
  'closureDate',
] as const;

type BandLevelField = (typeof BAND_LEVEL_FIELDS)[number];

const BAND_FIELD_LABELS: Record<BandLevelField, string> = {
  integrationDate: 'date de mise en place',
  initialAgeDays: 'âge initial',
  quantityAtStart: 'effectif initial',
  type: 'type',
  breed: 'souche',
  building: 'bâtiment',
  initialWeightG: 'poids initial',
  closureDate: 'date de clôture',
};

/** Comparable form of a band-level value (dates and numbers normalized). */
function comparable(field: BandLevelField, value: string): string {
  if (field === 'integrationDate' || field === 'closureDate') {
    return parseDay(value) ?? value.trim();
  }
  if (
    field === 'initialAgeDays' ||
    field === 'quantityAtStart' ||
    field === 'initialWeightG'
  ) {
    const n = parseNumber(value);
    return n === undefined || Number.isNaN(n) ? value.trim() : String(n);
  }
  return compactKey(value);
}

/** Farm of a line: by code, else AMI reference, else name + province. */
function resolveFarm(
  values: Readonly<Record<string, string>>,
  farms: readonly FarmRef[],
): FarmRef | string {
  const hits: FarmRef[] = [];
  if (values.farmCode) {
    const key = compactKey(values.farmCode);
    const f = farms.find((x) => compactKey(x.code) === key);
    if (!f) return `Ferme inconnue du registre : code « ${values.farmCode} ».`;
    hits.push(f);
  }
  if (values.amiRef) {
    const ami = normalizeAmiRef(values.amiRef);
    const f = farms.find((x) => x.amiRef !== null && x.amiRef === ami);
    if (!f) {
      if (hits.length === 0) {
        return `Ferme inconnue du registre : référence AMI « ${values.amiRef} ».`;
      }
    } else hits.push(f);
  }
  if (hits.length === 0 && values.farmName) {
    if (!values.province) {
      return `Ferme « ${values.farmName} » : la province est nécessaire pour la retrouver par son nom.`;
    }
    const province = compactKey(values.province);
    const name = normalizeFarmName(values.farmName).replace(/ /g, '');
    const found = farms.filter(
      (x) =>
        (compactKey(x.provinceCode ?? '') === province ||
          compactKey(x.provinceName ?? '') === province) &&
        normalizeFarmName(x.name).replace(/ /g, '') === name,
    );
    if (found.length === 0) {
      return `Ferme inconnue du registre : « ${values.farmName} » (${values.province}).`;
    }
    if (found.length > 1) {
      return `Plusieurs fermes « ${values.farmName} » dans cette province : indiquez le code POUFA.`;
    }
    hits.push(found[0]);
  }
  if (hits.length === 0) {
    return 'Ferme non indiquée : code POUFA, référence AMI ou nom et province.';
  }
  if (hits.some((h) => h.id !== hits[0].id)) {
    return `Le code POUFA et la référence AMI désignent deux fermes différentes (${hits.map((h) => h.code).join(', ')}).`;
  }
  return hits[0];
}

function matchBreed(
  value: string,
  breeds: readonly BreedRef[],
  farmId: string,
): BreedRef | null {
  const key = compactKey(value);
  const usable = breeds.filter((b) => b.farmId === null || b.farmId === farmId);
  const hits = usable.filter(
    (b) =>
      compactKey(b.name) === key ||
      (b.refCode !== null && compactKey(b.refCode) === key),
  );
  return hits.find((b) => b.farmId === farmId) ?? hits[0] ?? null;
}

interface Group {
  key: string;
  farm: FarmRef;
  bandRef: string;
  rows: { input: BandRowInput; control: RowControl }[];
}

/**
 * Controls every line and plans the bands. Excluded lines are not given.
 * Line errors and warnings are French.
 */
export function controlBandRows(
  inputs: readonly BandRowInput[],
  ctx: BandControlContext,
): BandControlResult {
  const rows: RowControl[] = [];
  const groups = new Map<string, Group>();
  for (const input of inputs) {
    const control: RowControl = {
      line: input.line,
      errors: [],
      warnings: [],
      planned: null,
      groupKey: null,
      sourceKey: null,
      details: null,
    };
    rows.push(control);
    const v = input.values;
    const bandRef = v.bandRef?.trim();
    if (!bandRef) control.errors.push('Référence de bande manquante.');
    else if (bandRef.length > 64) {
      control.errors.push(
        'Référence de bande trop longue (64 caractères au maximum).',
      );
    }
    const farm = resolveFarm(v, ctx.farms);
    if (typeof farm === 'string') control.errors.push(farm);
    if (typeof farm === 'string' || !bandRef || bandRef.length > 64) {
      control.planned = ImportRowOutcome.REJETEE;
      continue;
    }
    const key = `${farm.id}|${compactKey(bandRef).toUpperCase()}`;
    control.groupKey = key;
    control.sourceKey = bandSourceKey(farm.code, bandRef);
    let group = groups.get(key);
    if (!group) {
      group = { key, farm, bandRef, rows: [] };
      groups.set(key, group);
    }
    group.rows.push({ input, control });
  }

  const plans: BandPlan[] = [];
  for (const group of groups.values()) {
    const plan = controlGroup(group, ctx);
    if (plan) plans.push(plan);
  }
  return { rows, plans };
}

function controlGroup(group: Group, ctx: BandControlContext): BandPlan | null {
  const { farm } = group;
  const first = group.rows[0].control;
  const sourceKey = first.sourceKey as string;
  const linked = ctx.links.get(sourceKey) ?? null;

  // Band-level values: the first non-blank one, later ones must agree.
  const band: Partial<Record<BandLevelField, { value: string; line: number }>> =
    {};
  for (const { input, control } of group.rows) {
    for (const field of BAND_LEVEL_FIELDS) {
      const value = input.values[field];
      if (value === undefined) continue;
      const known = band[field];
      if (!known) band[field] = { value, line: input.line };
      else if (comparable(field, known.value) !== comparable(field, value)) {
        control.errors.push(
          `Incohérent avec la ligne ${known.line} : ${BAND_FIELD_LABELS[field]} « ${value} » au lieu de « ${known.value} ».`,
        );
      }
    }
  }
  const errorAt = (field: BandLevelField, message: string) => {
    const line = band[field]?.line ?? first.line;
    const row = group.rows.find((r) => r.input.line === line) ?? group.rows[0];
    row.control.errors.push(message);
  };

  // Opening.
  let integrationDate: string | null = null;
  if (!band.integrationDate) {
    errorAt('integrationDate', 'Date de mise en place manquante.');
  } else {
    const d = parseDay(band.integrationDate.value);
    if (!d) {
      errorAt(
        'integrationDate',
        `Date de mise en place impossible : « ${band.integrationDate.value} » (format JJ/MM/AAAA ou AAAA-MM-JJ).`,
      );
    } else if (d < '2000-01-01') {
      errorAt(
        'integrationDate',
        `Date de mise en place impossible : ${frDay(d)}.`,
      );
    } else if (d > ctx.today) {
      errorAt(
        'integrationDate',
        `Date de mise en place dans le futur : ${frDay(d)}.`,
      );
    } else integrationDate = d;
  }
  let quantityAtStart: number | null = null;
  if (!band.quantityAtStart) {
    errorAt('quantityAtStart', 'Effectif mis en place manquant.');
  } else {
    const n = parseInteger(band.quantityAtStart.value);
    if (n === undefined || Number.isNaN(n) || n < 1 || n > 1_000_000) {
      errorAt(
        'quantityAtStart',
        `Effectif mis en place invalide : « ${band.quantityAtStart.value} » (nombre entier de sujets attendu).`,
      );
    } else {
      quantityAtStart = n;
      if (farm.capacityPlaces !== null && n > farm.capacityPlaces) {
        const line = band.quantityAtStart.line;
        group.rows
          .find((r) => r.input.line === line)
          ?.control.warnings.push(
            `Effectif (${n}) supérieur à la capacité de la ferme ${farm.code} (${farm.capacityPlaces} places).`,
          );
      }
    }
  }
  let initialAgeDays = 0;
  if (band.initialAgeDays) {
    const n = parseInteger(band.initialAgeDays.value);
    if (n === undefined || Number.isNaN(n) || n > 200) {
      errorAt(
        'initialAgeDays',
        `Âge initial invalide : « ${band.initialAgeDays.value} » (jours, de 0 à 200).`,
      );
    } else initialAgeDays = n;
  }
  let type = BatchType.CHAIR;
  if (band.type) {
    const t = parseBandType(band.type.value);
    if (!t) {
      errorAt(
        'type',
        `Type de bande inconnu : « ${band.type.value} » (CHAIR ou PONDEUSE).`,
      );
    } else type = t;
  }
  let breedId: string | null = null;
  if (band.breed) {
    const b = matchBreed(band.breed.value, ctx.breeds, farm.id);
    if (!b) errorAt('breed', `Souche inconnue : « ${band.breed.value} ».`);
    else {
      breedId = b.id;
      if (b.type !== type) {
        errorAt(
          'breed',
          `La souche ${b.name} est une souche ${b.type} : incompatible avec une bande ${type}.`,
        );
      }
    }
  }
  let buildingId: string | null = null;
  if (band.building) {
    const key = compactKey(band.building.value);
    const hits = (ctx.buildingsByFarm.get(farm.id) ?? []).filter(
      (b) => compactKey(b.name) === key,
    );
    if (hits.length !== 1) {
      errorAt(
        'building',
        `Bâtiment inconnu dans la ferme ${farm.code} : « ${band.building.value} ».`,
      );
    } else buildingId = hits[0].id;
  }
  let initialWeightG: number | null = null;
  if (band.initialWeightG) {
    const n = parseNumber(band.initialWeightG.value);
    if (n === undefined || Number.isNaN(n) || n <= 0 || n > 6000) {
      errorAt(
        'initialWeightG',
        `Poids initial invalide : « ${band.initialWeightG.value} » (grammes).`,
      );
    } else initialWeightG = n;
  }
  let closureDate: string | null = null;
  if (band.closureDate) {
    const d = parseDay(band.closureDate.value);
    if (!d) {
      errorAt(
        'closureDate',
        `Date de clôture impossible : « ${band.closureDate.value} ».`,
      );
    } else if (d > ctx.today) {
      errorAt('closureDate', `Date de clôture dans le futur : ${frDay(d)}.`);
    } else if (integrationDate && d < integrationDate) {
      errorAt(
        'closureDate',
        `Date de clôture (${frDay(d)}) antérieure à la mise en place (${frDay(integrationDate)}).`,
      );
    } else closureDate = d;
  }

  // Already recovered, or a probable duplicate of a band entered by hand.
  if (linked) {
    if (
      (integrationDate && integrationDate !== linked.integrationDate) ||
      (quantityAtStart !== null && quantityAtStart !== linked.quantityAtStart)
    ) {
      first.warnings.push(
        `Bande déjà reprise (${linked.code ?? 'sans code'}) avec d'autres valeurs d'ouverture (${frDay(linked.integrationDate)}, ${linked.quantityAtStart} sujets) : l'ouverture n'est pas modifiée.`,
      );
    }
  } else if (integrationDate && quantityAtStart !== null) {
    const twins = (ctx.bandsByFarm.get(farm.id) ?? []).filter(
      (b) =>
        b.integrationDate.slice(0, 10) === integrationDate &&
        b.quantityAtStart === quantityAtStart,
    );
    if (twins.length > 0) {
      const list = twins.map((b) => b.code ?? b.id).join(', ');
      const message = `Bande probablement déjà enregistrée dans la ferme ${farm.code} : ${list} (même date de mise en place et même effectif).`;
      first.details = {
        ...first.details,
        duplicates: twins.map((b) => ({ batchId: b.id, code: b.code })),
      };
      if (ctx.confirmDuplicate) {
        first.warnings.push(`${message} Reprise confirmée (confirmDuplicate).`);
      } else {
        first.errors.push(
          `${message} Corrigez la ligne, excluez-la, ou confirmez les doublons dans les réglages de l'import.`,
        );
      }
    }
  }

  // Daily entries.
  const seen = new Map<string, number>();
  const entries: EntryPlan[] = [];
  const alreadyPresent: number[] = [];
  for (const { input, control } of group.rows) {
    const v = input.values;
    const hasEntryData = ENTRY_FIELDS.some((f) => v[f] !== undefined);
    if (v.entryDate === undefined) {
      if (hasEntryData) {
        control.errors.push(
          'Date de la saisie manquante (morts, aliment, eau ou pesée sans date).',
        );
      }
      continue;
    }
    const day = parseDay(v.entryDate);
    if (!day) {
      control.errors.push(
        `Date de saisie impossible : « ${v.entryDate} » (format JJ/MM/AAAA ou AAAA-MM-JJ).`,
      );
      continue;
    }
    const before = seen.get(day);
    if (before !== undefined) {
      control.errors.push(
        `Saisie du ${frDay(day)} en double (déjà ligne ${before}).`,
      );
      continue;
    }
    seen.set(day, input.line);
    const opening = linked?.integrationDate.slice(0, 10) ?? integrationDate;
    if (opening && day < opening) {
      control.errors.push(
        `Saisie du ${frDay(day)} antérieure à la mise en place (${frDay(opening)}).`,
      );
    }
    if (day > addDay(ctx.today, 1)) {
      control.errors.push(`Saisie du ${frDay(day)} dans le futur.`);
    }
    if (closureDate && day > closureDate) {
      control.errors.push(
        `Saisie du ${frDay(day)} postérieure à la clôture (${frDay(closureDate)}).`,
      );
    }
    const entry: {
      line: number;
      entryDate: string;
      deaths?: number;
      feedKg?: number;
      waterL?: number;
      avgWeightKg?: number;
      sampleSize?: number;
    } = { line: input.line, entryDate: day };
    const deaths = parseInteger(v.deaths);
    if (Number.isNaN(deaths)) {
      control.errors.push(
        `Morts invalides : « ${v.deaths} » (nombre entier attendu).`,
      );
    } else if (deaths !== undefined) entry.deaths = deaths;
    const feed = parseNumber(v.feedKg);
    if (
      feed !== undefined &&
      (Number.isNaN(feed) || feed < 0 || feed > 100_000)
    ) {
      control.errors.push(`Aliment invalide : « ${v.feedKg} » (kg).`);
    } else if (feed !== undefined) entry.feedKg = feed;
    const water = parseNumber(v.waterL);
    if (
      water !== undefined &&
      (Number.isNaN(water) || water < 0 || water > 1_000_000)
    ) {
      control.errors.push(`Eau invalide : « ${v.waterL} » (litres).`);
    } else if (water !== undefined) entry.waterL = water;
    const weight = parseNumber(v.avgWeightG);
    if (
      weight !== undefined &&
      (Number.isNaN(weight) || weight <= 0 || weight > 10_000)
    ) {
      control.errors.push(
        `Poids moyen invalide : « ${v.avgWeightG} » (grammes).`,
      );
    } else if (weight !== undefined) {
      entry.avgWeightKg = Math.round(weight) / 1000;
    }
    const sample = parseInteger(v.sampleSize);
    if (Number.isNaN(sample) || sample === 0) {
      control.errors.push(
        `Nombre de sujets pesés invalide : « ${v.sampleSize} » (entier, au moins 1).`,
      );
    } else if (sample !== undefined) {
      if (entry.avgWeightKg === undefined) {
        control.errors.push(
          'Le nombre de sujets pesés accompagne un poids moyen.',
        );
      } else entry.sampleSize = sample;
    }
    if (linked?.entryDates.has(day)) {
      alreadyPresent.push(input.line);
      continue;
    }
    if (linked?.closed) {
      control.errors.push(
        `Bande ${linked.code ?? group.bandRef} déjà reprise et clôturée : la saisie du ${frDay(day)} ne peut plus être ajoutée.`,
      );
    }
    entries.push(entry);
  }
  entries.sort((a, b) => (a.entryDate < b.entryDate ? -1 : 1));

  // Headcount over time (new band only: a linked band's entries are known
  // to the server, which re-checks every day at integration).
  if (!linked && quantityAtStart !== null) {
    let dead = 0;
    let emptiedOn: string | null = null;
    for (const e of entries) {
      const control = group.rows.find((r) => r.input.line === e.line)!.control;
      if (emptiedOn) {
        // The band closes itself when nobody is left.
        control.errors.push(
          `Saisie du ${frDay(e.entryDate)} impossible : plus aucun sujet vivant depuis le ${frDay(emptiedOn)}.`,
        );
        continue;
      }
      const alive = quantityAtStart - dead;
      if (e.sampleSize !== undefined && e.sampleSize > alive) {
        control.errors.push(
          `Échantillon impossible : ${e.sampleSize} sujet(s) pesé(s) pour ${alive} présent(s).`,
        );
      }
      dead += e.deaths ?? 0;
      if (dead > quantityAtStart) {
        control.errors.push(
          `Mortalité cumulée (${dead}) supérieure à l'effectif mis en place (${quantityAtStart}) au ${frDay(e.entryDate)}.`,
        );
      } else if (dead === quantityAtStart) emptiedOn = e.entryDate;
    }
  }

  const failing = group.rows
    .filter((r) => r.control.errors.length > 0)
    .map((r) => r.input.line);
  if (failing.length > 0) {
    const others = failing.length === 1 ? 'la ligne' : 'les lignes';
    for (const { control } of group.rows) {
      control.planned = ImportRowOutcome.REJETEE;
      if (control.errors.length === 0) {
        control.errors.push(
          `Bande ${group.bandRef} non reprise tant que ${others} ${failing.join(', ')} ${failing.length === 1 ? 'est' : 'sont'} en erreur.`,
        );
      }
    }
    return null;
  }
  if (!linked && entries.length === 0) {
    first.warnings.push(
      "Aucune saisie journalière : seule l'ouverture de la bande sera reprise.",
    );
  }
  const presentSet = new Set(alreadyPresent);
  const entryLines = new Set(entries.map((e) => e.line));
  for (const { input, control } of group.rows) {
    control.planned = entryLines.has(input.line)
      ? ImportRowOutcome.INTEGREE
      : presentSet.has(input.line) || linked
        ? ImportRowOutcome.DEJA_PRESENTE
        : ImportRowOutcome.INTEGREE;
  }
  return {
    groupKey: group.key,
    sourceKey,
    farm,
    bandRef: group.bandRef,
    lines: group.rows.map((r) => r.input.line),
    linked,
    opening: {
      integrationDate: integrationDate as string,
      initialAgeDays,
      quantityAtStart: quantityAtStart as number,
      type,
      breedId,
      buildingId,
      initialWeightG,
      closureDate,
    },
    entries,
    alreadyPresentLines: alreadyPresent,
  };
}
