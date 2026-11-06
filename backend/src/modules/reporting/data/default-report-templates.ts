import { AccessScopeKind } from '../../../common/enums/access-scope-kind.enum.js';
import {
  ReportLevel,
  ReportPeriodicity,
  ReportSection,
} from '../../../common/enums/report.enum.js';
import type { ReportAudience } from '../entities/report-template.entity.js';

/**
 * The three report models the CDC proposes (« Proposé : hebdomadaire, fin de
 * bande, mensuel national »), seeded once per programme and then tuned by the
 * administration (sections, audience, active). Codes never change.
 */
export interface DefaultReportTemplate {
  code: string;
  label: string;
  periodicity: ReportPeriodicity;
  level: ReportLevel;
  sections: ReportSection[];
  audience: ReportAudience;
}

export const REPORT_TEMPLATE_CODES = {
  HEBDOMADAIRE: 'HEBDOMADAIRE',
  FIN_DE_BANDE: 'FIN_DE_BANDE',
  MENSUEL_NATIONAL: 'MENSUEL_NATIONAL',
} as const;

export const DEFAULT_REPORT_TEMPLATES: readonly DefaultReportTemplate[] = [
  {
    // One per province: for the provincial follow-up (farms to visit).
    code: REPORT_TEMPLATE_CODES.HEBDOMADAIRE,
    label: 'Rapport hebdomadaire de la province',
    periodicity: ReportPeriodicity.HEBDOMADAIRE,
    level: ReportLevel.PROVINCE,
    sections: [
      ReportSection.SYNTHESE,
      ReportSection.PRODUCTION,
      ReportSection.ALERTES,
      ReportSection.COMPLETUDE,
      ReportSection.FERMES_A_SUIVRE,
    ],
    audience: {
      scopeKinds: [AccessScopeKind.PROVINCES],
      profileCodes: [],
      farmOwners: false,
    },
  },
  {
    // The frozen bilan of each closed band, for its farm.
    code: REPORT_TEMPLATE_CODES.FIN_DE_BANDE,
    label: 'Rapport de fin de bande',
    periodicity: ReportPeriodicity.FIN_DE_BANDE,
    level: ReportLevel.BANDE,
    sections: [ReportSection.BILAN, ReportSection.COMPARAISON],
    audience: {
      scopeKinds: [AccessScopeKind.FARMS],
      profileCodes: [],
      farmOwners: true,
    },
  },
  {
    // Aggregates only, so the MAEDR can receive it.
    code: REPORT_TEMPLATE_CODES.MENSUEL_NATIONAL,
    label: 'Rapport mensuel national',
    periodicity: ReportPeriodicity.MENSUEL,
    level: ReportLevel.NATIONAL,
    sections: [
      ReportSection.SYNTHESE,
      ReportSection.PROVINCES,
      ReportSection.PRODUCTION,
      ReportSection.FERMES,
      ReportSection.ALERTES,
      ReportSection.COMPLETUDE,
      ReportSection.OBJECTIF,
    ],
    audience: {
      scopeKinds: [AccessScopeKind.ALL, AccessScopeKind.AGGREGATE],
      profileCodes: [],
      farmOwners: false,
    },
  },
];

/** Sections each level accepts. */
export const SECTIONS_BY_LEVEL: Readonly<
  Record<ReportLevel, readonly ReportSection[]>
> = {
  [ReportLevel.NATIONAL]: [
    ReportSection.SYNTHESE,
    ReportSection.PROVINCES,
    ReportSection.PRODUCTION,
    ReportSection.FERMES,
    ReportSection.ALERTES,
    ReportSection.COMPLETUDE,
    ReportSection.OBJECTIF,
    ReportSection.FERMES_A_SUIVRE,
  ],
  [ReportLevel.PROVINCE]: [
    ReportSection.SYNTHESE,
    ReportSection.PRODUCTION,
    ReportSection.FERMES,
    ReportSection.ALERTES,
    ReportSection.COMPLETUDE,
    ReportSection.FERMES_A_SUIVRE,
  ],
  [ReportLevel.BANDE]: [ReportSection.BILAN, ReportSection.COMPARAISON],
};

/** Periodicities each level accepts. */
export const PERIODICITIES_BY_LEVEL: Readonly<
  Record<ReportLevel, readonly ReportPeriodicity[]>
> = {
  [ReportLevel.NATIONAL]: [
    ReportPeriodicity.HEBDOMADAIRE,
    ReportPeriodicity.MENSUEL,
  ],
  [ReportLevel.PROVINCE]: [
    ReportPeriodicity.HEBDOMADAIRE,
    ReportPeriodicity.MENSUEL,
  ],
  [ReportLevel.BANDE]: [ReportPeriodicity.FIN_DE_BANDE],
};

export const SECTION_LABELS: Readonly<Record<ReportSection, string>> = {
  [ReportSection.SYNTHESE]: 'Synthèse',
  [ReportSection.PROVINCES]: 'Par province',
  [ReportSection.PRODUCTION]: 'Production et ventes',
  [ReportSection.FERMES]: 'Fermes par statut et cohorte',
  [ReportSection.ALERTES]: 'Alertes',
  [ReportSection.COMPLETUDE]: 'Complétude des saisies',
  [ReportSection.OBJECTIF]: 'Objectif national de 100 000 t',
  [ReportSection.FERMES_A_SUIVRE]: 'Fermes à suivre',
  [ReportSection.BILAN]: 'Bilan de la bande',
  [ReportSection.COMPARAISON]: 'Comparaison avec la moyenne du programme',
};

/** Whether a template's PDF names farms (never sent to an aggregate-only account). */
export function hasFarmRows(
  level: ReportLevel,
  sections: readonly ReportSection[],
): boolean {
  return (
    level === ReportLevel.BANDE ||
    sections.includes(ReportSection.FERMES_A_SUIVRE)
  );
}

export type TemplateCheck = { ok: true } | { ok: false; error: string };

/** Validates a template's level, periodicity, sections and audience. */
export function checkTemplate(t: {
  level: ReportLevel;
  periodicity: ReportPeriodicity;
  sections: readonly string[];
  audience: ReportAudience;
}): TemplateCheck {
  if (!PERIODICITIES_BY_LEVEL[t.level].includes(t.periodicity)) {
    return {
      ok: false,
      error: `Périodicité « ${t.periodicity} » impossible pour un rapport de niveau ${t.level}.`,
    };
  }
  if (t.sections.length === 0) {
    return { ok: false, error: 'Un rapport compte au moins une section.' };
  }
  const allowed = SECTIONS_BY_LEVEL[t.level] as readonly string[];
  const bad = t.sections.filter((s) => !allowed.includes(s));
  if (bad.length > 0) {
    return {
      ok: false,
      error: `Section(s) impossible(s) pour un rapport de niveau ${t.level} : ${bad.join(', ')}.`,
    };
  }
  const kinds = Object.values(AccessScopeKind) as string[];
  const badKinds = t.audience.scopeKinds.filter(
    (k) =>
      !kinds.includes(k) ||
      k === AccessScopeKind.AUDIT ||
      k === AccessScopeKind.OPERATOR,
  );
  if (badKinds.length > 0) {
    return {
      ok: false,
      error: `Périmètre(s) impossible(s) pour un destinataire : ${badKinds.join(', ')}.`,
    };
  }
  return { ok: true };
}
