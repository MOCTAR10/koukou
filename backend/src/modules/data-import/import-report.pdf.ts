import type { ImportJobCounts } from './entities/import-job.entity.js';
import { outcomeLabel, type RecoveryReport } from './import-report.js';

/** Lines listed in the PDF tables; the CSV export holds every line. */
const PDF_LINE_LIMIT = 500;

const frDateTime = (value: string | null): string => {
  if (!value) return '—';
  return new Date(value).toLocaleString('fr-FR', {
    timeZone: 'Africa/Libreville',
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

const COUNT_LABELS: [keyof ImportJobCounts, string][] = [
  ['read', 'Lignes lues'],
  ['integrated', 'Intégrées (créées)'],
  ['enriched', 'Complétées (fiche existante)'],
  ['alreadyPresent', 'Déjà présentes (aucune écriture)'],
  ['rejected', 'Rejetées (motif ci-dessous)'],
  ['excluded', 'Exclues manuellement'],
  ['corrected', 'Corrigées manuellement'],
  ['warnings', 'Avec avertissement'],
];

function table(
  headers: string[],
  rows: (string | number)[][],
  widths: (string | number)[],
) {
  return {
    table: {
      headerRows: 1,
      widths,
      body: [
        headers.map((h) => ({ text: h, style: 'tableHeader' })),
        ...rows.map((r) => r.map((c) => ({ text: String(c), style: 'cell' }))),
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 2, 0, 10],
  };
}

function truncated<T>(items: readonly T[]): {
  items: T[];
  note: string | null;
} {
  if (items.length <= PDF_LINE_LIMIT) return { items: [...items], note: null };
  return {
    items: items.slice(0, PDF_LINE_LIMIT),
    note: `${items.length - PDF_LINE_LIMIT} ligne(s) de plus dans l'export CSV du rapport.`,
  };
}

/** pdfmake document of a recovery report, rendered by `PdfService.render`. */
export function recoveryReportDocument(
  report: RecoveryReport,
): Record<string, unknown> {
  const j = report.job;
  const meta: [string, string][] = [
    ['Type de reprise', j.typeLabel],
    ['Fichier', `${j.fileName} (${j.fileSize} octets)`],
    ['Empreinte du fichier (SHA-256)', j.fileSha256],
    ['Statut', j.statusLabel],
    ['Déposé le', `${frDateTime(j.createdAt)} par ${j.createdBy ?? '—'}`],
    [
      'Essai à blanc',
      j.dryRunAt ? `${frDateTime(j.dryRunAt)} par ${j.dryRunBy ?? '—'}` : '—',
    ],
    [
      'Validation',
      j.validatedAt
        ? `${frDateTime(j.validatedAt)} par ${j.validatedBy ?? '—'}${j.validationComment ? ` (« ${j.validationComment} »)` : ''}`
        : '—',
    ],
    [
      'Intégration',
      j.integratedAt
        ? `${frDateTime(j.integratedAt)} par ${j.integratedBy ?? '—'}`
        : '—',
    ],
  ];
  if (j.rejectedAt) {
    meta.push([
      'Rejet',
      `${frDateTime(j.rejectedAt)} par ${j.rejectedBy ?? '—'} : ${j.rejectionReason ?? ''}`,
    ]);
  }
  if (j.note) meta.push(['Note', j.note]);

  const rejected = truncated(report.rejected);
  const targets = truncated(report.targets);
  const corrections = truncated(report.corrections);
  const content: unknown[] = [
    {
      text: 'Programme POUFA — Reprise des données existantes',
      style: 'header',
    },
    { text: report.title, style: 'subheader' },
    table(
      ['Élément', 'Valeur'],
      meta.map(([k, v]) => [k, v]),
      [150, '*'],
    ),
    { text: 'Bilan des lignes', style: 'section' },
    table(
      ['Indicateur', 'Nombre'],
      COUNT_LABELS.map(([k, label]) => [label, report.counts[k]]),
      ['*', 80],
    ),
    { text: 'Lignes rejetées et motif', style: 'section' },
    report.rejected.length === 0
      ? { text: 'Aucune ligne rejetée.', style: 'meta' }
      : table(
          ['Ligne', 'Libellé', 'Motif'],
          rejected.items.map((l) => [l.line, l.label, l.message ?? '']),
          [35, 120, '*'],
        ),
    ...(rejected.note ? [{ text: rejected.note, style: 'meta' }] : []),
    { text: 'Corrections manuelles', style: 'section' },
    report.corrections.length === 0
      ? { text: 'Aucune correction manuelle.', style: 'meta' }
      : table(
          ['Ligne', 'Le / par', 'Modification', 'Motif'],
          corrections.items.map((c) => [
            c.line,
            `${frDateTime(c.at)}\n${c.by}`,
            c.changes.join('\n'),
            c.reason,
          ]),
          [35, 90, '*', 120],
        ),
    ...(corrections.note ? [{ text: corrections.note, style: 'meta' }] : []),
    {
      text:
        report.phase === 'REPRISE'
          ? 'Enregistrements intégrés'
          : 'Enregistrements prévus',
      style: 'section',
    },
    report.targets.length === 0
      ? { text: 'Aucun enregistrement.', style: 'meta' }
      : table(
          ['Code', 'Libellé', 'Résultat', 'Lignes'],
          targets.items.map((t) => [
            t.code,
            t.label,
            outcomeLabel(t.outcome),
            t.lines,
          ]),
          [110, '*', 80, 45],
        ),
    ...(targets.note ? [{ text: targets.note, style: 'meta' }] : []),
    { text: 'Visa', style: 'section' },
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: 'Établi par (opérateur de la reprise)', bold: true },
            {
              text: j.integratedBy ?? j.dryRunBy ?? j.createdBy ?? '',
              margin: [0, 4, 0, 0],
            },
            { text: '\nDate et signature :', margin: [0, 8, 0, 0] },
            { text: '\n\n______________________________' },
          ],
        },
        {
          width: '*',
          stack: [
            { text: 'Visa de la DGE (programme POUFA)', bold: true },
            { text: 'Nom et qualité :', margin: [0, 4, 0, 0] },
            { text: '\nDate et signature :', margin: [0, 8, 0, 0] },
            { text: '\n\n______________________________' },
          ],
        },
      ],
      columnGap: 24,
      margin: [0, 4, 0, 12],
    },
    {
      text: `Empreinte du rapport (SHA-256) : ${report.fingerprint}`,
      style: 'fingerprint',
    },
    {
      text: `L'empreinte couvre toutes les lignes (détail dans l'export CSV du rapport), pas la date de génération. Document généré le ${frDateTime(report.generatedAt)}.`,
      style: 'footer',
    },
  ];
  return {
    pageSize: 'A4',
    pageMargins: [36, 40, 36, 48],
    content,
    footer: (page: number, pages: number) => ({
      text: `Rapport ${report.job.id} — page ${page} / ${pages}`,
      alignment: 'center',
      fontSize: 7,
      color: '#888888',
      margin: [0, 16, 0, 0],
    }),
    styles: {
      header: { fontSize: 15, bold: true, margin: [0, 0, 0, 4] },
      subheader: {
        fontSize: 12,
        bold: true,
        color: '#444444',
        margin: [0, 0, 0, 8],
      },
      section: {
        fontSize: 11,
        bold: true,
        color: '#206080',
        margin: [0, 8, 0, 4],
      },
      meta: { fontSize: 9, color: '#555555', margin: [0, 0, 0, 8] },
      tableHeader: { bold: true, fontSize: 9, color: '#222222' },
      cell: { fontSize: 8.5 },
      fingerprint: { fontSize: 8, bold: true, margin: [0, 8, 0, 2] },
      footer: { fontSize: 7.5, color: '#888888' },
    },
  };
}
