// Delegated entry (jury lot 5): pure rules shared by the agent's screen and the
// badges that mark what an agent entered on behalf of a farmer.
import type { OnBehalfMark } from '@/api/types';

/** Banner shown on the delegated screen and inside every delegated flow. */
export function onBehalfBanner(farmName: string | null | undefined): string {
  const name = farmName?.trim();
  return `Vous saisissez pour le compte de ${name ? name : 'cet éleveur'}`;
}

/**
 * « Saisi par {name} ({profile}) » when the record was entered on behalf of the
 * farmer, null otherwise (absent fields on an older server: no badge).
 */
export function onBehalfLabel(mark: OnBehalfMark | null | undefined): string | null {
  if (!mark?.enteredOnBehalf) return null;
  const name = mark.enteredByName?.trim() || 'un agent du programme';
  const profile = mark.enteredByProfile?.trim();
  return profile ? `Saisi par ${name} (${profile})` : `Saisi par ${name}`;
}

/** Tiles of the delegated screen (a subset of the simple actions). */
export type DelegatedAction = 'morts' | 'aliment' | 'eau' | 'oeufs' | 'pesee' | 'probleme';

/** Tiles the agent may use: the daily entry needs `daily`, the problem report `declaration`. */
export function delegatedActions(facts: { isLayer: boolean; daily: boolean; declaration: boolean }): DelegatedAction[] {
  const list: DelegatedAction[] = [];
  if (facts.daily) list.push('morts', 'aliment', 'eau');
  if (facts.daily && facts.isLayer) list.push('oeufs');
  if (facts.daily) list.push('pesee');
  if (facts.declaration) list.push('probleme');
  return list;
}

export const DAY_NOT_CACHED =
  'Les saisies du jour de cet élevage ne sont pas encore sur ce téléphone. Ouvrez cet écran une fois avec du réseau chez l’éleveur, ou revenez quand le réseau est là.';
export const STOCK_NOT_CACHED =
  'Le stock d’aliment de cette ferme n’est pas encore sur ce téléphone. Ouvrez cet écran une fois avec du réseau, puis recommencez.';

/**
 * Why an action cannot start offline (French message), or null. A daily entry
 * is merged into the day's entry, so that entry must be known on this phone;
 * the feed entry also needs the stock suggestion (FEFO lot). The problem report
 * needs nothing cached (without the clinical-sign list it still takes a count,
 * a voice note or photos).
 */
export function delegatedBlock(action: DelegatedAction, known: { day: boolean; stock: boolean }): string | null {
  if (action === 'probleme') return null;
  if (!known.day) return DAY_NOT_CACHED;
  if (action === 'aliment' && !known.stock) return STOCK_NOT_CACHED;
  return null;
}
