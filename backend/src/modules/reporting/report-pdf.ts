/**
 * Content of the report PDFs, as the shared `PdfService.createAccountingPdf`
 * layout expects it (titled tables). Pure: the reports service gathers the
 * figures, this file only lays them out (French labels).
 */
import type {
  AccountingPdfSection,
  AccountingReportData,
} from '../../common/services/pdf.service.js';
import { ReportSection } from '../../common/enums/report.enum.js';
import type { BandeSnapshot } from '../bandes/entities/bande-snapshot.entity.js';
import type { BandComparison } from './band-comparison.service.js';
import { SECTION_LABELS } from './data/default-report-templates.js';
import type {
  GroupFigures,
  PilotageDashboard,
  ProvinceFigures,
} from './pilotage-dashboard.service.js';
import type { PilotageMetrics } from './pilotage-metrics.js';
import type { PilotageObjective } from './pilotage-objective.service.js';

/** French number: space as thousands separator, comma decimals ('—' for null). */
export function fmt(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const fixed = Math.abs(value).toFixed(digits);
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${value < 0 ? '-' : ''}${grouped}${dec ? `,${dec}` : ''}`;
}

const pctText = (v: number | null | undefined, digits = 1) =>
  v == null ? '—' : `${fmt(v, digits)} %`;

/** `2026-11-02` → `02/11/2026`. */
export function frDate(day: string): string {
  const [y, m, d] = day.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const HIDDEN = 'Masqué (moins de fermes que le minimum)';

export interface FarmToFollow {
  code: string | null;
  name: string;
  province: string;
  mortalityPct: number | null;
  completenessPct: number | null;
  activeRedAlerts: number;
  reason: string;
}

export interface AreaReportInput {
  title: string;
  /** « Programme POUFA » or « Programme POUFA — Estuaire ». */
  heading: string;
  periodLabel: string;
  sections: readonly ReportSection[];
  dashboard: PilotageDashboard;
  objective: PilotageObjective | null;
  farmsToFollow: FarmToFollow[];
  generatedAt: Date;
}

function metricRows(m: PilotageMetrics): string[][] {
  return [
    ['Fermes ayant saisi des données', fmt(m.farmsReporting)],
    ['Bandes suivies', fmt(m.bands)],
    ['Bandes en cours en fin de période', fmt(m.activeBands)],
    ['Effectif présent en fin de période', fmt(m.headcount)],
    ['Poussins mis en place', fmt(m.placedHeads)],
    ['Morts de la période', fmt(m.deaths)],
    ['Mortalité de la période', pctText(m.mortalityPct)],
  ];
}

function figuresRows(
  g: GroupFigures,
  rows: (m: PilotageMetrics) => string[][],
): string[][] {
  if (g.suppressed || !g.metrics) return [['Valeurs', HIDDEN]];
  return rows(g.metrics);
}

function productionRows(m: PilotageMetrics): string[][] {
  return [
    ['Animaux sortis vivants (têtes)', fmt(m.produced.heads)],
    ['Poids vif produit estimé', `${fmt(m.produced.tonnes, 3)} t`],
    ['Poulets vifs vendus (têtes)', fmt(m.sold.liveHeads)],
    ['Poulets vifs vendus au kilo', `${fmt(m.sold.liveKg, 1)} kg`],
    ['Carcasses vendues (pièces)', fmt(m.sold.carcassHeads)],
    ['Carcasses vendues au kilo', `${fmt(m.sold.carcassKg, 1)} kg`],
    ['Chiffre d’affaires volailles', `${fmt(m.sold.revenueFcfa)} FCFA`],
    ['Prix moyen par tête (vif)', `${fmt(m.sold.avgPricePerHeadFcfa)} FCFA`],
    ['Prix moyen au kilo (vif)', `${fmt(m.sold.avgPricePerKgFcfa)} FCFA`],
    [
      'Prix moyen par carcasse',
      `${fmt(m.sold.avgCarcassPricePerPieceFcfa)} FCFA`,
    ],
    [
      'Prix moyen au kilo (carcasse)',
      `${fmt(m.sold.avgCarcassPricePerKgFcfa)} FCFA`,
    ],
  ];
}

function alertRows(
  m: PilotageMetrics,
  published: PilotageDashboard['publishedAlerts'],
): string[][] {
  return [
    ['Alertes de conseil levées (jaunes et rouges)', fmt(m.alerts.raised)],
    ['dont rouges', fmt(m.alerts.raisedRed)],
    ['Alertes encore actives', fmt(m.alerts.activeNow)],
    [
      'Alertes sanitaires publiées',
      published.available
        ? fmt(published.count)
        : 'Module sanitaire non branché',
    ],
  ];
}

function completenessRows(m: PilotageMetrics): string[][] {
  return [
    ['Jours saisis', fmt(m.completeness.daysEntered)],
    ['Jours écoulés', fmt(m.completeness.daysElapsed)],
    ['Complétude', pctText(m.completeness.pct)],
  ];
}

function provinceRows(list: ProvinceFigures[]): string[][] {
  return list.map((p) =>
    p.suppressed || !p.metrics
      ? [p.name, fmt(p.farms), 'masqué', 'masqué', 'masqué', 'masqué', 'masqué']
      : [
          p.name,
          fmt(p.farms),
          fmt(p.metrics.headcount),
          pctText(p.metrics.mortalityPct),
          fmt(p.metrics.produced.tonnes, 3),
          fmt(p.metrics.sold.avgPricePerHeadFcfa),
          pctText(p.metrics.completeness.pct),
        ],
  );
}

/** PDF content of a national or province report. */
export function areaReport(input: AreaReportInput): AccountingReportData {
  const d = input.dashboard;
  const sections: AccountingPdfSection[] = [];
  const twoCols = ['Indicateur', 'Valeur'];
  for (const s of input.sections) {
    const title = SECTION_LABELS[s];
    switch (s) {
      case ReportSection.SYNTHESE:
        sections.push({
          title,
          columns: twoCols,
          rows: [
            ['Fermes du périmètre', fmt(d.totals.farms)],
            ...figuresRows(d.totals, metricRows),
          ],
        });
        break;
      case ReportSection.PROVINCES:
        sections.push({
          title,
          columns: [
            'Province',
            'Fermes',
            'Effectif',
            'Mortalité',
            'Produit (t)',
            'Prix/tête',
            'Complétude',
          ],
          rows: provinceRows(d.provinces),
        });
        break;
      case ReportSection.PRODUCTION:
        sections.push({
          title,
          columns: twoCols,
          rows: figuresRows(d.totals, productionRows),
        });
        break;
      case ReportSection.FERMES:
        sections.push({
          title,
          columns: ['Statut ou cohorte', 'Fermes'],
          rows: [
            ...d.farms.byStatus.map((c) => [
              `Statut : ${c.label}`,
              fmt(c.count),
            ]),
            ...d.farms.byCohort.map((c) => [
              `Cohorte : ${c.label}`,
              fmt(c.count),
            ]),
            [
              'Fermes avec des animaux en fin de période',
              fmt(d.farms.producing),
            ],
          ],
        });
        break;
      case ReportSection.ALERTES:
        sections.push({
          title,
          columns: twoCols,
          rows: figuresRows(d.totals, (m) => alertRows(m, d.publishedAlerts)),
        });
        break;
      case ReportSection.COMPLETUDE:
        sections.push({
          title,
          columns: twoCols,
          rows: figuresRows(d.totals, completenessRows),
        });
        break;
      case ReportSection.OBJECTIF: {
        const o = input.objective;
        if (!o) break;
        const rows: string[][] = [
          ['Objectif national', `${fmt(o.objective.tonnes)} t (poids vif)`],
        ];
        if (o.actual && o.projection) {
          rows.push(
            [
              `Produit depuis le ${frDate(o.actual.since)}`,
              `${fmt(o.actual.tonnes, 1)} t`,
            ],
            ['Produit sur 12 mois', `${fmt(o.actual.last12MonthsTonnes, 1)} t`],
            [
              'Potentiel annuel du programme',
              `${fmt(o.projection.annualPotentialTonnes, 1)} t`,
            ],
            ...o.projection.years.map((y) => [
              `Projection ${y.year}`,
              `${fmt(y.annualTonnes, 1)} t (${pctText(y.objectiveSharePct)} de l’objectif)`,
            ]),
          );
        } else {
          rows.push(['Valeurs', HIDDEN]);
        }
        rows.push(['À lire', o.caveat]);
        sections.push({ title, columns: twoCols, rows });
        break;
      }
      case ReportSection.FERMES_A_SUIVRE:
        sections.push({
          title,
          columns: [
            'Ferme',
            'Province',
            'Mortalité',
            'Complétude',
            'Alertes rouges',
            'Motif',
          ],
          rows:
            input.farmsToFollow.length > 0
              ? input.farmsToFollow.map((f) => [
                  `${f.code ?? ''} ${f.name}`.trim(),
                  f.province,
                  pctText(f.mortalityPct),
                  pctText(f.completenessPct),
                  fmt(f.activeRedAlerts),
                  f.reason,
                ])
              : [['Aucune ferme à signaler', '', '', '', '', '']],
        });
        break;
      default:
        break;
    }
  }
  if (d.scope.note) {
    sections.push({
      title: 'Confidentialité',
      columns: ['Règle', 'Détail'],
      rows: [['Agrégats', d.scope.note]],
    });
  }
  sections.push({
    title: 'Méthodes',
    columns: ['N°', 'Méthode'],
    rows: d.notes.map((note, i) => [String(i + 1), note]),
  });
  return {
    farmName: input.heading,
    title: input.title,
    period: input.periodLabel,
    generatedAtLabel: generatedLabel(input.generatedAt),
    sections,
    totals: [],
  };
}

export interface BandReportInput {
  title: string;
  heading: string;
  periodLabel: string;
  sections: readonly ReportSection[];
  bandCode: string | null;
  snapshot: BandeSnapshot;
  comparison: BandComparison | null;
  generatedAt: Date;
}

/** PDF content of an end-of-band report. */
export function bandReport(input: BandReportInput): AccountingReportData {
  const s = input.snapshot;
  const sections: AccountingPdfSection[] = [];
  for (const section of input.sections) {
    if (section === ReportSection.BILAN) {
      const v = s.variables;
      sections.push({
        title: SECTION_LABELS[section],
        columns: ['Indicateur', 'Valeur'],
        rows: [
          ['Bande', input.bandCode ?? '—'],
          ['Durée', `${fmt(s.durationDays)} jours`],
          ['Âge à la clôture', `${fmt(s.ageDays)} jours`],
          ['Mis en place', fmt(v.mis_en_place ?? null)],
          ['Morts cumulés', fmt(v.morts_cumules ?? null)],
          ['Sortis vivants (têtes)', fmt(v.sortis_tetes ?? null)],
          ['Poids vif sorti', `${fmt(v.poids_sortis_kg ?? null, 1)} kg`],
          ['Aliment consommé', `${fmt(v.aliment_kg ?? null, 1)} kg`],
          ...s.indicators.map((i) => [
            i.label,
            `${fmt(i.value, 2)}${i.unit ? ` ${i.unit}` : ''}`,
          ]),
          ['Complétude des saisies', pctText(s.completenessPct)],
          ['Version du bilan', String(s.version)],
        ],
      });
    }
    if (section === ReportSection.COMPARAISON && input.comparison) {
      const c = input.comparison;
      sections.push({
        title: SECTION_LABELS[section],
        columns: [
          'Semaine d’âge',
          'Mortalité bande',
          'Mortalité moyenne',
          'IC bande',
          'IC moyen',
          'GMQ bande',
          'GMQ moyen',
        ],
        rows: c.weeks.map((w) => [
          `S${w.week} (J${w.ageFrom}-J${w.ageTo})`,
          pctText(w.band?.mortalityPct, 2),
          w.programme ? pctText(w.programme.mortalityPct, 2) : 'masqué',
          fmt(w.band?.fcr, 2),
          w.programme ? fmt(w.programme.fcr, 2) : 'masqué',
          w.band?.gmqG == null ? '—' : `${fmt(w.band.gmqG, 1)} g/j`,
          w.programme?.gmqG == null
            ? w.programme
              ? '—'
              : 'masqué'
            : `${fmt(w.programme.gmqG, 1)} g/j`,
        ]),
      });
      sections.push({
        title: 'Méthode de comparaison',
        columns: ['N°', 'Méthode'],
        rows: c.method.map((m, i) => [String(i + 1), m]),
      });
    }
  }
  return {
    farmName: input.heading,
    title: input.title,
    period: input.periodLabel,
    generatedAtLabel: generatedLabel(input.generatedAt),
    sections,
    totals: [],
  };
}

function generatedLabel(at: Date): string {
  const iso = at.toISOString();
  return `${frDate(iso)} à ${iso.slice(11, 16)} UTC`;
}
