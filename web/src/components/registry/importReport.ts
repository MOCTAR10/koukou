import type { ImportLine, ImportOutcome, ImportReport } from '../../api/types-programme';

export const OUTCOME_LABEL: Record<ImportOutcome, string> = {
  CREEE: 'Créée',
  A_CREER: 'À créer',
  DEJA_PRESENTE: 'Déjà présente',
  REJETEE: 'Rejetée',
};

export const OUTCOME_TONE: Record<ImportOutcome, 'emerald' | 'brand' | 'slate' | 'red'> = {
  CREEE: 'emerald',
  A_CREER: 'brand',
  DEJA_PRESENTE: 'slate',
  REJETEE: 'red',
};

export const FORMAT_LABEL: Record<ImportReport['format'], string> = {
  LISTE_POUFA: 'liste POUFA (numéro, nom, province)',
  COMPLET: 'format complet',
};

export interface ImportSummary {
  read: number;
  /** Created, or in a dry run, to create. */
  created: number;
  matched: number;
  rejected: number;
  /** Rejected only because they look like another farm: `confirmDuplicate` would create them. */
  duplicateRejections: number;
  /** A real run would write something. */
  canImport: boolean;
  /** One French sentence for the head of the report. */
  sentence: string;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

/** Totals and wording of a report (dry run or real). */
export function summarizeImport(report: ImportReport): ImportSummary {
  const duplicateRejections = report.lines.filter((l) => l.outcome === 'REJETEE' && (l.duplicates?.length ?? 0) > 0).length;
  const createdPart = report.dryRun
    ? plural(report.created, 'ferme à créer', 'fermes à créer')
    : plural(report.created, 'ferme créée', 'fermes créées');
  const sentence =
    `${plural(report.read, 'ligne lue', 'lignes lues')} : ${createdPart}, ` +
    `${plural(report.matched, 'déjà présente', 'déjà présentes')}, ${plural(report.rejected, 'rejetée', 'rejetées')}.`;
  return {
    read: report.read,
    created: report.created,
    matched: report.matched,
    rejected: report.rejected,
    duplicateRejections,
    canImport: report.dryRun && report.created > 0,
    sentence,
  };
}

/** Lines of one outcome, or all of them (`''`). */
export function linesOf(report: ImportReport, outcome: ImportOutcome | ''): ImportLine[] {
  return outcome ? report.lines.filter((l) => l.outcome === outcome) : report.lines;
}

/** Count per outcome, for the filter chips. */
export function outcomeCounts(report: ImportReport): Record<ImportOutcome, number> {
  const counts: Record<ImportOutcome, number> = { CREEE: 0, A_CREER: 0, DEJA_PRESENTE: 0, REJETEE: 0 };
  for (const l of report.lines) counts[l.outcome] += 1;
  return counts;
}

/** The import form: the file and the options sent as multipart fields (`dryRun` defaults to true on the server). */
export function importFormData(file: Blob, fileName: string, options: { dryRun: boolean; confirmDuplicate: boolean }): FormData {
  const form = new FormData();
  form.append('file', file, fileName);
  form.append('dryRun', String(options.dryRun));
  if (options.confirmDuplicate) form.append('confirmDuplicate', 'true');
  return form;
}

/** Client-side check before sending (the server caps the file at 5 MiB). */
export function checkImportFile(file: { name: string; size: number } | null): string | null {
  if (!file) return 'Choisissez un fichier CSV.';
  if (!/\.(csv|txt)$/i.test(file.name)) return 'Le fichier doit être un CSV (séparateur virgule ou point-virgule).';
  if (file.size === 0) return 'Le fichier est vide.';
  if (file.size > 5 * 1024 * 1024) return 'Le fichier dépasse 5 Mo.';
  return null;
}
