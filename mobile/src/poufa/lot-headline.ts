// Lots tab (POUFA lot A2 divers, audit v3 « Valeurs officielles en tête
// partout »): the cards, the lot sheet and the overview show the official
// value first (programme formulas, `GET /farms/:farmId/bandes`) and Fermia's
// own figure second, always labelled « conduite ». Without an official value
// (no band summary yet, or the overview rebuilt at a past date) Fermia's figure
// stays, still labelled as a conduct indicator. Pure.
import type { BandHistoryRow, BandSummaryIndicator } from '@/api/poufa';
import { CONDUITE_LABEL, findIndicator, officialText, type HeadlineKey } from './official-headline';

/** Short form for the compact cells of a card. */
export const CONDUITE_SHORT = 'conduite';

export interface HeadlineCell {
  /** Text shown in the cell (official when there is one). */
  value: string;
  /** Second line naming Fermia's figure, or saying the value is a conduct indicator. */
  sub: string;
  official: boolean;
  /** Numeric value behind `value`, for the tone (null when unknown). */
  numeric: number | null;
}

/** Official indicators per band id, from the band list (`GET /farms/:farmId/bandes`). */
export function officialByBand(rows: readonly BandHistoryRow[] | null | undefined): Map<string, BandSummaryIndicator[]> {
  const map = new Map<string, BandSummaryIndicator[]>();
  for (const r of rows ?? []) {
    if (r.summary?.indicators?.length) map.set(r.id, r.summary.indicators);
  }
  return map;
}

/**
 * One cell: the official `key` when the band has it, Fermia's text as the
 * « conduite » line; else Fermia's text with the conduct label.
 * `short` keeps the second line short enough for a compact card cell.
 */
export function headlineCell(
  indicators: readonly BandSummaryIndicator[] | null | undefined,
  key: HeadlineKey,
  fermia: { text: string; value: number | null },
  short = false,
): HeadlineCell {
  const ind = findIndicator(indicators, key);
  if (ind) {
    return {
      value: officialText(ind),
      sub: '', // one number on screen (recette A4): Fermia's figure is no longer shown beside the official one
      official: true,
      numeric: ind.value != null && Number.isFinite(ind.value) ? ind.value : null,
    };
  }
  return { value: fermia.text, sub: short ? `Fermia · ${CONDUITE_SHORT}` : CONDUITE_LABEL, official: false, numeric: fermia.value };
}

/** Fermia's own figures of a lot (`metrics` of `GET /batches`). */
export interface FermiaLotFigures {
  mortalityPercent: number;
  fcr: number | null;
  gmqGramsPerDay: number | null;
  viabilityPercent?: number | null;
}

export function fermiaMortalityText(v: number | null | undefined): string {
  return v != null ? `${v.toLocaleString('fr-FR')} %` : '—';
}
export function fermiaFcrText(v: number | null | undefined): string {
  return v != null && v > 0 ? v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—';
}
export function fermiaGmqText(v: number | null | undefined): string {
  return v ? `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} g` : '—';
}
export function fermiaViabilityText(v: number | null | undefined): string {
  return v != null ? `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : '—';
}

/** The four headline cells of a lot card or sheet. */
export function lotHeadlines(indicators: readonly BandSummaryIndicator[] | null | undefined, m: FermiaLotFigures, short = false) {
  return {
    mortality: headlineCell(indicators, 'taux_mortalite', { text: fermiaMortalityText(m.mortalityPercent), value: m.mortalityPercent }, short),
    fcr: headlineCell(indicators, 'ic', { text: fermiaFcrText(m.fcr), value: m.fcr }, short),
    gmq: headlineCell(indicators, 'gmq_g_j', { text: fermiaGmqText(m.gmqGramsPerDay), value: m.gmqGramsPerDay }, short),
    viability: headlineCell(indicators, 'viabilite', { text: fermiaViabilityText(m.viabilityPercent), value: m.viabilityPercent ?? null }, short),
  };
}

/**
 * Overview cell: mean of the official values of the listed bands that have
 * one (null map = no official set, e.g. the overview rebuilt at a past date),
 * Fermia's mean as the conduct line.
 */
export function overviewCell(
  bandIds: readonly string[],
  official: ReadonlyMap<string, readonly BandSummaryIndicator[]> | null,
  key: HeadlineKey,
  fermia: { text: string; value: number | null },
): HeadlineCell {
  const found = official ? bandIds.map((id) => findIndicator(official.get(id), key)).filter((i): i is BandSummaryIndicator => i != null) : [];
  const values = found.map((i) => i.value).filter((v): v is number => v != null && Number.isFinite(v));
  if (found.length === 0) return { value: fermia.text, sub: CONDUITE_LABEL, official: false, numeric: fermia.value };
  const mean = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
  return {
    value: officialText({ value: mean, unit: found[0].unit }),
    sub: '',
    official: true,
    numeric: mean,
  };
}
