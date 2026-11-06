import {
  ImportJobStatus,
  ImportRowOutcome,
  ImportRowStatus,
} from '../../common/enums/import-job.enum.js';
import type { ImportJobCounts } from './entities/import-job.entity.js';

/** Steps of a job, each allowed from some statuses only. */
export type ImportJobStep =
  'SETTINGS' | 'CORRECT' | 'DRY_RUN' | 'VALIDATE' | 'INTEGRATE' | 'REJECT';

const S = ImportJobStatus;

const ALLOWED_FROM: Readonly<
  Record<ImportJobStep, readonly ImportJobStatus[]>
> = {
  SETTINGS: [S.DEPOSE, S.ANALYSE, S.CONTROLE, S.ESSAI],
  CORRECT: [S.CONTROLE, S.ESSAI],
  DRY_RUN: [S.CONTROLE, S.ESSAI],
  VALIDATE: [S.ESSAI],
  INTEGRATE: [S.VALIDE],
  REJECT: [S.DEPOSE, S.ANALYSE, S.CONTROLE, S.ESSAI, S.VALIDE],
};

const STATUS_LABELS: Readonly<Record<ImportJobStatus, string>> = {
  DEPOSE: 'déposé',
  ANALYSE: 'en analyse',
  CONTROLE: 'contrôlé',
  ESSAI: 'essayé à blanc',
  VALIDE: 'validé',
  INTEGRE: 'intégré',
  REJETE: 'rejeté',
};

export function statusLabel(status: ImportJobStatus): string {
  return STATUS_LABELS[status];
}

/** French reason `step` is refused in `status`, or null. */
export function stepRefusal(
  step: ImportJobStep,
  status: ImportJobStatus,
): string | null {
  if (ALLOWED_FROM[step].includes(status)) return null;
  const now = `L'import est ${STATUS_LABELS[status]}`;
  if (status === S.INTEGRE || status === S.REJETE) {
    return `${now} : il ne peut plus être modifié.`;
  }
  switch (step) {
    case 'SETTINGS':
    case 'CORRECT':
      return status === S.VALIDE
        ? `${now} : rejetez-le puis déposez le fichier corrigé, ou intégrez-le.`
        : `${now} : corrigez d'abord la correspondance des colonnes.`;
    case 'DRY_RUN':
      return status === S.VALIDE
        ? `${now} : l'essai à blanc est déjà accepté.`
        : `${now} : la correspondance des colonnes doit d'abord être complète.`;
    case 'VALIDATE':
      return `${now} : la validation suit un essai à blanc (relancez l'essai après toute correction).`;
    case 'INTEGRATE':
      return `${now} : l'intégration suit la validation de l'essai à blanc.`;
    default:
      return `${now}.`;
  }
}

export interface CountableRow {
  readonly status: ImportRowStatus;
  readonly excluded: boolean;
  readonly corrections: readonly unknown[];
  readonly plannedOutcome: ImportRowOutcome | null;
  readonly dryRunOutcome: ImportRowOutcome | null;
  readonly outcome: ImportRowOutcome | null;
}

/**
 * Line counts of a job. Outcome counts come from the integration when there
 * is one, else from the dry run, else from the controls' plan.
 */
export function countRows(
  rows: readonly CountableRow[],
  phase: 'planned' | 'dryRun' | 'final',
): ImportJobCounts {
  const outcomeOf = (r: CountableRow) =>
    phase === 'final'
      ? r.outcome
      : phase === 'dryRun'
        ? r.dryRunOutcome
        : r.plannedOutcome;
  const counts: ImportJobCounts = {
    read: rows.length,
    valid: 0,
    warnings: 0,
    errors: 0,
    excluded: 0,
    corrected: 0,
    integrated: 0,
    enriched: 0,
    alreadyPresent: 0,
    rejected: 0,
  };
  for (const r of rows) {
    if (r.corrections.length > 0) counts.corrected++;
    if (r.excluded) {
      counts.excluded++;
      continue;
    }
    if (r.status === ImportRowStatus.ERREUR) counts.errors++;
    else if (r.status === ImportRowStatus.AVERTISSEMENT) counts.warnings++;
    else counts.valid++;
    switch (outcomeOf(r)) {
      case ImportRowOutcome.INTEGREE:
        counts.integrated++;
        break;
      case ImportRowOutcome.ENRICHIE:
        counts.enriched++;
        break;
      case ImportRowOutcome.DEJA_PRESENTE:
        counts.alreadyPresent++;
        break;
      case ImportRowOutcome.REJETEE:
        counts.rejected++;
        break;
      default:
        break;
    }
  }
  return counts;
}

/** Status of a controlled line from its findings. */
export function rowStatusOf(
  excluded: boolean,
  errors: readonly string[],
  warnings: readonly string[],
): ImportRowStatus {
  if (excluded) return ImportRowStatus.EXCLUE;
  if (errors.length > 0) return ImportRowStatus.ERREUR;
  if (warnings.length > 0) return ImportRowStatus.AVERTISSEMENT;
  return ImportRowStatus.VALIDE;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value instanceof Date ? value.toISOString() : value;
}

/** JSON with sorted keys: the input of the report fingerprint. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}
