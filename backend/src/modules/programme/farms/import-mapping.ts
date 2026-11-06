import { compactKey } from './registry-rules.js';

/** Fields of an import row, as raw text. */
export interface RawFarmRow {
  name?: string;
  province?: string;
  localite?: string;
  exploitantName?: string;
  exploitantPhone?: string;
  amiRef?: string;
  cohort?: string;
  capacityPlaces?: string;
  latitude?: string;
  longitude?: string;
  status?: string;
}

export type ImportField = keyof RawFarmRow | 'ignored';

/**
 * Accepted column names (compared with `compactKey`: case, accents, spaces,
 * hyphens and underscores ignored). `numero` of the POUFA list is the
 * alphabetical order, NOT an identifier: it is read and ignored.
 */
const COLUMN_ALIASES: Readonly<Record<string, ImportField>> = {
  numero: 'ignored',
  num: 'ignored',
  no: 'ignored',
  n: 'ignored',
  ordre: 'ignored',
  nom: 'name',
  name: 'name',
  nomferme: 'name',
  nomdelaferme: 'name',
  ferme: 'name',
  raisonsociale: 'name',
  province: 'province',
  localite: 'localite',
  departement: 'localite',
  commune: 'localite',
  exploitant: 'exploitantName',
  nomexploitant: 'exploitantName',
  promoteur: 'exploitantName',
  responsable: 'exploitantName',
  telephone: 'exploitantPhone',
  tel: 'exploitantPhone',
  phone: 'exploitantPhone',
  telephoneexploitant: 'exploitantPhone',
  amiref: 'amiRef',
  refami: 'amiRef',
  referenceami: 'amiRef',
  ami: 'amiRef',
  cohorte: 'cohort',
  cohort: 'cohort',
  capacite: 'capacityPlaces',
  capaciteplaces: 'capacityPlaces',
  capacity: 'capacityPlaces',
  capacityplaces: 'capacityPlaces',
  places: 'capacityPlaces',
  latitude: 'latitude',
  lat: 'latitude',
  longitude: 'longitude',
  lng: 'longitude',
  lon: 'longitude',
  long: 'longitude',
  statut: 'status',
  status: 'status',
};

export function fieldOfColumn(header: string): ImportField | null {
  return COLUMN_ALIASES[compactKey(header)] ?? null;
}

export type ImportFormat = 'LISTE_POUFA' | 'COMPLET';

export interface MappedRow {
  /** 1-based line in the source (CSV: header = line 1; JSON: index + 1). */
  readonly line: number;
  readonly values: RawFarmRow;
}

export interface MappedImport {
  readonly format: ImportFormat;
  readonly rows: MappedRow[];
  /** Columns that were not recognized (ignored). */
  readonly unknownColumns: string[];
  /** French error making the whole file unusable, or null. */
  readonly error: string | null;
}

const POUFA_LIST_FIELDS: ReadonlySet<ImportField> = new Set([
  'ignored',
  'name',
  'province',
]);

function mapRecords(
  headers: string[],
  records: { line: number; cells: unknown[] }[],
): MappedImport {
  const fields = headers.map((h) => fieldOfColumn(h));
  const unknownColumns = headers.filter((h, i) => !fields[i] && h.trim());
  const used = new Set(fields.filter((f): f is ImportField => f !== null));
  const missing = (['name', 'province'] as const).filter((f) => !used.has(f));
  if (missing.length > 0) {
    return {
      format: 'COMPLET',
      rows: [],
      unknownColumns,
      error: `Colonne(s) obligatoire(s) absente(s) : ${missing
        .map((f) => (f === 'name' ? 'nom' : 'province'))
        .join(', ')}.`,
    };
  }
  const format: ImportFormat = [...used].every((f) => POUFA_LIST_FIELDS.has(f))
    ? 'LISTE_POUFA'
    : 'COMPLET';
  const rows = records.map(({ line, cells }) => {
    const values: RawFarmRow = {};
    fields.forEach((f, i) => {
      if (!f || f === 'ignored') return;
      const raw = cells[i];
      if (raw === undefined || raw === null) return;
      if (typeof raw === 'object') return;
      const text = String(raw as string | number | boolean).trim();
      if (text !== '' && values[f] === undefined) values[f] = text;
    });
    return { line, values };
  });
  return { format, rows, unknownColumns, error: null };
}

/** Maps parsed CSV rows (first row = headers). */
export function mapCsvTable(table: string[][]): MappedImport {
  if (table.length === 0) {
    return {
      format: 'COMPLET',
      rows: [],
      unknownColumns: [],
      error: "Fichier vide : une ligne d'en-tête est attendue.",
    };
  }
  const [headers, ...data] = table;
  return mapRecords(
    headers.map((h) => h.trim()),
    data.map((cells, i) => ({ line: i + 2, cells })),
  );
}

/** Maps JSON rows (objects keyed by column names). */
export function mapJsonRows(rows: Record<string, unknown>[]): MappedImport {
  const headers: string[] = [];
  for (const r of rows) {
    for (const k of Object.keys(r)) if (!headers.includes(k)) headers.push(k);
  }
  return mapRecords(
    headers,
    rows.map((r, i) => ({ line: i + 1, cells: headers.map((h) => r[h]) })),
  );
}

/** Integer ≥ 0 from text (`1 200`, `1200`); undefined when blank, NaN when invalid. */
export function parseCount(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const t = value.replace(/[\s  ]/g, '');
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

/** Decimal from text (`0,3912` or `0.3912`); undefined when blank, NaN when invalid. */
export function parseDecimal(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const t = value.trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}
