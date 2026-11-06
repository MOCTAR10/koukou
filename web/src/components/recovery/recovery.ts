import type {
  ImportField,
  ImportJob,
  ImportJobStatus,
  ImportJobStep,
  ImportJobType,
  ImportRow,
  ImportRowOutcome,
  ImportRowStatus,
} from '../../api/types-admin';
import type { Tone } from '../flock/shared';

/**
 * Data recovery screens (POUFA L8), pure rules. The step machine mirrors the
 * backend `data-import/import-job-rules.ts` for display only: buttons follow
 * the job's `allowedSteps` from the server, which answers a 409 in French
 * when the order is not respected.
 */

export const TYPE_LABELS: Readonly<Record<ImportJobType, string>> = {
  AMI: 'Fiches AMI (fermes)',
  BANDES_HISTORIQUES: 'Bandes historiques',
  OUTIL_TRANSITOIRE: 'Outil transitoire (bandes)',
};

export const IMPORT_TYPES = Object.keys(TYPE_LABELS) as ImportJobType[];

export const STATUS_LABELS: Readonly<Record<ImportJobStatus, string>> = {
  DEPOSE: 'Déposé',
  ANALYSE: 'En analyse',
  CONTROLE: 'Contrôlé',
  ESSAI: 'Essai à blanc fait',
  VALIDE: 'Validé',
  INTEGRE: 'Intégré',
  REJETE: 'Rejeté',
};

export const STATUS_TONES: Readonly<Record<ImportJobStatus, Tone>> = {
  DEPOSE: 'slate',
  ANALYSE: 'amber',
  CONTROLE: 'brand',
  ESSAI: 'brand',
  VALIDE: 'emerald',
  INTEGRE: 'emerald',
  REJETE: 'red',
};

/** `import-job-rules.ts` `ALLOWED_FROM`. */
const ALLOWED_FROM: Readonly<Record<ImportJobStep, readonly ImportJobStatus[]>> = {
  SETTINGS: ['DEPOSE', 'ANALYSE', 'CONTROLE', 'ESSAI'],
  CORRECT: ['CONTROLE', 'ESSAI'],
  DRY_RUN: ['CONTROLE', 'ESSAI'],
  VALIDATE: ['ESSAI'],
  INTEGRATE: ['VALIDE'],
  REJECT: ['DEPOSE', 'ANALYSE', 'CONTROLE', 'ESSAI', 'VALIDE'],
};

export function stepAllowedFrom(step: ImportJobStep, status: ImportJobStatus): boolean {
  return ALLOWED_FROM[step].includes(status);
}

/** Final statuses: nothing changes any more. */
export function isFinal(status: ImportJobStatus): boolean {
  return status === 'INTEGRE' || status === 'REJETE';
}

/** Whether the server offers `step` now (its `allowedSteps`), the display mirror as a fallback. */
export function canStep(job: Pick<ImportJob, 'allowedSteps' | 'status'>, step: ImportJobStep): boolean {
  return Array.isArray(job.allowedSteps) ? job.allowedSteps.includes(step) : stepAllowedFrom(step, job.status);
}

export type StepState = 'done' | 'current' | 'todo' | 'skipped';

/** ANALYSE → CONTROLE → ESSAI → VALIDE → INTEGRE (REJETE replaces what was left). */
export const STEPPER: readonly ImportJobStatus[] = ['ANALYSE', 'CONTROLE', 'ESSAI', 'VALIDE', 'INTEGRE'];

export const STEPPER_LABELS: Readonly<Record<ImportJobStatus, string>> = {
  DEPOSE: 'Dépôt',
  ANALYSE: 'Analyse des colonnes',
  CONTROLE: 'Contrôles',
  ESSAI: 'Essai à blanc',
  VALIDE: 'Validation',
  INTEGRE: 'Intégration',
  REJETE: 'Rejet',
};

/**
 * The stepper of a job: steps before the current one are done. A rejected
 * job shows how far it went (from its timestamps) then the rejection.
 */
export function stepperOf(
  job: Pick<ImportJob, 'status' | 'controlledAt' | 'dryRunAt' | 'validatedAt' | 'integratedAt'>,
): Array<{ status: ImportJobStatus; label: string; state: StepState }> {
  const steps = STEPPER.map((status) => ({ status, label: STEPPER_LABELS[status] }));
  if (job.status === 'REJETE') {
    const reached: Record<string, boolean> = {
      ANALYSE: true,
      CONTROLE: !!job.controlledAt,
      ESSAI: !!job.dryRunAt,
      VALIDE: !!job.validatedAt,
      INTEGRE: false,
    };
    return [
      ...steps.map((s) => ({ ...s, state: (reached[s.status] ? 'done' : 'skipped') as StepState })),
      { status: 'REJETE' as const, label: STEPPER_LABELS.REJETE, state: 'current' as const },
    ];
  }
  const index = job.status === 'DEPOSE' ? 0 : STEPPER.indexOf(job.status);
  return steps.map((s, i) => ({
    ...s,
    state: i < index || (job.status === 'INTEGRE' && i === index) ? 'done' : i === index ? 'current' : 'todo',
  }));
}

/** What to do next, in plain French. */
export function nextHint(job: Pick<ImportJob, 'status' | 'mappingError' | 'counts'>): string {
  switch (job.status) {
    case 'DEPOSE':
    case 'ANALYSE':
      return job.mappingError
        ? `Colonnes à faire correspondre : ${job.mappingError}`
        : 'Vérifiez la correspondance des colonnes puis enregistrez-la pour lancer les contrôles.';
    case 'CONTROLE':
      return job.counts.errors > 0
        ? `${job.counts.errors} ligne(s) en erreur : corrigez-les ou excluez-les (elles seraient rejetées), puis lancez l’essai à blanc.`
        : 'Contrôles terminés : lancez l’essai à blanc pour voir exactement ce que ferait l’intégration.';
    case 'ESSAI':
      return 'Essai à blanc fait : relisez le rapport puis faites valider par un profil habilité (toute correction renvoie aux contrôles).';
    case 'VALIDE':
      return 'Essai validé : l’intégration écrit tout en une transaction.';
    case 'INTEGRE':
      return 'Reprise intégrée : le rapport final est disponible en PDF et en CSV.';
    case 'REJETE':
      return 'Import rejeté : déposez le fichier corrigé pour recommencer.';
  }
}

// ----- Rows -------------------------------------------------------------------

export const ROW_STATUS_LABELS: Readonly<Record<ImportRowStatus, string>> = {
  VALIDE: 'Valide',
  AVERTISSEMENT: 'Avertissement',
  ERREUR: 'Erreur',
  EXCLUE: 'Exclue',
};

export const ROW_STATUS_TONES: Readonly<Record<ImportRowStatus, Tone>> = {
  VALIDE: 'emerald',
  AVERTISSEMENT: 'amber',
  ERREUR: 'red',
  EXCLUE: 'slate',
};

export const OUTCOME_LABELS: Readonly<Record<ImportRowOutcome, string>> = {
  INTEGREE: 'Intégrée',
  ENRICHIE: 'Fiche complétée',
  DEJA_PRESENTE: 'Déjà présente',
  REJETEE: 'Rejetée',
  EXCLUE: 'Exclue',
};

export const OUTCOME_TONES: Readonly<Record<ImportRowOutcome, Tone>> = {
  INTEGREE: 'emerald',
  ENRICHIE: 'brand',
  DEJA_PRESENTE: 'slate',
  REJETEE: 'red',
  EXCLUE: 'slate',
};

/** The outcome shown for a line: integration's, else dry run's, else the controls' plan (same order as the server's filter). */
export function rowOutcome(row: Pick<ImportRow, 'outcome' | 'dryRunOutcome' | 'plannedOutcome'>): { outcome: ImportRowOutcome | null; phase: 'final' | 'dryRun' | 'planned' | null } {
  if (row.outcome) return { outcome: row.outcome, phase: 'final' };
  if (row.dryRunOutcome) return { outcome: row.dryRunOutcome, phase: 'dryRun' };
  if (row.plannedOutcome) return { outcome: row.plannedOutcome, phase: 'planned' };
  return { outcome: null, phase: null };
}

export const OUTCOME_PHASE_LABELS = { final: 'intégration', dryRun: 'essai à blanc', planned: 'prévu' } as const;

export const ROWS_PAGE_SIZE = 50;

export function rowsQueryString(f: { status: ImportRowStatus | ''; outcome: ImportRowOutcome | '' }, page: number, pageSize = ROWS_PAGE_SIZE): string {
  const q = new URLSearchParams();
  if (f.status) q.set('status', f.status);
  if (f.outcome) q.set('outcome', f.outcome);
  q.set('page', String(page));
  q.set('pageSize', String(pageSize));
  return `?${q.toString()}`;
}

/** Minimum reason length of a correction or a rejection (DTO `@MinLength(5)`). */
export const REASON_MIN = 5;
export const REASON_MAX = 500;

export function reasonError(reason: string, what = 'Le motif'): string | null {
  const r = reason.trim();
  if (r.length < REASON_MIN) return `${what} doit faire au moins ${REASON_MIN} caractères.`;
  if (r.length > REASON_MAX) return `${what} ne doit pas dépasser ${REASON_MAX} caractères.`;
  return null;
}

/**
 * Body of `PATCH …/rows/:line`: the fields whose typed value differs from
 * the line's (empty = cleared, sent as null), plus the exclusion change.
 */
export function correctionBody(
  row: Pick<ImportRow, 'values' | 'excluded'>,
  edited: Readonly<Record<string, string>>,
  exclude: boolean,
  reason: string,
): { body: { values?: Record<string, string | null>; exclude?: boolean; reason: string } } | { error: string } {
  const err = reasonError(reason);
  if (err) return { error: err };
  const values: Record<string, string | null> = {};
  for (const [field, raw] of Object.entries(edited)) {
    const after = raw.trim() || null;
    const before = row.values[field] ?? null;
    if (after !== before) values[field] = after;
  }
  const excludeChanged = exclude !== row.excluded;
  if (!Object.keys(values).length && !excludeChanged) return { error: 'Aucune modification : les valeurs saisies sont celles de la ligne.' };
  return {
    body: {
      ...(Object.keys(values).length ? { values } : {}),
      ...(excludeChanged ? { exclude } : {}),
      reason: reason.trim(),
    },
  };
}

/** « province : G2 → G1 » lines of a correction, with the fields' labels. */
export function correctionLines(c: ImportRow['corrections'][number], fields: readonly ImportField[]): string[] {
  const label = (key: string) => fields.find((f) => f.key === key)?.label ?? key;
  const lines = c.changes.map((ch) => `${label(ch.field)} : ${ch.before ?? '(vide)'} → ${ch.after ?? '(vide)'}`);
  if (c.excluded === true) lines.push('Ligne exclue');
  if (c.excluded === false) lines.push('Ligne rétablie');
  return lines;
}

// ----- Mapping ----------------------------------------------------------------

/** Required fields no column maps to. */
export function missingRequired(fields: readonly ImportField[], mapping: Readonly<Record<string, string | null>>): ImportField[] {
  const mapped = new Set(Object.values(mapping).filter((v): v is string => !!v));
  return fields.filter((f) => f.required && !mapped.has(f.key));
}

/** Fields two columns or more map to (the server keeps one: say it before). */
export function duplicateTargets(mapping: Readonly<Record<string, string | null>>): string[] {
  const seen = new Map<string, number>();
  for (const v of Object.values(mapping)) if (v) seen.set(v, (seen.get(v) ?? 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([k]) => k);
}

/** The headers whose target changed, for `PUT …/settings {mapping}` (null when nothing changed). */
export function mappingChanges(
  original: Readonly<Record<string, string | null>>,
  edited: Readonly<Record<string, string | null>>,
): Record<string, string | null> | null {
  const out: Record<string, string | null> = {};
  for (const [header, target] of Object.entries(edited)) {
    if ((original[header] ?? null) !== (target ?? null)) out[header] = target ?? null;
  }
  return Object.keys(out).length ? out : null;
}

// ----- Deposit ----------------------------------------------------------------

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Same checks as the server's readers: CSV or Excel .xlsx/.xlsm, ≤ 5 MiB, not empty; .xls/.ods refused. */
export function checkRecoveryFile(file: { name: string; size: number } | null): string | null {
  if (!file) return 'Choisissez un fichier CSV ou Excel (.xlsx).';
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls') || name.endsWith('.ods')) return 'Format non lu : enregistrez le fichier en .xlsx ou en CSV.';
  if (!/\.(csv|txt|xlsx|xlsm)$/.test(name)) return 'Format attendu : CSV (séparateur , ou ;) ou Excel .xlsx.';
  if (file.size === 0) return 'Fichier vide.';
  if (file.size > MAX_IMPORT_BYTES) return 'Fichier trop lourd : 5 Mo au maximum.';
  return null;
}

/** Multipart body of `POST /programme/imports`. */
export function depositFormData(file: Blob, fileName: string, input: { type: ImportJobType; note: string; confirmDuplicate: boolean }): FormData {
  const form = new FormData();
  form.append('file', file, fileName);
  form.append('type', input.type);
  const note = input.note.trim();
  if (note) form.append('note', note);
  if (input.confirmDuplicate) form.append('confirmDuplicate', 'true');
  return form;
}

export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}
