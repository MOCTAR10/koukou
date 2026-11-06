/** Search of the farm picker (an admin or an institution may see 150+ farms). Pure. */

export interface PickableFarm {
  id: string;
  name: string;
  code?: string | null;
  exploitantName?: string | null;
  administrativeCity?: string | null;
  /** From `GET /farms`. */
  provinceName?: string | null;
}

/** Lower case, no accents, single spaces: « Élevage  N'Toum » → « elevage n'toum ». */
export function foldText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Farms matching every word of `query` in their code, name, exploitant, town
 * or province name; codes that start with the query come first, then the
 * original order (by name from the server).
 */
export function searchFarms<T extends PickableFarm>(farms: readonly T[], query: string): T[] {
  const words = foldText(query).split(' ').filter(Boolean);
  if (words.length === 0) return [...farms];
  const scored: { farm: T; rank: number; index: number }[] = [];
  farms.forEach((farm, index) => {
    const code = foldText(farm.code);
    const haystack = [code, foldText(farm.name), foldText(farm.exploitantName), foldText(farm.administrativeCity), foldText(farm.provinceName)].join(' | ');
    if (!words.every((w) => haystack.includes(w))) return;
    const codeFirst = code && code.replace(/[^a-z0-9]/g, '').startsWith(words.join('').replace(/[^a-z0-9]/g, ''));
    scored.push({ farm, rank: codeFirst ? 0 : 1, index });
  });
  return scored.sort((a, b) => a.rank - b.rank || a.index - b.index).map((s) => s.farm);
}

/** « G1-0012 · Ferme Ngoma » */
export function farmOptionLabel(farm: Pick<PickableFarm, 'code' | 'name'>): string {
  return farm.code ? `${farm.code} · ${farm.name}` : farm.name;
}

/** Below this many farms, the picker shows its list without a search field. */
export const PICKER_SEARCH_FROM = 7;
