/**
 * Biosecurity classification in the steering (CDC §7.3f « classement »): the
 * class (A/B/C) and score of each farm's LATEST control, farms never
 * controlled counted apart, a control older than a parameter flagged « ancien »,
 * and the distribution per group. Pure, unit-tested; the SQL is in
 * `PilotageBiosecurityService`.
 */
import { round, suppressedKeys } from './pilotage-rules.js';

export type BiosecurityClassCode = 'A' | 'B' | 'C';

export const BIOSECURITY_CLASSES: readonly BiosecurityClassCode[] = [
  'A',
  'B',
  'C',
];

/** A farm's latest control (null fields: never controlled). */
export interface FarmBiosecurity {
  classification: BiosecurityClassCode | null;
  scorePct: number | null;
  /** `YYYY-MM-DD` of the latest control. */
  visitDate: string | null;
  /** Controlled, but longer ago than the « ancien » threshold. */
  stale: boolean;
}

export const NEVER_CONTROLLED: FarmBiosecurity = {
  classification: null,
  scorePct: null,
  visitDate: null,
  stale: false,
};

/** A visit row as read for the ranking. */
export interface ControlRow {
  farmId: string;
  visitDate: string;
  /** Tie-break between two visits of the same day (later wins). */
  createdAt?: string | Date | null;
  classification: BiosecurityClassCode | null;
  scorePct: number | null;
}

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to` (`YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) /
      DAY_MS,
  );
}

/** `staleAfterDays` of 0 (or less) switches the flag off. */
export function isStale(
  visitDate: string,
  today: string,
  staleAfterDays: number,
): boolean {
  return staleAfterDays > 0 && daysBetween(visitDate, today) > staleAfterDays;
}

/**
 * The latest classified control of each farm (most recent visit date, then
 * most recently recorded), farms without one mapped to {@link NEVER_CONTROLLED}.
 */
export function latestControls(
  farmIds: readonly string[],
  rows: readonly ControlRow[],
  today: string,
  staleAfterDays: number,
): Map<string, FarmBiosecurity> {
  const best = new Map<string, ControlRow>();
  const stamp = (r: ControlRow) =>
    r.createdAt ? new Date(r.createdAt).getTime() : 0;
  for (const r of rows) {
    if (r.classification == null) continue;
    const cur = best.get(r.farmId);
    const day = r.visitDate.slice(0, 10);
    if (
      !cur ||
      day > cur.visitDate.slice(0, 10) ||
      (day === cur.visitDate.slice(0, 10) && stamp(r) > stamp(cur))
    ) {
      best.set(r.farmId, r);
    }
  }
  const out = new Map<string, FarmBiosecurity>();
  for (const id of farmIds) {
    const r = best.get(id);
    out.set(
      id,
      r
        ? {
            classification: r.classification,
            scorePct: r.scorePct == null ? null : Number(r.scorePct),
            visitDate: r.visitDate.slice(0, 10),
            stale: isStale(r.visitDate, today, staleAfterDays),
          }
        : NEVER_CONTROLLED,
    );
  }
  return out;
}

/** Distribution of a group of farms. */
export interface BiosecurityFigures {
  farms: number;
  controlled: number;
  neverControlled: number;
  classA: number;
  classB: number;
  classC: number;
  /** Controlled farms whose latest control is older than the threshold. */
  stale: number;
  /** Mean of the latest scores, one decimal; null without a controlled farm. */
  averageScorePct: number | null;
  /** Controlled farms over farms, one decimal; null without a farm. */
  controlledPct: number | null;
}

export function biosecurityFigures(
  entries: readonly FarmBiosecurity[],
): BiosecurityFigures {
  const count = (c: BiosecurityClassCode) =>
    entries.filter((e) => e.classification === c).length;
  const controlled = entries.filter((e) => e.classification != null);
  const scores = controlled
    .map((e) => e.scorePct)
    .filter((s): s is number => s != null);
  return {
    farms: entries.length,
    controlled: controlled.length,
    neverControlled: entries.length - controlled.length,
    classA: count('A'),
    classB: count('B'),
    classC: count('C'),
    stale: controlled.filter((e) => e.stale).length,
    averageScorePct:
      scores.length === 0
        ? null
        : round(scores.reduce((s, v) => s + v, 0) / scores.length, 1),
    controlledPct:
      entries.length === 0
        ? null
        : round((controlled.length / entries.length) * 100, 1),
  };
}

/** The figures as export / report cells (hidden group: dashes). */
export function biosecurityLine(f: BiosecurityFigures | null): string {
  if (!f) return 'Masqué';
  if (f.farms === 0) return 'Aucune ferme';
  const avg =
    f.averageScorePct == null ? '' : `, score moyen ${f.averageScorePct} %`;
  return `A ${f.classA}, B ${f.classB}, C ${f.classC}, non contrôlées ${f.neverControlled} (${f.controlledPct} % contrôlées${avg})`;
}

export interface BiosecurityGroup {
  provinceId: string;
  code: string;
  name: string;
  /** Hidden: an aggregate-only view and fewer than k farms (or a neighbour hidden for it). */
  suppressed: boolean;
  figures: BiosecurityFigures | null;
}

/** The dashboard's biosecurity block: national and per-province distribution. */
export interface BiosecurityBlock {
  /** `BIOSECURITE_CONTROLE_ANCIEN_JOURS` in force (0: flag off). */
  staleAfterDays: number;
  suppressed: boolean;
  total: BiosecurityFigures | null;
  provinces: BiosecurityGroup[];
}

/**
 * Distribution of the farms in scope, in total and per province. For an
 * aggregate-only view, the same small-group rule as the other figures: a
 * group of fewer than `k` farms is hidden, and so is the smallest visible one
 * while the hidden ones together stay under `k` (no recovery by difference).
 * The group size is the number of farms of the registry, controlled or not.
 */
export function biosecurityBlock(
  farms: readonly { id: string; provinceId: string | null }[],
  byFarm: ReadonlyMap<string, FarmBiosecurity>,
  provinces: readonly { id: string; code: string; name: string; sort: number }[],
  opts: { aggregateOnly: boolean; k: number; staleAfterDays: number },
): BiosecurityBlock {
  const entryOf = (id: string) => byFarm.get(id) ?? NEVER_CONTROLLED;
  const groups = new Map<string, FarmBiosecurity[]>();
  for (const f of farms) {
    const key = f.provinceId ?? '';
    const list = groups.get(key);
    if (list) list.push(entryOf(f.id));
    else groups.set(key, [entryOf(f.id)]);
  }
  const totalHidden =
    opts.aggregateOnly && farms.length > 0 && farms.length < opts.k;
  const hidden = opts.aggregateOnly
    ? suppressedKeys(
        [...groups].map(([key, list]) => ({ key, farms: list.length })),
        opts.k,
      )
    : new Set<string>();
  const byId = new Map(provinces.map((p) => [p.id, p]));
  return {
    staleAfterDays: opts.staleAfterDays,
    suppressed: totalHidden,
    total: totalHidden
      ? null
      : biosecurityFigures(farms.map((f) => entryOf(f.id))),
    provinces: [...groups]
      .map(([key, list]) => {
        const p = byId.get(key);
        const suppressed = hidden.has(key);
        return {
          sort: p?.sort ?? Number.MAX_SAFE_INTEGER,
          group: {
            provinceId: key,
            code: p?.code ?? '',
            name: p?.name ?? 'Sans province',
            suppressed,
            figures: suppressed ? null : biosecurityFigures(list),
          },
        };
      })
      .sort((a, b) => a.sort - b.sort || a.group.code.localeCompare(b.group.code))
      .map((x) => x.group),
  };
}
