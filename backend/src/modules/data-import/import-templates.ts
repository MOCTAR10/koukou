import { ImportJobType } from '../../common/enums/import-job.enum.js';
import {
  BAND_FIELDS,
  FARM_FIELDS,
  pipelineOf,
  type ImportFieldDef,
} from './import-fields.js';

/**
 * Downloadable CSV templates (headers + one example line), one per job type.
 * They document the expected files while the real AMI forms and Excel
 * sheets are not available: any header matching an alias is accepted too,
 * and the mapping can be adjusted per job.
 */

export interface ImportTemplate {
  readonly type: ImportJobType;
  readonly label: string;
  readonly description: string;
  readonly fileName: string;
  readonly fields: readonly ImportFieldDef[];
  readonly example: Readonly<Record<string, string>>;
}

const BAND_EXAMPLE = {
  bandRef: 'B07',
  farmCode: 'G1-0001',
  integrationDate: '01/09/2026',
  initialAgeDays: '0',
  quantityAtStart: '1000',
  type: 'CHAIR',
  breed: 'Cobb 500',
  initialWeightG: '42',
  entryDate: '02/09/2026',
  deaths: '3',
  feedKg: '25',
  waterL: '60',
};

/** Fields of the transitional tool's generic export (no AMI ref., no building). */
const TOOL_FIELDS: readonly ImportFieldDef[] = BAND_FIELDS.filter(
  (f) => !['amiRef', 'building', 'initialWeightG'].includes(f.key),
).map((f) => (f.key === 'bandRef' ? { ...f, header: 'id_bande_outil' } : f));

export const IMPORT_TEMPLATES: readonly ImportTemplate[] = [
  {
    type: ImportJobType.AMI,
    label: 'Formulaires AMI (fiches des fermes)',
    description:
      "Une ligne par ferme. Crée la fiche au registre, ou complète les champs vides d'une ferme déjà présente (même référence AMI, ou même nom dans la même province). Obligatoire : nom, province.",
    fileName: 'modele-reprise-ami.csv',
    fields: FARM_FIELDS,
    example: {
      amiRef: 'AMI-2025-0042',
      name: 'Ferme Exemple Nkok',
      province: 'Estuaire',
      localite: 'Komo-Mondah',
      exploitantName: 'Jean Mba',
      exploitantPhone: '074123456',
      cohort: 'COHORTE_1',
      capacityPlaces: '2000',
      latitude: '0,3912',
      longitude: '9,4536',
      status: 'EN_PREPARATION',
    },
  },
  {
    type: ImportJobType.BANDES_HISTORIQUES,
    label: 'Fiches d’élevage (papier ou Excel) : bandes historiques',
    description:
      'Une ligne par saisie journalière ; les colonnes de la bande (ferme, mise en place, effectif…) sont répétées ou portées par sa première ligne. La bande est ouverte en J+x (âge initial), chaque jour est saisi en mode rattrapage, et la bande est clôturée à la date de clôture si elle est indiquée. Obligatoire : ref_bande, la ferme (code_ferme ou ref_ami), date_mise_en_place, effectif_initial.',
    fileName: 'modele-reprise-bandes.csv',
    fields: BAND_FIELDS.filter(
      (f) => !['farmName', 'province'].includes(f.key),
    ),
    example: BAND_EXAMPLE,
  },
  {
    type: ImportJobType.OUTIL_TRANSITOIRE,
    label: "Export de l'outil transitoire",
    description:
      "Même principe que les fiches d'élevage, avec l'identifiant de bande de l'outil (conservé comme clé de reprise) ; la ferme est retrouvée par son code POUFA ou par son nom et sa province.",
    fileName: 'modele-reprise-outil-transitoire.csv',
    fields: TOOL_FIELDS,
    example: {
      ...BAND_EXAMPLE,
      bandRef: '8812',
      farmCode: '',
      farmName: 'Ferme Exemple Nkok',
      province: 'G1',
    },
  },
];

export function templateOf(type: ImportJobType): ImportTemplate {
  return IMPORT_TEMPLATES.find((t) => t.type === type) as ImportTemplate;
}

/** Headers and example cells of a template. */
export function templateTable(t: ImportTemplate): {
  headers: string[];
  example: string[];
} {
  return {
    headers: t.fields.map((f) => f.header),
    example: t.fields.map((f) => t.example[f.key] ?? ''),
  };
}

/** Public description of a type (for the web screens). */
export function templateView(t: ImportTemplate) {
  return {
    type: t.type,
    label: t.label,
    description: t.description,
    pipeline: pipelineOf(t.type),
    fileName: t.fileName,
    fields: t.fields.map((f) => ({
      key: f.key,
      header: f.header,
      label: f.label,
      required: f.required === true,
    })),
  };
}
