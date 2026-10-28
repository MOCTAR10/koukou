/**
 * Rest period of a building before a new lot (pure, tested). Mirrors the
 * backend rule: days from the end of the previous lot to the placement,
 * VIDE_SANITAIRE_MIN_DAYS (14) / VIDE_SANITAIRE_MAX_DAYS (21) by default.
 */
export type VideSanitaireTone = 'danger' | 'warn' | 'ok' | 'muted';

export interface VideSanitaireHint {
  tone: VideSanitaireTone;
  text: string;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function videSanitaireHint(input: {
  /** Lots still running in the building. */
  activeLots: number;
  /** End of the last closed lot (YYYY-MM-DD), from the server. */
  lastLotEndedAt: string | null | undefined;
  /** Planned placement date of the new lot (YYYY-MM-DD). */
  placementDate: string;
  minDays?: number;
  recommendedDays?: number;
}): VideSanitaireHint {
  const min = input.minDays ?? 14;
  const rec = input.recommendedDays ?? 21;
  if (input.activeLots > 0) {
    return {
      tone: 'warn',
      text: 'Bâtiment encore occupé : pas de vide sanitaire avant ce lot (risque de transmission entre bandes).',
    };
  }
  if (!input.lastLotEndedAt) {
    return {
      tone: 'muted',
      text: `Aucun lot précédent dans ce bâtiment. Après un lot, prévoir ${min} à ${rec} jours de vide sanitaire.`,
    };
  }
  const days = Math.max(0, daysBetween(input.lastLotEndedAt, input.placementDate));
  const plural = days > 1 ? 's' : '';
  if (days < min) {
    return {
      tone: 'danger',
      text: `Vide sanitaire de ${days} jour${plural} seulement à cette date : attendre encore ${min - days} jour${min - days > 1 ? 's' : ''} (minimum ${min}).`,
    };
  }
  if (days < rec) {
    return {
      tone: 'warn',
      text: `Vide sanitaire de ${days} jours à cette date : acceptable, idéalement ${rec} jours.`,
    };
  }
  return { tone: 'ok', text: `Vide sanitaire de ${days} jours à cette date : parfait.` };
}
