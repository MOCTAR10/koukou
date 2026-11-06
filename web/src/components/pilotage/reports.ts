/**
 * Report templates and runs (CDC « Rapports périodiques »): labels, what
 * each level accepts (mirror of `default-report-templates.ts`
 * `SECTIONS_BY_LEVEL` / `PERIODICITIES_BY_LEVEL` / `checkTemplate`), the
 * template form ↔ PATCH body and the manual run payload. Pure, unit-tested.
 * The server stays the authority (400 with its French reason).
 */
import type { ScopeKind } from '../../api/types-access';
import type {
  GenerateReportBody,
  ReportLevel,
  ReportPeriodicity,
  ReportRun,
  ReportSection,
  ReportTemplate,
  UpdateReportTemplateBody,
} from '../../api/types-pilotage';

export const PERIODICITY_LABELS: Record<ReportPeriodicity, string> = {
  HEBDOMADAIRE: 'Hebdomadaire',
  MENSUEL: 'Mensuel',
  FIN_DE_BANDE: 'À la clôture de chaque bande',
};

export const LEVEL_LABELS: Record<ReportLevel, string> = {
  NATIONAL: 'National',
  PROVINCE: 'Province',
  BANDE: 'Bande',
};

export const SECTION_LABELS: Record<ReportSection, string> = {
  SYNTHESE: 'Synthèse',
  PROVINCES: 'Par province',
  PRODUCTION: 'Production et ventes',
  FERMES: 'Fermes par statut et cohorte',
  ALERTES: 'Alertes',
  COMPLETUDE: 'Complétude des saisies',
  OBJECTIF: 'Objectif national de 100 000 t',
  FERMES_A_SUIVRE: 'Fermes à suivre',
  BILAN: 'Bilan de la bande',
  COMPARAISON: 'Comparaison avec la moyenne du programme',
};

export const SECTIONS_BY_LEVEL: Record<ReportLevel, readonly ReportSection[]> = {
  NATIONAL: ['SYNTHESE', 'PROVINCES', 'PRODUCTION', 'FERMES', 'ALERTES', 'COMPLETUDE', 'OBJECTIF', 'FERMES_A_SUIVRE'],
  PROVINCE: ['SYNTHESE', 'PRODUCTION', 'FERMES', 'ALERTES', 'COMPLETUDE', 'FERMES_A_SUIVRE'],
  BANDE: ['BILAN', 'COMPARAISON'],
};

export const PERIODICITIES_BY_LEVEL: Record<ReportLevel, readonly ReportPeriodicity[]> = {
  NATIONAL: ['HEBDOMADAIRE', 'MENSUEL'],
  PROVINCE: ['HEBDOMADAIRE', 'MENSUEL'],
  BANDE: ['FIN_DE_BANDE'],
};

/** Scope kinds a recipient may have (`checkTemplate` refuses AUDIT and OPERATOR). */
export const AUDIENCE_SCOPE_KINDS: readonly ScopeKind[] = ['ALL', 'PROVINCES', 'FARMS', 'FINANCED', 'AGGREGATE'];

/** Same rule as the server's `hasFarmRows`: the PDF names farms. */
export function namesFarms(level: ReportLevel, sections: readonly ReportSection[]): boolean {
  return level === 'BANDE' || sections.includes('FERMES_A_SUIVRE');
}

export interface TemplateForm {
  label: string;
  periodicity: ReportPeriodicity;
  sections: ReportSection[];
  scopeKinds: ScopeKind[];
  /** Profile codes, comma or space separated ('' = every profile). */
  profileCodes: string;
  farmOwners: boolean;
  active: boolean;
}

export function templateForm(t: ReportTemplate): TemplateForm {
  return {
    label: t.label,
    periodicity: t.periodicity,
    sections: t.sections.map((s) => s.code),
    scopeKinds: [...t.audience.scopeKinds],
    profileCodes: t.audience.profileCodes.join(', '),
    farmOwners: t.audience.farmOwners,
    active: t.active,
  };
}

export function parseProfileCodes(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const code = part.trim().toUpperCase();
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/** French reason the form can't be sent (same checks as `checkTemplate`), or null. */
export function templateFormError(level: ReportLevel, form: TemplateForm): string | null {
  if (!form.label.trim()) return 'Le libellé est obligatoire.';
  if (!PERIODICITIES_BY_LEVEL[level].includes(form.periodicity)) {
    return `Périodicité impossible pour un rapport de niveau ${LEVEL_LABELS[level].toLowerCase()}.`;
  }
  if (form.sections.length === 0) return 'Un rapport compte au moins une section.';
  const allowed = SECTIONS_BY_LEVEL[level];
  const bad = form.sections.filter((s) => !allowed.includes(s));
  if (bad.length > 0) return `Section(s) impossible(s) à ce niveau : ${bad.map((s) => SECTION_LABELS[s]).join(', ')}.`;
  return null;
}

/** The PATCH body: only what changed (sections in the level's order). */
export function templatePatch(t: ReportTemplate, form: TemplateForm): UpdateReportTemplateBody {
  const body: UpdateReportTemplateBody = {};
  const label = form.label.trim();
  if (label && label !== t.label) body.label = label;
  if (form.periodicity !== t.periodicity) body.periodicity = form.periodicity;
  const order = SECTIONS_BY_LEVEL[t.level];
  const sections = order.filter((s) => form.sections.includes(s));
  const before = t.sections.map((s) => s.code);
  if (sections.length !== before.length || sections.some((s) => !before.includes(s))) body.sections = sections;
  const audience: NonNullable<UpdateReportTemplateBody['audience']> = {};
  const kinds = AUDIENCE_SCOPE_KINDS.filter((k) => form.scopeKinds.includes(k));
  if (kinds.length !== t.audience.scopeKinds.length || kinds.some((k) => !t.audience.scopeKinds.includes(k))) {
    audience.scopeKinds = kinds;
  }
  const codes = parseProfileCodes(form.profileCodes);
  if (codes.join(',') !== t.audience.profileCodes.join(',')) audience.profileCodes = codes;
  if (form.farmOwners !== t.audience.farmOwners) audience.farmOwners = form.farmOwners;
  if (Object.keys(audience).length > 0) body.audience = audience;
  if (form.active !== t.active) body.active = form.active;
  return body;
}

export interface GenerateForm {
  /** A day of the period ('' = the last closed one). */
  periodStart: string;
  provinceCode: string;
}

/** French reason a manual run can't be asked for, or null (the server checks the period is closed). */
export function generateFormError(level: ReportLevel, form: GenerateForm): string | null {
  if (level === 'BANDE') return 'Un rapport de fin de bande se produit depuis la fiche de la bande clôturée.';
  if (level === 'PROVINCE' && !form.provinceCode.trim()) return 'Choisissez la province du rapport.';
  if (form.periodStart && !/^\d{4}-\d{2}-\d{2}$/.test(form.periodStart)) return 'Date invalide (attendu AAAA-MM-JJ).';
  return null;
}

export function generateBody(level: ReportLevel, form: GenerateForm): GenerateReportBody {
  const body: GenerateReportBody = {};
  if (form.periodStart) body.periodStart = form.periodStart;
  if (level === 'PROVINCE') body.provinceCode = form.provinceCode.trim().toUpperCase();
  return body;
}

/** Code of the end-of-band template (seeded, codes never change). */
export const END_OF_BAND_TEMPLATE = 'FIN_DE_BANDE';

export function audienceSummary(a: ReportTemplate['audience'], scopeLabels: Record<string, string>): string {
  const parts: string[] = [];
  if (a.scopeKinds.length > 0) parts.push(a.scopeKinds.map((k) => scopeLabels[k] ?? k).join(', '));
  if (a.profileCodes.length > 0) parts.push(`profils ${a.profileCodes.join(', ')}`);
  if (a.farmOwners) parts.push('exploitant de la ferme');
  return parts.length > 0 ? parts.join(' · ') : 'Aucun destinataire prévenu';
}

export function runPeriodLabel(run: Pick<ReportRun, 'periodStart' | 'periodEnd' | 'level'>, fmt: (d: string) => string): string {
  if (run.periodStart === run.periodEnd) return fmt(run.periodStart);
  return `${fmt(run.periodStart)} → ${fmt(run.periodEnd)}`;
}

export function recipientsSummary(run: Pick<ReportRun, 'recipients'>): string {
  const owners = run.recipients.filter((r) => r.kind === 'OWNER').length;
  const members = run.recipients.length - owners;
  const parts: string[] = [];
  if (members > 0) parts.push(`${members} compte${members > 1 ? 's' : ''} institutionnel${members > 1 ? 's' : ''}`);
  if (owners > 0) parts.push(`${owners} exploitant${owners > 1 ? 's' : ''}`);
  return parts.length > 0 ? parts.join(' · ') : 'Aucun destinataire';
}

export function runFilename(run: Pick<ReportRun, 'templateCode' | 'periodStart'>): string {
  return `rapport-${run.templateCode.toLowerCase()}-${run.periodStart}.pdf`;
}

/** `GET /pilotage/reports/runs` query (template, level, period). */
export function runsQueryString(q: { template?: string; level?: string; from?: string; to?: string }): string {
  const p = new URLSearchParams();
  if (q.template) p.set('template', q.template);
  if (q.level) p.set('level', q.level);
  if (q.from) p.set('from', q.from);
  if (q.to) p.set('to', q.to);
  const s = p.toString();
  return s ? `?${s}` : '';
}
