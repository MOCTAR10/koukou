import { ImportJobType } from '../../common/enums/import-job.enum.js';
import { fieldOfColumn } from '../programme/farms/import-mapping.js';
import { compactKey } from '../programme/farms/registry-rules.js';

/**
 * Field catalogs and tolerant column mapping of the data recovery. The real
 * AMI forms and Excel files are not known yet: headers are matched by
 * aliases (case, accents, spaces, hyphens and underscores ignored), then the
 * mapping can be adjusted per job (`PUT /programme/imports/:id/settings`).
 */

/** Farms (registry) or bands (band + daily entries). */
export type ImportPipeline = 'FARMS' | 'BANDS';

export function pipelineOf(type: ImportJobType): ImportPipeline {
  return type === ImportJobType.AMI ? 'FARMS' : 'BANDS';
}

export interface ImportFieldDef {
  readonly key: string;
  readonly label: string;
  /** Header of the downloadable template. */
  readonly header: string;
  readonly required?: boolean;
  /** Extra accepted headers (compared with `compactKey`). */
  readonly aliases?: readonly string[];
}

/**
 * Registry farm fields. Keys are the farm importer's (`import-mapping.ts`)
 * and so are its aliases: the reprise and `POST /programme/farms/import`
 * read the same headers.
 */
export const FARM_FIELDS: readonly ImportFieldDef[] = [
  { key: 'amiRef', label: 'Référence AMI', header: 'ref_ami' },
  { key: 'name', label: 'Nom de la ferme', header: 'nom', required: true },
  {
    key: 'province',
    label: 'Province (code ou nom)',
    header: 'province',
    required: true,
  },
  {
    key: 'localite',
    label: 'Localité (département ou commune)',
    header: 'localite',
  },
  { key: 'exploitantName', label: "Nom de l'exploitant", header: 'exploitant' },
  {
    key: 'exploitantPhone',
    label: "Téléphone de l'exploitant",
    header: 'telephone',
  },
  { key: 'cohort', label: 'Cohorte', header: 'cohorte' },
  { key: 'capacityPlaces', label: 'Capacité (places)', header: 'capacite' },
  { key: 'latitude', label: 'Latitude', header: 'latitude' },
  { key: 'longitude', label: 'Longitude', header: 'longitude' },
  { key: 'status', label: 'Statut', header: 'statut' },
];

/** Band fields: one line per daily entry, the band's columns repeated (or on its first line only). */
export const BAND_FIELDS: readonly ImportFieldDef[] = [
  {
    key: 'bandRef',
    label: 'Référence de la bande (fiche ou outil)',
    header: 'ref_bande',
    required: true,
    aliases: [
      'refbande',
      'referencebande',
      'bande',
      'idbande',
      'idbandeoutil',
      'numerobande',
      'nbande',
      'nobande',
      'reflot',
      'idlot',
      'lot',
      'fiche',
      'numerofiche',
    ],
  },
  {
    key: 'farmCode',
    label: 'Code POUFA de la ferme',
    header: 'code_ferme',
    aliases: ['codeferme', 'codepoufa', 'codefermepoufa', 'code'],
  },
  {
    key: 'amiRef',
    label: 'Référence AMI de la ferme',
    header: 'ref_ami',
    aliases: ['refami', 'amiref', 'referenceami', 'ami'],
  },
  {
    key: 'farmName',
    label: 'Nom de la ferme (avec la province)',
    header: 'nom_ferme',
    aliases: ['nomferme', 'nomdelaferme', 'ferme', 'nom'],
  },
  {
    key: 'province',
    label: 'Province de la ferme',
    header: 'province',
    aliases: ['province'],
  },
  {
    key: 'integrationDate',
    label: 'Date de mise en place (ouverture)',
    header: 'date_mise_en_place',
    required: true,
    aliases: [
      'datemiseenplace',
      'miseenplace',
      'dateouverture',
      'dateintegration',
      'datedebut',
      'datedemarrage',
    ],
  },
  {
    key: 'initialAgeDays',
    label: "Âge des sujets à l'ouverture (jours, J+x)",
    header: 'age_initial_j',
    aliases: [
      'ageinitialj',
      'ageinitial',
      'ageouverture',
      'ageamiseenplace',
      'agejours',
      'jx',
    ],
  },
  {
    key: 'quantityAtStart',
    label: 'Effectif mis en place',
    header: 'effectif_initial',
    required: true,
    aliases: [
      'effectifinitial',
      'effectif',
      'effectifdepart',
      'effectifmisenplace',
      'nombrepoussins',
      'poussins',
      'sujets',
    ],
  },
  {
    key: 'type',
    label: 'Type (CHAIR ou PONDEUSE)',
    header: 'type',
    aliases: ['type', 'typebande', 'production', 'typeproduction'],
  },
  {
    key: 'breed',
    label: 'Souche',
    header: 'souche',
    aliases: ['souche', 'race', 'breed'],
  },
  {
    key: 'building',
    label: 'Bâtiment',
    header: 'batiment',
    aliases: ['batiment', 'building', 'poulailler'],
  },
  {
    key: 'initialWeightG',
    label: "Poids moyen à l'ouverture (g)",
    header: 'poids_initial_g',
    aliases: ['poidsinitialg', 'poidsinitial', 'poidsouverture'],
  },
  {
    key: 'closureDate',
    label: 'Date de clôture (bande terminée)',
    header: 'date_cloture',
    aliases: ['datecloture', 'cloture', 'datefin', 'datefinbande'],
  },
  {
    key: 'entryDate',
    label: 'Date de la saisie journalière',
    header: 'date_saisie',
    aliases: ['datesaisie', 'date', 'jour', 'datejour'],
  },
  {
    key: 'deaths',
    label: 'Morts du jour',
    header: 'morts',
    aliases: [
      'morts',
      'mort',
      'mortalite',
      'mortalites',
      'deces',
      'mortsdujour',
    ],
  },
  {
    key: 'feedKg',
    label: 'Aliment consommé (kg)',
    header: 'aliment_kg',
    aliases: [
      'alimentkg',
      'aliment',
      'aliments',
      'alimentconsomme',
      'consommationaliment',
    ],
  },
  {
    key: 'waterL',
    label: 'Eau bue (L)',
    header: 'eau_l',
    aliases: ['eaul', 'eau', 'eauconsommee', 'eaulitres'],
  },
  {
    key: 'avgWeightG',
    label: 'Poids moyen pesé (g)',
    header: 'poids_moyen_g',
    aliases: ['poidsmoyeng', 'poidsmoyen', 'poids', 'pesee'],
  },
  {
    key: 'sampleSize',
    label: 'Nombre de sujets pesés',
    header: 'sujets_peses',
    aliases: ['sujetspeses', 'echantillon', 'nombrepeses', 'nbpeses'],
  },
];

/** Headers read and deliberately ignored (comments, order numbers). */
const IGNORED_ALIASES: ReadonlySet<string> = new Set([
  'observations',
  'observation',
  'remarques',
  'remarque',
  'commentaire',
  'commentaires',
  'notes',
]);

export function fieldsOf(pipeline: ImportPipeline): readonly ImportFieldDef[] {
  return pipeline === 'FARMS' ? FARM_FIELDS : BAND_FIELDS;
}

const BAND_ALIASES: ReadonlyMap<string, string> = new Map(
  BAND_FIELDS.flatMap((f) =>
    [f.header, ...(f.aliases ?? [])].map((a) => [compactKey(a), f.key]),
  ),
);

/** Field of a header, `null` when ignored or unknown. */
function autoField(pipeline: ImportPipeline, header: string): string | null {
  const key = compactKey(header);
  if (!key || IGNORED_ALIASES.has(key)) return null;
  if (pipeline === 'FARMS') {
    const f = fieldOfColumn(header);
    return f && f !== 'ignored' ? f : null;
  }
  return BAND_ALIASES.get(key) ?? null;
}

function isKnownIgnored(pipeline: ImportPipeline, header: string): boolean {
  const key = compactKey(header);
  if (IGNORED_ALIASES.has(key)) return true;
  return pipeline === 'FARMS' && fieldOfColumn(header) === 'ignored';
}

export interface ColumnMapping {
  readonly mapping: Record<string, string | null>;
  /** Headers neither mapped nor known as ignored. */
  readonly unknownColumns: string[];
}

/**
 * Automatic mapping, adjusted by `overrides` (header → field key, `null`
 * to ignore). When two headers reach the same field, the first one wins.
 */
export function buildMapping(
  pipeline: ImportPipeline,
  headers: readonly string[],
  overrides: Record<string, string | null> = {},
): ColumnMapping {
  const mapping: Record<string, string | null> = {};
  const used = new Set<string>();
  const unknownColumns: string[] = [];
  for (const header of headers) {
    if (header in mapping) continue;
    const field =
      header in overrides ? overrides[header] : autoField(pipeline, header);
    if (field && !used.has(field)) {
      mapping[header] = field;
      used.add(field);
    } else {
      mapping[header] = null;
      if (
        header.trim() &&
        autoField(pipeline, header) === null &&
        !isKnownIgnored(pipeline, header)
      ) {
        unknownColumns.push(header);
      }
    }
  }
  return { mapping, unknownColumns };
}

/**
 * French reason a mapping is unusable (unknown field in an override, field
 * mapped twice, mandatory field missing), or null.
 */
export function mappingProblem(
  pipeline: ImportPipeline,
  overrides: Record<string, string | null>,
  mapping: Record<string, string | null>,
): string | null {
  const fields = fieldsOf(pipeline);
  const keys = new Set(fields.map((f) => f.key));
  const unknown = Object.values(overrides).filter(
    (f): f is string => f !== null && !keys.has(f),
  );
  if (unknown.length > 0) {
    return `Champ(s) inconnu(s) dans la correspondance des colonnes : ${[...new Set(unknown)].join(', ')}.`;
  }
  const counts = new Map<string, number>();
  for (const f of Object.values(overrides)) {
    if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  const twice = [...counts].filter(([, n]) => n > 1).map(([f]) => f);
  if (twice.length > 0) {
    return `Plusieurs colonnes vont au même champ : ${twice.join(', ')}.`;
  }
  const mapped = new Set(Object.values(mapping).filter(Boolean));
  const missing = fields.filter((f) => f.required && !mapped.has(f.key));
  if (missing.length > 0) {
    return `Colonne(s) obligatoire(s) absente(s) : ${missing.map((f) => `${f.header} (${f.label})`).join(', ')}.`;
  }
  if (
    pipeline === 'BANDS' &&
    !mapped.has('farmCode') &&
    !mapped.has('amiRef') &&
    !(mapped.has('farmName') && mapped.has('province'))
  ) {
    return 'La ferme doit être identifiée : colonne code_ferme, ou ref_ami, ou nom_ferme avec province.';
  }
  return null;
}

/** Values of one line: field key → trimmed text (blank cells left out). */
export function mapCells(
  headers: readonly string[],
  mapping: Record<string, string | null>,
  cells: readonly string[],
): Record<string, string> {
  const values: Record<string, string> = {};
  headers.forEach((header, i) => {
    const field = mapping[header];
    if (!field || values[field] !== undefined) return;
    const text = (cells[i] ?? '').trim();
    if (text !== '') values[field] = text;
  });
  return values;
}
