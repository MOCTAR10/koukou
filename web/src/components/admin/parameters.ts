import type { ParameterType, ParameterVersion, ParameterView } from '../../api/types-admin';

/**
 * Programme parameters screen, pure rules: catalog themes, typed value
 * parsing (same checks as the server's `checkParameterValue`), the effective
 * date rule (now or later, never in the past), version classification (same
 * resolution as `parameter-resolution.ts`) and the formula editor's helpers.
 * The server stays the authority: it re-checks everything, and compiles the
 * whole formula set.
 */

// ----- Themes -----------------------------------------------------------------

export type ParameterTheme =
  | 'BANDE'
  | 'PESEE'
  | 'SANITAIRE'
  | 'INTRANTS'
  | 'TRACABILITE'
  | 'PILOTAGE'
  | 'NOTIFICATIONS'
  | 'SYNCHRONISATION'
  | 'FORMULES'
  | 'AUTRES';

export const THEME_LABELS: Readonly<Record<ParameterTheme, string>> = {
  BANDE: 'Bandes',
  PESEE: 'Pesées',
  SANITAIRE: 'Seuils sanitaires',
  INTRANTS: 'Intrants',
  TRACABILITE: 'Traçabilité',
  PILOTAGE: 'Pilotage du programme',
  NOTIFICATIONS: 'Notifications',
  SYNCHRONISATION: 'Hors ligne et synchronisation',
  FORMULES: 'Formules des indicateurs',
  AUTRES: 'Autres paramètres',
};

export const THEME_ORDER: readonly ParameterTheme[] = [
  'BANDE',
  'PESEE',
  'SANITAIRE',
  'INTRANTS',
  'TRACABILITE',
  'PILOTAGE',
  'NOTIFICATIONS',
  'SYNCHRONISATION',
  'FORMULES',
  'AUTRES',
];

/** Key prefixes of each theme (the catalog has no theme field: the key names it). */
const THEME_PREFIXES: ReadonlyArray<readonly [string, ParameterTheme]> = [
  ['FORMULE_', 'FORMULES'],
  ['BANDE_', 'BANDE'],
  ['PESEE_', 'PESEE'],
  ['SEUIL_ALERTE_', 'SANITAIRE'],
  ['SEUIL_ECART_INTRANTS', 'INTRANTS'],
  ['SEUIL_ECART_RECEPTION_ABATTOIR', 'TRACABILITE'],
  ['SEUIL_TRACABILITE', 'TRACABILITE'],
  ['PILOTAGE_', 'PILOTAGE'],
  ['CARTE_', 'PILOTAGE'],
  ['OBJECTIF_', 'PILOTAGE'],
  ['PROJECTION_', 'PILOTAGE'],
  ['NOTIF_', 'NOTIFICATIONS'],
  ['SYNC_', 'SYNCHRONISATION'],
];

export function themeOf(param: Pick<ParameterView, 'key' | 'type'>): ParameterTheme {
  if (param.type === 'formula') return 'FORMULES';
  return THEME_PREFIXES.find(([prefix]) => param.key.startsWith(prefix))?.[1] ?? 'AUTRES';
}

/** The catalog grouped by theme, in `THEME_ORDER`, catalog order kept inside each group. */
export function groupByTheme<T extends Pick<ParameterView, 'key' | 'type'>>(params: readonly T[]): Array<{ theme: ParameterTheme; items: T[] }> {
  const groups = new Map<ParameterTheme, T[]>();
  for (const p of params) {
    const theme = themeOf(p);
    const list = groups.get(theme);
    if (list) list.push(p);
    else groups.set(theme, [p]);
  }
  return THEME_ORDER.filter((t) => groups.has(t)).map((theme) => ({ theme, items: groups.get(theme)! }));
}

/** Free-text filter on key, label and unit (accents and case ignored). */
export function matchesSearch(param: Pick<ParameterView, 'key' | 'label' | 'unit'>, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  return [param.key, param.label, param.unit ?? ''].some((s) => fold(s).includes(q));
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// ----- Labels -----------------------------------------------------------------

export const TYPE_LABELS: Readonly<Record<ParameterType, string>> = {
  number: 'Nombre',
  integer: 'Nombre entier',
  string: 'Texte',
  formula: 'Formule',
  json: 'JSON',
};

/** Owner profiles (codes of the system profiles, `default-profiles.ts`). Unknown codes show as is. */
export const OWNER_LABELS: Readonly<Record<string, string>> = {
  DGE: 'POUFA / DGE',
  VETERINAIRE: 'Services vétérinaires',
  ADMIN: 'Administrateur du programme',
};

export function ownerLabel(code: string): string {
  return OWNER_LABELS[code] ?? code;
}

/** « min 0 · max 100 % », or null without bounds. */
export function rangeLabel(param: Pick<ParameterView, 'min' | 'max' | 'unit'>): string | null {
  const parts: string[] = [];
  if (param.min !== null) parts.push(`min ${frNumber(param.min)}`);
  if (param.max !== null) parts.push(`max ${frNumber(param.max)}`);
  if (!parts.length) return null;
  return `${parts.join(' · ')}${param.unit ? ` ${param.unit}` : ''}`;
}

function frNumber(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 6 });
}

/** A value as displayed (numbers in French, JSON compact, text as is). */
export function formatParameterValue(type: ParameterType, value: unknown, unit?: string | null): string {
  if (value === null || value === undefined) return '—';
  if ((type === 'number' || type === 'integer') && typeof value === 'number') {
    return `${frNumber(value)}${unit ? ` ${unit}` : ''}`;
  }
  if (type === 'json' || typeof value === 'object') return readableJson(value);
  return String(value);
}

/** « FIN_DE_BANDE » / « ref_bande » -> « Fin de bande » / « Ref bande ». */
export function humanizeKey(key: string): string {
  const t = key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : key;
}

function readableScalar(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return frNumber(v);
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (typeof v === 'string') return /^[A-Z0-9_]{3,}$/.test(v) ? humanizeKey(v) : v;
  return readableJson(v);
}

/** A JSON value as a sentence-like text (no braces, quotes or raw keys). */
export function readableJson(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.map((v) => (v && typeof v === 'object' ? `(${readableJson(v)})` : readableScalar(v))).join(' ; ');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${humanizeKey(k)} : ${v && typeof v === 'object' ? readableJson(v) : readableScalar(v)}`)
      .join(', ');
  }
  return readableScalar(value);
}

/** Versions older than 2001 are the seeded defaults (sentinel date), not a real start. */
export function isDefaultSince(validFrom: string | null | undefined): boolean {
  if (!validFrom) return false;
  const t = Date.parse(validFrom);
  return !Number.isNaN(t) && t < Date.UTC(2001, 0, 1);
}

/** The value as the form's text field starts (decimal comma for numbers). */
export function valueToInput(type: ParameterType, value: unknown): string {
  if (value === null || value === undefined) return '';
  if ((type === 'number' || type === 'integer') && typeof value === 'number') return String(value).replace('.', ',');
  if (type === 'json') return JSON.stringify(value, null, 2);
  return String(value);
}

// ----- Value parsing ----------------------------------------------------------

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Same limit as the formula engine (`FORMULA_MAX_LENGTH`). */
export const FORMULA_MAX_LENGTH = 500;

/**
 * Typed value of the form's text, checked like the server: a finite number
 * (decimal comma or dot, spaces as thousands separators), an integer when
 * the type says so, within min/max; a non-empty text or formula; valid JSON.
 */
export function parseParameterInput(def: Pick<ParameterView, 'type' | 'label' | 'unit' | 'min' | 'max'>, raw: string): Parsed<unknown> {
  const fail = (error: string): Parsed<unknown> => ({ ok: false, error });
  const text = raw.trim();
  switch (def.type) {
    case 'number':
    case 'integer': {
      const normalized = text.replace(/[\s  ]/g, '').replace(',', '.');
      if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(normalized)) return fail(`« ${def.label} » doit être un nombre.`);
      const n = Number(normalized);
      if (!Number.isFinite(n)) return fail(`« ${def.label} » doit être un nombre.`);
      if (def.type === 'integer' && !Number.isInteger(n)) return fail(`« ${def.label} » doit être un nombre entier.`);
      const unit = def.unit ? ` ${def.unit}` : '';
      if (def.min !== null && n < def.min) return fail(`« ${def.label} » doit être au moins ${frNumber(def.min)}${unit}.`);
      if (def.max !== null && n > def.max) return fail(`« ${def.label} » doit être au plus ${frNumber(def.max)}${unit}.`);
      return { ok: true, value: n };
    }
    case 'string':
      return text ? { ok: true, value: text } : fail(`« ${def.label} » doit être un texte non vide.`);
    case 'formula':
      if (!text) return fail('La formule est vide.');
      if (text.length > FORMULA_MAX_LENGTH) return fail(`La formule ne doit pas dépasser ${FORMULA_MAX_LENGTH} caractères.`);
      return { ok: true, value: text };
    case 'json':
      if (!text) return fail(`« ${def.label} » : valeur manquante.`);
      try {
        return { ok: true, value: JSON.parse(text) as unknown };
      } catch {
        return fail(`« ${def.label} » : JSON invalide.`);
      }
  }
}

/** Same value as the one in force (a new version would change nothing). */
export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ----- Effective date ---------------------------------------------------------

export type ValidFromMode = 'now' | 'later';

/**
 * `validFrom` to send: none for « maintenant » (the server stamps it), else
 * the local date-time typed (`YYYY-MM-DDTHH:mm`) as ISO, which must be in the
 * future: a value never applies to the past.
 */
export function validFromOf(mode: ValidFromMode, local: string, now: Date): Parsed<string | undefined> {
  if (mode === 'now') return { ok: true, value: undefined };
  if (!local.trim()) return { ok: false, error: "Indiquez la date d'effet." };
  const at = new Date(local);
  if (Number.isNaN(at.getTime())) return { ok: false, error: "Date d'effet invalide." };
  if (at.getTime() <= now.getTime()) return { ok: false, error: "La date d'effet ne peut pas être dans le passé : choisissez « maintenant » ou une date à venir." };
  return { ok: true, value: at.toISOString() };
}

/** `datetime-local` value of a date (local time, minutes), for the input's `min`. */
export function localDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function checkReason(reason: string): string | null {
  const r = reason.trim();
  if (!r) return 'Le motif du changement est obligatoire.';
  if (r.length > 500) return 'Le motif ne doit pas dépasser 500 caractères.';
  return null;
}

// ----- Versions ---------------------------------------------------------------

/** Start of the seed's reason (`parameter-catalog.ts` `SEED_REASON`): the « Proposé » value of the spec. */
export const SEED_REASON_PREFIX = 'Valeur proposée par le cahier des charges';

/** The version is the catalog's « Proposé » default, seeded by the server. */
export function isProposedVersion(v: { createdById: string | null; reason: string | null }): boolean {
  return v.createdById === null && !!v.reason?.startsWith(SEED_REASON_PREFIX);
}

export type VersionState = 'FUTURE' | 'IN_FORCE' | 'PAST';

/**
 * Each version's state at `now`: in force = latest `validFrom` ≤ now, ties by
 * latest `createdAt` (`parameter-resolution.ts`); later ones are scheduled.
 */
export function classifyVersions(versions: readonly ParameterVersion[], now: Date): Array<ParameterVersion & { state: VersionState }> {
  const t = now.getTime();
  let inForce: ParameterVersion | null = null;
  for (const v of versions) {
    const from = Date.parse(v.validFrom);
    if (from > t) continue;
    if (
      !inForce ||
      from > Date.parse(inForce.validFrom) ||
      (from === Date.parse(inForce.validFrom) && Date.parse(v.createdAt) > Date.parse(inForce.createdAt))
    ) {
      inForce = v;
    }
  }
  return [...versions]
    .sort((a, b) => Date.parse(b.validFrom) - Date.parse(a.validFrom) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((v) => ({ ...v, state: v === inForce ? 'IN_FORCE' : Date.parse(v.validFrom) > t ? 'FUTURE' : 'PAST' }));
}

export const VERSION_STATE_LABELS: Readonly<Record<VersionState, string>> = {
  FUTURE: 'Programmée',
  IN_FORCE: 'En vigueur',
  PAST: 'Remplacée',
};

// ----- Formulas ---------------------------------------------------------------

/** Prefix of the formula parameters (`FORMULE_TAUX_MORTALITE` ↔ indicator `taux_mortalite`). */
export const FORMULA_PREFIX = 'FORMULE_';

export function indicatorKeyOf(parameterKey: string): string | null {
  return parameterKey.startsWith(FORMULA_PREFIX) ? parameterKey.slice(FORMULA_PREFIX.length).toLowerCase() : null;
}

export interface FormulaName {
  name: string;
  label: string;
  unit: string;
}

/**
 * Raw values of a band a formula may read, mirrored from the backend
 * `indicators/formula/formula-catalog.ts` `POUFA_BASE_VARIABLES` (display
 * only: the server compiles with its own list and answers the exact error).
 */
export const FORMULA_BASE_VARIABLES: readonly FormulaName[] = [
  { name: 'mis_en_place', label: 'Sujets mis en place', unit: 'têtes' },
  { name: 'morts_cumules', label: 'Mortalité cumulée', unit: 'têtes' },
  { name: 'morts_jour', label: 'Morts du jour', unit: 'têtes' },
  { name: 'presents', label: 'Effectif présent', unit: 'têtes' },
  { name: 'presents_veille', label: 'Effectif présent la veille', unit: 'têtes' },
  { name: 'sortis_tetes', label: 'Sujets sortis (vendus ou abattus)', unit: 'têtes' },
  { name: 'poids_sortis_kg', label: 'Poids vif des sujets sortis', unit: 'kg' },
  { name: 'poids_presents_kg', label: 'Poids vif des sujets présents', unit: 'kg' },
  { name: 'poids_poussins_kg', label: 'Poids des poussins à la mise en place', unit: 'kg' },
  { name: 'poids_moyen_g', label: 'Poids moyen actuel', unit: 'g' },
  { name: 'poids_initial_g', label: 'Poids moyen à la mise en place', unit: 'g' },
  { name: 'jours_elevage', label: "Durée d'élevage", unit: 'jours' },
  { name: 'aliment_kg', label: 'Aliment consommé', unit: 'kg' },
  { name: 'charges_fcfa', label: 'Charges totales', unit: 'FCFA' },
  { name: 'ca_fcfa', label: "Chiffre d'affaires", unit: 'FCFA' },
  { name: 'capacite_places', label: 'Capacité du bâtiment', unit: 'places' },
];

/** Functions of the engine (`formula.ts`), arguments separated by `;`. */
export const FORMULA_FUNCTIONS: ReadonlyArray<{ name: string; syntax: string; help: string }> = [
  { name: 'min', syntax: 'min(a; b; …)', help: 'la plus petite valeur' },
  { name: 'max', syntax: 'max(a; b; …)', help: 'la plus grande valeur' },
  { name: 'abs', syntax: 'abs(x)', help: 'valeur absolue' },
  { name: 'arrondi', syntax: 'arrondi(x; n)', help: 'x arrondi à n décimales' },
  { name: 'si', syntax: 'si(condition; alors; sinon)', help: 'comparaisons < <= > >= = <> dans la condition seulement' },
];

/**
 * Names a formula may use: the base variables plus the other indicators (an
 * indicator may read another by key, as long as the set has no cycle — the
 * server checks it).
 */
export function formulaNames(params: readonly Pick<ParameterView, 'key' | 'label' | 'unit' | 'type'>[], selfKey: string): { variables: readonly FormulaName[]; indicators: FormulaName[] } {
  const indicators = params
    .filter((p) => p.type === 'formula' && p.key !== selfKey)
    .map((p) => ({ name: indicatorKeyOf(p.key) ?? p.key.toLowerCase(), label: p.label.replace(/^Formule : /, ''), unit: p.unit ?? '' }));
  return { variables: FORMULA_BASE_VARIABLES, indicators };
}

/**
 * Identifiers of an expression the editor doesn't know (neither a variable,
 * an indicator, nor a function): a hint while typing, the server decides.
 */
export function unknownNames(expression: string, known: readonly string[]): string[] {
  const allowed = new Set(known);
  const functions = new Set(FORMULA_FUNCTIONS.map((f) => f.name));
  const out: string[] = [];
  const re = /[A-Za-z_][A-Za-z0-9_]*/g;
  for (let m = re.exec(expression); m; m = re.exec(expression)) {
    const name = m[0];
    const rest = expression.slice(m.index + name.length);
    if (/^\s*\(/.test(rest) && functions.has(name.toLowerCase())) continue;
    // Part of a number like 1e3 is no identifier the engine accepts anyway: let the server say so.
    if (m.index > 0 && /[0-9.,]/.test(expression[m.index - 1] ?? '')) continue;
    if (!allowed.has(name) && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Inserts `token` at the selection, with spaces around it when needed; returns the text and the caret. */
export function insertToken(text: string, start: number, end: number, token: string): { text: string; caret: number } {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const left = before && !/[\s(;]$/.test(before) ? ' ' : '';
  const right = after && !/^[\s);]/.test(after) ? ' ' : '';
  const inserted = `${left}${token}${right}`;
  return { text: `${before}${inserted}${after}`, caret: before.length + left.length + token.length };
}
