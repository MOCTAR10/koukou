/**
 * Pure rules of the official sanitary alerts (POUFA plan §10): the
 * qualification circuit on STATUT_ALERTE families, publication, and when
 * the day's mortality opens (or extends) an alert.
 */

export const ALERT_FAMILY = {
  NOUVELLE: 'NOUVELLE',
  EN_ANALYSE: 'EN_ANALYSE',
  CONFIRMEE: 'CONFIRMEE',
  INFIRMEE: 'INFIRMEE',
  CLOSE: 'CLOSE',
} as const;

/**
 * CDC « Proposé » circuit: NOUVELLE → EN_ANALYSE → CONFIRMEE | INFIRMEE →
 * CLOSE. Moving between two statuses of the same family (statuses are list
 * items, the services may add some) is allowed until the alert is closed.
 */
const NEXT_FAMILIES: Readonly<Record<string, readonly string[]>> = {
  [ALERT_FAMILY.NOUVELLE]: [ALERT_FAMILY.EN_ANALYSE],
  [ALERT_FAMILY.EN_ANALYSE]: [ALERT_FAMILY.CONFIRMEE, ALERT_FAMILY.INFIRMEE],
  [ALERT_FAMILY.CONFIRMEE]: [ALERT_FAMILY.CLOSE],
  [ALERT_FAMILY.INFIRMEE]: [ALERT_FAMILY.CLOSE],
  [ALERT_FAMILY.CLOSE]: [],
};

/** Families of an alert still being handled (a new mortality day extends it). */
export const ACTIVE_FAMILIES: readonly string[] = [
  ALERT_FAMILY.NOUVELLE,
  ALERT_FAMILY.EN_ANALYSE,
  ALERT_FAMILY.CONFIRMEE,
];

/** Families whose transition records a decision: a comment is required. */
const DECISION_FAMILIES: readonly string[] = [
  ALERT_FAMILY.CONFIRMEE,
  ALERT_FAMILY.INFIRMEE,
];

export const COMMENT_MIN_LENGTH = 3;

export interface StatusRef {
  code: string;
  family: string;
}

export interface TargetStatus extends StatusRef {
  active: boolean;
}

export function allowedNextFamilies(family: string): readonly string[] {
  return NEXT_FAMILIES[family] ?? [];
}

/** French reason why `from → to` is refused, or null when allowed. */
export function transitionError(
  from: StatusRef,
  to: TargetStatus,
  comment: string | null | undefined,
): string | null {
  if (from.family === ALERT_FAMILY.CLOSE) {
    return 'Cette alerte est close : son statut ne change plus.';
  }
  if (!to.active) {
    return `Le statut « ${to.code} » est désactivé.`;
  }
  if (to.code === from.code) {
    return `L'alerte est déjà au statut « ${to.code} ».`;
  }
  const sameFamily = to.family === from.family;
  if (!sameFamily && !allowedNextFamilies(from.family).includes(to.family)) {
    const next = allowedNextFamilies(from.family);
    return (
      `Passage de ${from.family} à ${to.family} impossible` +
      (next.length > 0 ? ` (suivant possible : ${next.join(' ou ')}).` : '.')
    );
  }
  if (
    DECISION_FAMILIES.includes(to.family) &&
    (comment ?? '').trim().length < COMMENT_MIN_LENGTH
  ) {
    return 'Un commentaire est obligatoire pour confirmer ou infirmer une alerte.';
  }
  return null;
}

/** Outcome to store after moving to `family` (kept once set). */
export function outcomeAfter(
  previous: string | null,
  family: string,
): string | null {
  return DECISION_FAMILIES.includes(family) ? family : previous;
}

export type PublicationCheck =
  { ok: true } | { ok: false; conflict: boolean; error: string };

/**
 * An alert is published once, and only after it was confirmed (CDC: avoid
 * spreading an unverified alert).
 */
export function publicationCheck(alert: {
  publishedAt: Date | null;
  outcome: string | null;
}): PublicationCheck {
  if (alert.publishedAt) {
    return {
      ok: false,
      conflict: true,
      error: 'Cette alerte est déjà publiée.',
    };
  }
  if (alert.outcome !== ALERT_FAMILY.CONFIRMEE) {
    return {
      ok: false,
      conflict: false,
      error: 'Seule une alerte confirmée peut être publiée.',
    };
  }
  return { ok: true };
}

/** One day of a band's projection, as the mortality check reads it. */
export interface MortalityDay {
  day: string;
  mortalityDayPct: number | null;
  deaths: number;
  presentStart: number;
}

export interface ExceededDay extends MortalityDay {
  mortalityDayPct: number;
  thresholdPct: number;
}

/**
 * Days whose mortality is strictly above the threshold in force on that day
 * (CDC « mortalité du jour (en % de l'effectif présent) > seuil »).
 */
export function exceededDays(
  days: readonly MortalityDay[],
  thresholdOn: (day: string) => number,
): ExceededDay[] {
  const out: ExceededDay[] = [];
  for (const d of days) {
    if (d.mortalityDayPct === null || !Number.isFinite(d.mortalityDayPct)) {
      continue;
    }
    const thresholdPct = thresholdOn(d.day);
    if (d.mortalityDayPct > thresholdPct) {
      out.push({ ...d, mortalityDayPct: d.mortalityDayPct, thresholdPct });
    }
  }
  return out;
}

export type MortalityPlan =
  | { action: 'none' }
  | {
      action: 'extend';
      lastFactDay: string;
      mortalityPct: number;
    }
  | {
      action: 'create';
      first: ExceededDay;
      lastFactDay: string;
      mortalityPct: number;
    };

/**
 * What the band's exceeded days call for: days already covered by an earlier
 * alert (up to `coveredUntil`, its last fact day) are never raised again; new
 * days extend the alert still being handled, if any, else open a new one.
 * One alert per episode, not one per day.
 */
export function planMortalityAlert(input: {
  exceeded: readonly ExceededDay[];
  coveredUntil: string | null;
  open: { lastFactDay: string; mortalityPct: number | null } | null;
}): MortalityPlan {
  const fresh = input.exceeded
    .filter((d) => input.coveredUntil === null || d.day > input.coveredUntil)
    .sort((a, b) => a.day.localeCompare(b.day));
  if (fresh.length === 0) return { action: 'none' };
  const last = fresh[fresh.length - 1].day;
  const worst = Math.max(...fresh.map((d) => d.mortalityDayPct));
  if (input.open) {
    return {
      action: 'extend',
      lastFactDay: last > input.open.lastFactDay ? last : input.open.lastFactDay,
      mortalityPct: Math.max(worst, input.open.mortalityPct ?? 0),
    };
  }
  return { action: 'create', first: fresh[0], lastFactDay: last, mortalityPct: worst };
}

/** `AS-2026-0001`. */
export function sanitaryAlertCode(year: number, n: number): string {
  return `AS-${year}-${String(n).padStart(4, '0')}`;
}

/** French number with up to 2 decimals (« 3,25 »). */
export function frPct(value: number): string {
  return (Math.round(value * 100) / 100).toString().replace('.', ',');
}
