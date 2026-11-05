/**
 * Pure rules of the farm registry: name normalization, duplicate scoring and
 * tolerant matching of provinces / list items. No I/O (unit-tested).
 */

/** Lowercase, no accents, punctuation and hyphens turned into spaces. */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Comparison key of a label: folded and without spaces (`Haut-Ogooué` = `haut ogooue` = `HAUTOGOOUE`). */
export function compactKey(value: string): string {
  return foldText(value).replace(/ /g, '');
}

/**
 * Words that say what kind of structure a farm is, not which one: two names
 * differing only by them are the same farm (« FERME AVICOLE NGOMA » =
 * « NGOMA »). Particles are dropped too.
 */
export const GENERIC_NAME_WORDS: ReadonlySet<string> = new Set([
  'ferme',
  'fermes',
  'cooperative',
  'cooperatives',
  'coop',
  'scoop',
  'scoops',
  'agricole',
  'agricoles',
  'agropastoral',
  'agropastorale',
  'agropastorales',
  'agropastoraux',
  'agro',
  'pastoral',
  'pastorale',
  'avicole',
  'avicoles',
  'elevage',
  'elevages',
  'exploitation',
  'exploitations',
  'societe',
  'ste',
  'ets',
  'etablissement',
  'etablissements',
  // Particles
  'de',
  'du',
  'des',
  'd',
  'la',
  'le',
  'les',
  'l',
  'et',
  'a',
  'au',
  'aux',
  'en',
]);

/**
 * Distinctive part of a farm name: folded, generic words removed. Falls back
 * to the folded name when nothing distinctive is left (« FERME AGRICOLE »).
 */
export function normalizeFarmName(name: string): string {
  const folded = foldText(name);
  const kept = folded.split(' ').filter((w) => w && !GENERIC_NAME_WORDS.has(w));
  return kept.length > 0 ? kept.join(' ') : folded;
}

/** AMI reference as stored: trimmed, inner spaces collapsed, uppercase; null when blank. */
export function normalizeAmiRef(
  value: string | null | undefined,
): string | null {
  const v = value?.trim().replace(/\s+/g, ' ').toUpperCase();
  return v ? v : null;
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = s.replace(/ /g, '');
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/**
 * Similarity of two NORMALIZED names in [0, 1]: Sørensen–Dice coefficient on
 * character bigrams (spaces ignored), so word order and spacing matter little
 * while one changed letter in a long name still scores high.
 */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a.replace(/ /g, '') === b.replace(/ /g, '')) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  let sizeA = 0;
  let sizeB = 0;
  for (const n of A.values()) sizeA += n;
  for (const n of B.values()) sizeB += n;
  if (sizeA === 0 || sizeB === 0) return 0;
  let common = 0;
  for (const [g, n] of A) common += Math.min(n, B.get(g) ?? 0);
  return (2 * common) / (sizeA + sizeB);
}

/** Names at least this similar, in the same province, are close names. */
export const NAME_SIMILARITY_THRESHOLD = 0.85;

/** Names at least this similar, in any province, resemble each other. */
export const NAME_RESEMBLANCE_THRESHOLD = 0.6;

/** A score at least this high is a probable duplicate. */
export const DUPLICATE_THRESHOLD = 0.85;

/** Two GPS fixes closer than this are the same site. */
export const NEAR_DISTANCE_M = 200;

/**
 * Weight of each corroborating signal. Alone, none reaches
 * `DUPLICATE_THRESHOLD`: an exploitant may own several farms (same phone,
 * same name), and neighbours may share a locality.
 */
export const DUPLICATE_WEIGHTS = {
  NOM_RESSEMBLANT: 0.4,
  POSITION_PROCHE: 0.5,
  MEME_TELEPHONE: 0.4,
  MEME_EXPLOITANT: 0.3,
  MEME_LOCALITE: 0.1,
} as const;

export interface RegistryFarmKey {
  /** Normalized name (`normalizeFarmName`). */
  readonly normalizedName: string;
  readonly provinceId: string | null;
  readonly localiteId?: string | null;
  /** Normalized phone, or null. */
  readonly phone?: string | null;
  /** Exploitant name as entered (folded for the comparison), or null. */
  readonly exploitantName?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
}

export type DuplicateReason =
  | 'MEME_NOM'
  | 'NOM_PROCHE'
  | 'NOM_RESSEMBLANT'
  | 'POSITION_PROCHE'
  | 'MEME_TELEPHONE'
  | 'MEME_EXPLOITANT'
  | 'MEME_LOCALITE';

export interface DuplicateScore {
  /** In [0, 1]; ≥ `DUPLICATE_THRESHOLD` = probable duplicate. */
  readonly score: number;
  readonly reasons: DuplicateReason[];
}

/** Great-circle distance in metres (haversine). */
export function distanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function hasPosition(
  k: RegistryFarmKey,
): k is RegistryFarmKey & { latitude: number; longitude: number } {
  return k.latitude != null && k.longitude != null;
}

/**
 * How likely `candidate` is the same farm as `existing`, from several
 * criteria of the sheet (CDC §5 « blocage des doublons »):
 * - the name: the same (score 1) or a close one (its similarity) in the same
 *   province is enough on its own; a name that only resembles (any
 *   province, for a farm entered in the wrong province) weighs 0.4;
 * - corroborating signals add up: GPS within 200 m (0.5), same exploitant
 *   phone (0.4), same exploitant name (0.3), same locality (0.1).
 * None of the signals alone is a duplicate: the phone or the exploitant
 * alone is the same person with another farm.
 */
export function duplicateScore(
  candidate: RegistryFarmKey,
  existing: RegistryFarmKey,
): DuplicateScore {
  const reasons: DuplicateReason[] = [];
  let score = 0;
  const sameProvince =
    !!candidate.provinceId && candidate.provinceId === existing.provinceId;
  const sim = nameSimilarity(candidate.normalizedName, existing.normalizedName);
  if (sameProvince && sim === 1) {
    reasons.push('MEME_NOM');
    score = 1;
  } else if (sameProvince && sim >= NAME_SIMILARITY_THRESHOLD) {
    reasons.push('NOM_PROCHE');
    score = sim;
  } else if (sim >= NAME_RESEMBLANCE_THRESHOLD) {
    reasons.push('NOM_RESSEMBLANT');
    score = DUPLICATE_WEIGHTS.NOM_RESSEMBLANT;
  }
  if (
    hasPosition(candidate) &&
    hasPosition(existing) &&
    distanceM(
      candidate.latitude,
      candidate.longitude,
      existing.latitude,
      existing.longitude,
    ) < NEAR_DISTANCE_M
  ) {
    reasons.push('POSITION_PROCHE');
    score += DUPLICATE_WEIGHTS.POSITION_PROCHE;
  }
  if (candidate.phone && existing.phone && candidate.phone === existing.phone) {
    reasons.push('MEME_TELEPHONE');
    score += DUPLICATE_WEIGHTS.MEME_TELEPHONE;
  }
  const exploitantA = candidate.exploitantName
    ? compactKey(candidate.exploitantName)
    : '';
  const exploitantB = existing.exploitantName
    ? compactKey(existing.exploitantName)
    : '';
  if (exploitantA && exploitantA === exploitantB) {
    reasons.push('MEME_EXPLOITANT');
    score += DUPLICATE_WEIGHTS.MEME_EXPLOITANT;
  }
  if (candidate.localiteId && candidate.localiteId === existing.localiteId) {
    reasons.push('MEME_LOCALITE');
    score += DUPLICATE_WEIGHTS.MEME_LOCALITE;
  }
  return { score: Math.min(1, Math.round(score * 100) / 100), reasons };
}

export function isProbableDuplicate(s: DuplicateScore): boolean {
  return s.score >= DUPLICATE_THRESHOLD;
}

/** French label of a duplicate reason. */
export const DUPLICATE_REASON_LABELS: Readonly<
  Record<DuplicateReason, string>
> = {
  MEME_NOM: 'même nom dans la même province',
  NOM_PROCHE: 'nom très proche dans la même province',
  NOM_RESSEMBLANT: 'nom ressemblant',
  POSITION_PROCHE: 'position GPS à moins de 200 m',
  MEME_TELEPHONE: 'même téléphone de l’exploitant',
  MEME_EXPLOITANT: 'même nom d’exploitant',
  MEME_LOCALITE: 'même localité',
};

export interface NamedCode {
  readonly code: string;
  readonly name: string;
}

/**
 * Item whose code or name matches `value`, tolerant to case, accents, spaces
 * and hyphens (`estuaire`, `G1`, `Haut Ogooue`, `HAUT-OGOOUÉ`). Null when none
 * or when several match.
 */
export function matchByCodeOrName<T extends NamedCode>(
  value: string,
  items: readonly T[],
): T | null {
  const key = compactKey(value);
  if (!key) return null;
  const byCode = items.filter((i) => compactKey(i.code) === key);
  if (byCode.length === 1) return byCode[0];
  const byName = items.filter((i) => compactKey(i.name) === key);
  return byName.length === 1 ? byName[0] : null;
}

/**
 * List item (cohort, status…) matching `value` by code or label, or by a bare
 * number matching the code's trailing number (`1` → `COHORTE_1`).
 */
export function matchListItem<T extends { code: string; label: string }>(
  value: string,
  items: readonly T[],
): T | null {
  const found = matchByCodeOrName(
    value,
    items.map((i) => ({ ...i, name: i.label })),
  );
  if (found) return items.find((i) => i.code === found.code) ?? null;
  const n = value.trim();
  if (/^\d+$/.test(n)) {
    const byNumber = items.filter((i) =>
      new RegExp(`(^|[^0-9])0*${Number(n)}$`).test(i.code),
    );
    if (byNumber.length === 1) return byNumber[0];
  }
  return null;
}
