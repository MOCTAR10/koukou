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
  const kept = folded
    .split(' ')
    .filter((w) => w && !GENERIC_NAME_WORDS.has(w));
  return kept.length > 0 ? kept.join(' ') : folded;
}

/** AMI reference as stored: trimmed, inner spaces collapsed, uppercase; null when blank. */
export function normalizeAmiRef(value: string | null | undefined): string | null {
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

/** Names at least this similar (same province) are probable duplicates. */
export const NAME_SIMILARITY_THRESHOLD = 0.85;

export interface RegistryFarmKey {
  /** Normalized name (`normalizeFarmName`). */
  readonly normalizedName: string;
  readonly provinceId: string | null;
  readonly localiteId?: string | null;
  /** Normalized phone, or null. */
  readonly phone?: string | null;
}

export type DuplicateReason =
  | 'MEME_NOM'
  | 'NOM_PROCHE'
  | 'MEME_TELEPHONE'
  | 'MEME_LOCALITE';

export interface DuplicateScore {
  /** 0 = unrelated; ≥ `NAME_SIMILARITY_THRESHOLD` = probable duplicate. */
  readonly score: number;
  readonly reasons: DuplicateReason[];
}

/**
 * How likely `candidate` is the same farm as `existing`:
 * - same province and the same or a close normalized name;
 * - or the same exploitant phone (both known), whatever the province — one
 *   exploitant may own several farms, hence a confirmation, not a block;
 * - the same locality adds a little weight to a close name.
 */
export function duplicateScore(
  candidate: RegistryFarmKey,
  existing: RegistryFarmKey,
): DuplicateScore {
  const reasons: DuplicateReason[] = [];
  let score = 0;
  if (
    candidate.provinceId &&
    candidate.provinceId === existing.provinceId
  ) {
    const sim = nameSimilarity(
      candidate.normalizedName,
      existing.normalizedName,
    );
    if (sim === 1) {
      reasons.push('MEME_NOM');
      score = 1;
    } else if (sim >= NAME_SIMILARITY_THRESHOLD - 0.05) {
      score = sim;
      if (
        candidate.localiteId &&
        candidate.localiteId === existing.localiteId
      ) {
        score = Math.min(1, score + 0.05);
        reasons.push('MEME_LOCALITE');
      }
      if (score >= NAME_SIMILARITY_THRESHOLD) reasons.unshift('NOM_PROCHE');
      else {
        score = 0;
        reasons.length = 0;
      }
    }
  }
  if (candidate.phone && existing.phone && candidate.phone === existing.phone) {
    reasons.push('MEME_TELEPHONE');
    score = Math.max(score, 0.9);
  }
  return { score, reasons };
}

export function isProbableDuplicate(s: DuplicateScore): boolean {
  return s.score >= NAME_SIMILARITY_THRESHOLD;
}

/** French label of a duplicate reason. */
export const DUPLICATE_REASON_LABELS: Readonly<Record<DuplicateReason, string>> = {
  MEME_NOM: 'même nom dans la même province',
  NOM_PROCHE: 'nom très proche dans la même province',
  MEME_TELEPHONE: 'même téléphone de l’exploitant',
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
