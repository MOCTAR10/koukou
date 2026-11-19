import type {
  ChecklistLine,
  DocumentExtras,
  DocumentFormat,
  DocumentProvider,
  DocumentSource,
  FarmerChecklistLine,
  FarmFinancingView,
  FinancingDocument,
  FinancingRequirement,
  FinancingStep,
  RequirementConfig,
} from '../../api/types-financing';
import { FINANCING_STEPS } from '../../api/types-financing';
import { dateFr, plural } from '../../lib/format';

// The third-pass fields are added to the objects the API already sends; they are optional until the server fills them.
export type RequirementX = FinancingRequirement & Partial<RequirementConfig>;
export type DocumentX = FinancingDocument & Partial<DocumentExtras>;

// ── Provider, formats, validity ────────────────────────────────────────────

export const PROVIDER_LABELS: Record<DocumentProvider, string> = { EXPLOITANT: 'Exploitant', BCEG: 'BCEG' };
export const SOURCE_LABELS: Record<DocumentSource, string> = { EXPLOITANT: 'Exploitant', BCEG: 'BCEG', AGENT: 'Agent pour l’exploitant', FERMIA: 'Fermia' };
export const FORMAT_LABELS: Record<DocumentFormat, string> = { PDF: 'PDF', IMAGE: 'Photo' };
export const ALL_FORMATS: readonly DocumentFormat[] = ['PDF', 'IMAGE'];

export const providerOf = (r: RequirementX): DocumentProvider => r.providedBy ?? 'EXPLOITANT';

/** « PDF ou photo », « PDF », « Photo »: empty = both. */
export function formatsText(formats: readonly DocumentFormat[] | undefined): string {
  const list = formats ?? [];
  if (list.length === 0 || list.length === ALL_FORMATS.length) return 'PDF ou photo';
  return list.map((f) => FORMAT_LABELS[f]).join(' ou ');
}

/** `accept` attribute of a file input for the allowed formats. */
export function acceptAttr(formats: readonly DocumentFormat[] | undefined): string {
  const list = formats ?? [];
  const pdf = '.pdf,application/pdf';
  const img = 'image/png,image/jpeg,image/webp';
  if (list.length === 0 || list.length === ALL_FORMATS.length) return `${pdf},${img}`;
  return list[0] === 'PDF' ? pdf : img;
}

/** The camera hint only when photos are the only format: with PDF allowed the phone offers camera and files. */
export function captureHint(formats: readonly DocumentFormat[] | undefined): 'environment' | undefined {
  return formats && formats.length === 1 && formats[0] === 'IMAGE' ? 'environment' : undefined;
}

export const validityText = (months: number | null | undefined): string => (months == null ? 'Sans limite' : `${months.toLocaleString('fr-FR')} mois`);

/** `YYYY-MM-DD` + n months, the day clamped to the end of a shorter month. */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Months field of the form: '' = no limit, else a whole number 1..120; undefined = invalid. */
export function parseValidity(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === '') return null;
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return n >= 1 && n <= 120 ? n : undefined;
}

// ── Framework (configuration rows) ─────────────────────────────────────────

export type ProviderFilter = 'ALL' | DocumentProvider;

export function filterRequirements<T extends RequirementX>(items: readonly T[], filter: ProviderFilter): T[] {
  return filter === 'ALL' ? [...items] : items.filter((r) => providerOf(r) === filter);
}

/** Active items the farmer is asked for. */
export const farmerAskCount = (items: readonly RequirementX[]): number => items.filter((r) => r.active && providerOf(r) === 'EXPLOITANT').length;

export const farmerAskText = (n: number): string => `${plural(n, 'pièce demandée', 'pièces demandées')} à l’exploitant`;

export function stepAskCounts(items: readonly RequirementX[]): Record<FinancingStep, number> {
  const out = {} as Record<FinancingStep, number>;
  for (const s of FINANCING_STEPS) out[s] = farmerAskCount(items.filter((r) => r.step === s));
  return out;
}

/** One line summarising the configuration of a requirement, for the row. */
export function configSummary(r: RequirementX): string {
  return [`Fournie par ${PROVIDER_LABELS[providerOf(r)]}`, formatsText(r.formats), r.validityMonths != null ? `valable ${validityText(r.validityMonths)}` : 'sans limite de validité'].join(' · ');
}

// ── Checklist of a file (BCEG side) ────────────────────────────────────────


/** A line with no document and « validated »: the server satisfied it (the consent is active), nothing to upload. */
export const satisfiedWithoutDocument = (line: Pick<ChecklistLine, 'state' | 'documents'>): boolean => line.state === 'VALIDEE' && line.documents.length === 0;

export const SATISFIED_BY_CONSENT = 'Satisfaite par le consentement actif';

/** « Valable jusqu’au 12/03/2027 » / « Expiré le … » under a document, or null when it never expires. */
export function expiryText(d: Pick<DocumentExtras, 'expiresOn' | 'expired'>): string | null {
  if (!d.expiresOn) return null;
  return d.expired ? `Expiré le ${dateFr(d.expiresOn)}` : `Valable jusqu’au ${dateFr(d.expiresOn)}`;
}

// ── Farmer side ────────────────────────────────────────────────────────────

export type FarmerFile = FarmFinancingView['files'][number] & { checklist?: FarmerChecklistLine[]; toFile?: number };

const STEP_ORDER = new Map(FINANCING_STEPS.map((s, i) => [s, i] as const));

/** Refused first, then missing required, missing optional, expired, filed, validated. */
export function farmerRank(l: Pick<FarmerChecklistLine, 'state' | 'required'>): number {
  switch (l.state) {
    case 'REJETEE':
      return 0;
    case 'MANQUANTE':
      return l.required ? 1 : 2;
    case 'EXPIREE':
      return 3;
    case 'DEPOSEE':
      return 4;
    case 'VALIDEE':
      return 5;
  }
}

export function sortFarmerChecklist(lines: readonly FarmerChecklistLine[]): FarmerChecklistLine[] {
  return [...lines].sort(
    (a, b) => farmerRank(a) - farmerRank(b) || (STEP_ORDER.get(a.step) ?? 0) - (STEP_ORDER.get(b.step) ?? 0) || a.label.localeCompare(b.label, 'fr'),
  );
}

/** The state in words a farmer who reads little understands. */
export function farmerStateText(l: Pick<FarmerChecklistLine, 'state' | 'rejectReason' | 'expiresOn'>): string {
  switch (l.state) {
    case 'MANQUANTE':
      return 'À fournir';
    case 'DEPOSEE':
      return 'Envoyée, en attente de validation';
    case 'VALIDEE':
      return 'Validée';
    case 'REJETEE':
      return l.rejectReason ? `Refusée : ${l.rejectReason} — envoyez-la de nouveau` : 'Refusée — envoyez-la de nouveau';
    case 'EXPIREE':
      return l.expiresOn ? `Expirée le ${dateFr(l.expiresOn)}` : 'Expirée';
  }
}

export type FarmerTone = 'todo' | 'wait' | 'ok' | 'bad';
export const farmerTone = (state: FarmerChecklistLine['state']): FarmerTone => (state === 'VALIDEE' ? 'ok' : state === 'DEPOSEE' ? 'wait' : state === 'MANQUANTE' ? 'todo' : 'bad');

/** « 3 pièces sur 7 fournies » (filed or validated: the item is covered). */
export function farmerProgress(lines: readonly Pick<FarmerChecklistLine, 'state'>[]): { done: number; total: number; text: string } {
  const total = lines.length;
  const done = lines.filter((l) => l.state === 'DEPOSEE' || l.state === 'VALIDEE').length;
  const f = (n: number) => n.toLocaleString('fr-FR');
  return { done, total, text: `${f(done)} ${done < 2 ? 'pièce' : 'pièces'} sur ${f(total)} ${done < 2 ? 'fournie' : 'fournies'}` };
}

export function farmerRemainingText(toFile: number, total: number, done: number): string {
  if (toFile > 0) return toFile === 1 ? 'Il reste 1 pièce obligatoire à envoyer.' : `Il reste ${toFile.toLocaleString('fr-FR')} pièces obligatoires à envoyer.`;
  if (total > 0 && done === total) return 'Tout est envoyé. Merci.';
  return 'Aucune pièce obligatoire ne manque.';
}

/** Items still to file across the farm's files (menu badge). */
export const toFileTotal = (files: ReadonlyArray<{ toFile?: number }>): number => files.reduce((n, f) => n + (f.toFile ?? 0), 0);

// ── Portfolio ──────────────────────────────────────────────────────────────

/** Expected pieces split by who the ball is with: the farmer (not filed yet) or the BCEG (filed, to validate). */
export function documentsSplit(d: { expected: number; provided: number; validated: number }): { waitingFarmer: number; toValidate: number; validated: number } {
  return { waitingFarmer: Math.max(0, d.expected - d.provided), toValidate: Math.max(0, d.provided - d.validated), validated: d.validated };
}
