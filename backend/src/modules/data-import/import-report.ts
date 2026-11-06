import { createHash } from 'node:crypto';
import {
  ImportJobStatus,
  ImportJobType,
  ImportRowOutcome,
  ImportRowStatus,
} from '../../common/enums/import-job.enum.js';
import type {
  ImportJob,
  ImportJobCounts,
} from './entities/import-job.entity.js';
import type { ImportRow } from './entities/import-row.entity.js';
import { fieldsOf, pipelineOf } from './import-fields.js';
import { canonicalJson, countRows, statusLabel } from './import-job-rules.js';
import { templateOf } from './import-templates.js';

/**
 * Recovery report (CDC §9: « rapport de reprise »): lines read, integrated,
 * rejected with their reason, manual corrections, then the DGE's signature.
 * Before integration it is the dry run's (or the controls') report. The
 * fingerprint is a SHA-256 over the canonical JSON of the whole report but
 * its generation time, so a printed report can be matched to the system.
 */

export type ReportPhase = 'CONTROLE' | 'ESSAI' | 'REPRISE';

export interface ReportLine {
  readonly line: number;
  readonly label: string;
  readonly sourceKey: string | null;
  readonly status: ImportRowStatus;
  readonly outcome: ImportRowOutcome | null;
  readonly code: string | null;
  readonly message: string | null;
}

export interface ReportCorrection {
  readonly line: number;
  readonly at: string;
  readonly by: string;
  readonly reason: string;
  readonly changes: string[];
}

export interface ReportTarget {
  readonly code: string;
  readonly outcome: ImportRowOutcome;
  readonly label: string;
  readonly lines: number;
}

export interface RecoveryReport {
  readonly phase: ReportPhase;
  readonly title: string;
  readonly job: {
    readonly id: string;
    readonly type: ImportJobType;
    readonly typeLabel: string;
    readonly status: ImportJobStatus;
    readonly statusLabel: string;
    readonly fileName: string;
    readonly fileSize: number;
    readonly fileSha256: string;
    readonly note: string | null;
    readonly createdAt: string;
    readonly createdBy: string | null;
    readonly dryRunAt: string | null;
    readonly dryRunBy: string | null;
    readonly validatedAt: string | null;
    readonly validatedBy: string | null;
    readonly validationComment: string | null;
    readonly integratedAt: string | null;
    readonly integratedBy: string | null;
    readonly rejectedAt: string | null;
    readonly rejectedBy: string | null;
    readonly rejectionReason: string | null;
  };
  readonly counts: ImportJobCounts;
  readonly rejected: ReportLine[];
  readonly corrections: ReportCorrection[];
  /** Farms or bands written (or matched), one entry per record. */
  readonly targets: ReportTarget[];
  readonly lines: ReportLine[];
  readonly fingerprint: string;
  readonly generatedAt: string;
}

function phaseOf(job: ImportJob): ReportPhase {
  if (job.status === ImportJobStatus.INTEGRE) return 'REPRISE';
  return job.dryRunAt ? 'ESSAI' : 'CONTROLE';
}

const TITLES: Record<ReportPhase, string> = {
  REPRISE: 'Rapport de reprise des données',
  ESSAI: "Rapport d'essai à blanc (rien n'est encore intégré)",
  CONTROLE: 'Rapport de contrôle (avant essai à blanc)',
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function lineLabel(row: ImportRow): string {
  const v = row.values;
  return v.name ?? (v.bandRef ? `Bande ${v.bandRef}` : `Ligne ${row.line}`);
}

export function buildReport(
  job: ImportJob,
  rows: readonly ImportRow[],
  userNames: ReadonlyMap<string, string>,
  now: Date = new Date(),
): RecoveryReport {
  const phase = phaseOf(job);
  const name = (id: string | null) =>
    id ? (userNames.get(id) ?? 'Utilisateur inconnu') : null;
  const fieldLabels = new Map(
    fieldsOf(pipelineOf(job.type)).map((f) => [f.key, f.header]),
  );
  const lines: ReportLine[] = rows.map((r) => {
    const outcome =
      phase === 'REPRISE'
        ? r.outcome
        : phase === 'ESSAI'
          ? r.dryRunOutcome
          : r.excluded
            ? ImportRowOutcome.EXCLUE
            : r.plannedOutcome;
    const message =
      phase === 'REPRISE'
        ? r.outcomeMessage
        : phase === 'ESSAI'
          ? r.dryRunMessage
          : [...r.errors, ...r.warnings].join(' ') || null;
    return {
      line: r.line,
      label: lineLabel(r),
      sourceKey: r.sourceKey,
      status: r.status,
      outcome,
      code:
        phase === 'REPRISE'
          ? r.targetCode
          : phase === 'ESSAI'
            ? r.dryRunCode
            : null,
      message,
    };
  });
  const corrections: ReportCorrection[] = rows.flatMap((r) =>
    r.corrections.map((c) => ({
      line: r.line,
      at: c.at,
      by: name(c.byId) as string,
      reason: c.reason,
      changes: [
        ...c.changes.map(
          (ch) =>
            `${fieldLabels.get(ch.field) ?? ch.field} : « ${ch.before ?? ''} » → « ${ch.after ?? ''} »`,
        ),
        ...(c.excluded === true
          ? ['ligne exclue']
          : c.excluded === false
            ? ['ligne rétablie']
            : []),
      ],
    })),
  );
  const targets = new Map<string, ReportTarget>();
  for (const l of lines) {
    if (
      !l.code ||
      (l.outcome !== ImportRowOutcome.INTEGREE &&
        l.outcome !== ImportRowOutcome.ENRICHIE)
    ) {
      continue;
    }
    const known = targets.get(l.code);
    targets.set(
      l.code,
      known
        ? { ...known, lines: known.lines + 1 }
        : { code: l.code, outcome: l.outcome, label: l.label, lines: 1 },
    );
  }
  const phaseCounts = countRows(
    rows,
    phase === 'REPRISE' ? 'final' : phase === 'ESSAI' ? 'dryRun' : 'planned',
  );
  const body = {
    phase,
    title: TITLES[phase],
    job: {
      id: job.id,
      type: job.type,
      typeLabel: templateOf(job.type).label,
      status: job.status,
      statusLabel: statusLabel(job.status),
      fileName: job.fileName,
      fileSize: job.fileSize,
      fileSha256: job.fileSha256,
      note: job.note,
      createdAt: job.createdAt.toISOString(),
      createdBy: name(job.createdById),
      dryRunAt: iso(job.dryRunAt),
      dryRunBy: name(job.dryRunById),
      validatedAt: iso(job.validatedAt),
      validatedBy: name(job.validatedById),
      validationComment: job.validationComment,
      integratedAt: iso(job.integratedAt),
      integratedBy: name(job.integratedById),
      rejectedAt: iso(job.rejectedAt),
      rejectedBy: name(job.rejectedById),
      rejectionReason: job.rejectionReason,
    },
    counts: phaseCounts,
    rejected: lines.filter(
      (l) =>
        l.outcome === ImportRowOutcome.REJETEE ||
        (phase === 'CONTROLE' && l.status === ImportRowStatus.ERREUR),
    ),
    corrections,
    targets: [...targets.values()],
    lines,
  };
  const fingerprint = createHash('sha256')
    .update(canonicalJson(body))
    .digest('hex');
  return { ...body, fingerprint, generatedAt: now.toISOString() };
}

const OUTCOME_LABELS: Record<ImportRowOutcome, string> = {
  INTEGREE: 'Intégrée',
  ENRICHIE: 'Complétée',
  DEJA_PRESENTE: 'Déjà présente',
  REJETEE: 'Rejetée',
  EXCLUE: 'Exclue',
};

export function outcomeLabel(outcome: ImportRowOutcome | null): string {
  return outcome ? OUTCOME_LABELS[outcome] : '—';
}

/** Header + rows of the line-by-line CSV export of a report. */
export function reportCsvTable(report: RecoveryReport): {
  headers: string[];
  rows: (string | number)[][];
} {
  return {
    headers: [
      'ligne',
      'libelle',
      'cle_source',
      'controle',
      'resultat',
      'code',
      'message',
    ],
    rows: report.lines.map((l) => [
      l.line,
      l.label,
      l.sourceKey ?? '',
      l.status,
      outcomeLabel(l.outcome),
      l.code ?? '',
      l.message ?? '',
    ]),
  };
}
