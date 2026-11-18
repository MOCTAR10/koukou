// Pure rules of the SIMPLE experience: tile states, the single-field daily
// entries and their merge into the day's existing entry, simple-French
// refusals and the spoken sentences. No React, no network.
import type { DailyEntryPayload } from '@/api/mutations';
import type { BatchWithMetrics, DailyEntryRecord, FeedPhase, ProphylaxisEvent } from '@/api/types';
import { EGGS_PER_ALVEOL } from '@/constants/stock';
import { normalizePhase, phasesForLot, suggestedPhaseFor } from '@/components/capture/feed-phase';
import type { DeclarationPayload } from '@/api/poufa';
import { withDeclarationFields } from '@/poufa/declaration';
import { withEntryBase } from '@/poufa/entry-sync';

/** The actions of the simple home, in display order. */
export type SimpleAction = 'morts' | 'aliment' | 'eau' | 'oeufs' | 'pesee' | 'vaccin' | 'probleme' | 'vendre';

/** The actions that write one field of the daily entry. */
export type SimpleEntryKind = 'morts' | 'aliment' | 'eau' | 'oeufs' | 'pesee';

/** done = green check, todo = orange dot, late = red, none = no badge. */
export type TileState = 'done' | 'todo' | 'late' | 'none';

export type DayEntryLike = Pick<DailyEntryRecord, 'deaths' | 'feedQuantity' | 'waterL' | 'avgWeightKg' | 'eggsCollected'>;

export interface TileContext {
  /** Today's daily entry of the chosen band (null: none yet). */
  entry: DayEntryLike | null;
  /** Entries saved from this phone today that the server copy does not show yet (offline). */
  localDone: ReadonlySet<SimpleEntryKind>;
  caresLate: number;
  caresDueToday: number;
  /** The programme's weighing is due (null: unknown, the tile then asks every day). */
  weighingDue: boolean | null;
}

function doneInEntry(kind: SimpleEntryKind, e: DayEntryLike | null): boolean {
  if (!e) return false;
  switch (kind) {
    case 'morts':
      return e.deaths > 0;
    case 'aliment':
      return e.feedQuantity > 0;
    case 'eau':
      return e.waterL > 0;
    case 'oeufs':
      return e.eggsCollected > 0;
    case 'pesee':
      return e.avgWeightKg != null && e.avgWeightKg > 0;
  }
}

/** State badge of a tile: done today, still to do, or late (care overdue). */
export function tileState(action: SimpleAction, ctx: TileContext): TileState {
  switch (action) {
    case 'morts':
    case 'aliment':
    case 'eau':
    case 'oeufs':
      return ctx.localDone.has(action) || doneInEntry(action, ctx.entry) ? 'done' : 'todo';
    case 'pesee':
      if (ctx.localDone.has('pesee') || doneInEntry('pesee', ctx.entry)) return 'done';
      return ctx.weighingDue === false ? 'none' : 'todo';
    case 'vaccin':
      return ctx.caresLate > 0 ? 'late' : ctx.caresDueToday > 0 ? 'todo' : 'none';
    case 'probleme':
    case 'vendre':
      return 'none';
  }
}

export interface ActionFacts {
  /** The chosen band lays eggs. */
  isLayer: boolean;
  /** Cares due today or late exist for the band. */
  hasCares: boolean;
  /** `saisie:creer` and not read-only. */
  canEnter: boolean;
  /** `sanitaire:signaler` or `sanitaire:gerer`. */
  canReport: boolean;
  /** `vente:creer` and not read-only. */
  canSell: boolean;
}

/** The tiles shown on the simple home, in display order. */
export function visibleActions(f: ActionFacts): SimpleAction[] {
  const list: SimpleAction[] = [];
  if (f.canEnter) list.push('morts', 'aliment', 'eau');
  if (f.canEnter && f.isLayer) list.push('oeufs');
  if (f.canEnter) list.push('pesee');
  if (f.hasCares && f.canReport) list.push('vaccin');
  if (f.canReport) list.push('probleme');
  if (f.canSell) list.push('vendre');
  return list;
}

/** The band to work on: the one picked this session, or the only open band; null = ask. */
export function pickBand<T extends { id: string }>(bands: readonly T[], selectedId: string | null): T | null {
  const picked = selectedId ? bands.find((b) => b.id === selectedId) : undefined;
  if (picked) return picked;
  return bands.length === 1 ? bands[0] : null;
}

export type CareBucket = 'late' | 'today' | 'later' | 'closed';

/** Where a planned care stands against today (`YYYY-MM-DD`, Libreville day). */
export function careBucket(event: Pick<ProphylaxisEvent, 'status' | 'scheduledDate'>, today: string): CareBucket {
  if (event.status === 'FAIT' || event.status === 'ANNULE') return 'closed';
  const day = event.scheduledDate.slice(0, 10);
  if (event.status === 'EN_RETARD' || day < today) return 'late';
  return day === today ? 'today' : 'later';
}

/** Cares to show on the Vaccin screen: due today or late, late first, then by date. */
export function caresToDo<T extends Pick<ProphylaxisEvent, 'status' | 'scheduledDate'>>(events: readonly T[], today: string): T[] {
  return events
    .filter((e) => {
      const b = careBucket(e, today);
      return b === 'late' || b === 'today';
    })
    .slice()
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
}

// ── Single-field daily entries ────────────────────────────────────────────

export interface FeedChoice {
  feedPhase: FeedPhase;
  inputLotId: string | null;
  skipStockDeduction: boolean;
}

export type SimpleEntryInput =
  | { kind: 'morts'; deaths: number }
  | { kind: 'aliment'; sacs: number; bagSizeKg: number; feed: FeedChoice }
  | { kind: 'eau'; waterL: number }
  | { kind: 'oeufs'; eggs: number }
  | { kind: 'pesee'; weightG: number; sampleSize: number };

type StockSuggestions = { byType: readonly { feedPhase: FeedPhase; suggestedLotId: string | null }[] } | null | undefined;

/**
 * Feed phase and stock lot, chosen as `DailyEntrySheet` does by default: the
 * day's entry keeps its own phase/lot (or its « external purchase » flag),
 * otherwise the phase suggested by the band's age and the server's FEFO lot.
 */
export function resolveFeedChoice(
  lot: BatchWithMetrics | undefined,
  existing: Pick<DailyEntryRecord, 'feedPhase' | 'inputLotId' | 'skipStockDeduction'> | null,
  stock: StockSuggestions,
): FeedChoice {
  const suggested = suggestedPhaseFor(lot);
  const feedPhase = normalizePhase((existing?.feedPhase as FeedPhase | null | undefined) ?? suggested, phasesForLot(lot)) ?? suggested;
  if (existing?.skipStockDeduction) return { feedPhase, inputLotId: null, skipStockDeduction: true };
  const fefo = stock?.byType.find((x) => x.feedPhase === feedPhase)?.suggestedLotId ?? null;
  return { feedPhase, inputLotId: existing?.inputLotId ?? fefo, skipStockDeduction: false };
}

/** Sacks already entered today (rounded to the half sack), 0 when none. */
export function sacsOfEntry(existing: Pick<DailyEntryRecord, 'feedQuantity'> | null, bagSizeKg: number): number {
  if (!existing || !(existing.feedQuantity > 0) || !(bagSizeKg > 0)) return 0;
  return Math.round((existing.feedQuantity / bagSizeKg) * 2) / 2;
}

/** Eggs as « alvéoles + loose eggs » (an alvéole is a tray of 30). */
export function splitEggs(eggs: number): { alveoles: number; loose: number } {
  const n = Math.max(0, Math.floor(eggs));
  return { alveoles: Math.floor(n / EGGS_PER_ALVEOL), loose: n % EGGS_PER_ALVEOL };
}

export function joinEggs(alveoles: number, loose: number): number {
  return Math.max(0, Math.floor(alveoles)) * EGGS_PER_ALVEOL + Math.max(0, Math.floor(loose));
}

/**
 * The daily-entry payload of ONE simple answer, merged into the day's entry:
 * only the touched field(s) are sent (the server upsert leaves the others as
 * they are) and the existing entry's base goes along, so the offline conflict
 * rule (CDC §7.2) sees exactly which field this phone changed. A zero is sent
 * on purpose: « no dead bird today » is an answer.
 */
export function buildSimplePayload(
  input: SimpleEntryInput,
  entryDate: string,
  existing: DailyEntryRecord | null,
): DailyEntryPayload {
  const p: DailyEntryPayload = { entryDate };
  switch (input.kind) {
    case 'morts':
      p.deaths = input.deaths;
      break;
    case 'eau':
      p.waterL = input.waterL;
      break;
    case 'oeufs': {
      const rejects = existing ? existing.eggsCracked + existing.eggsSmall + existing.eggsDoubleYolk + existing.eggsDirty : 0;
      p.eggsCollected = input.eggs;
      p.eggsSellable = Math.max(0, input.eggs - rejects);
      break;
    }
    case 'pesee':
      p.avgWeightKg = input.weightG / 1000;
      p.sampleSize = input.sampleSize;
      break;
    case 'aliment':
      if (input.sacs > 0) {
        if (Number.isInteger(input.sacs)) {
          p.feedUnit = 'SAC';
          p.feedBags = input.sacs;
          p.bagSizeKg = input.bagSizeKg;
        } else {
          // A half sack cannot be a whole number of bags: send the weight.
          p.feedUnit = 'KG';
          p.feedQuantity = input.sacs * input.bagSizeKg;
        }
        p.feedPhase = input.feed.feedPhase;
        if (input.feed.skipStockDeduction) p.skipStockDeduction = true;
        else if (input.feed.inputLotId) p.inputLotId = input.feed.inputLotId;
      } else {
        // Corrected back to nothing (the server gives the stock back).
        p.feedUnit = 'KG';
        p.feedQuantity = 0;
      }
      break;
  }
  return withEntryBase(p, existing);
}

export interface EntryCheck {
  /** Live birds of the band (null: unknown). */
  live: number | null;
  existing: DailyEntryRecord | null;
}

/** Simple-French refusal of an answer, or null when it can be saved. */
export function validateSimple(input: SimpleEntryInput, check: EntryCheck): string | null {
  const { live, existing } = check;
  switch (input.kind) {
    case 'morts':
      return live != null && live > 0 && input.deaths >= live ? 'Il n’y a pas autant de poules vivantes. Corrigez le nombre.' : null;
    case 'aliment':
      return input.sacs <= 0 && !(existing && existing.feedQuantity > 0) ? 'Dites combien de sacs vous avez donnés.' : null;
    case 'eau':
      return input.waterL <= 0 && !(existing && existing.waterL > 0) ? 'Dites combien de litres d’eau.' : null;
    case 'oeufs':
      return input.eggs <= 0 && !(existing && existing.eggsCollected > 0) ? 'Dites combien d’œufs vous avez ramassés.' : null;
    case 'pesee':
      if (!(input.weightG > 0)) return 'Dites le poids moyen d’une poule.';
      if (!(input.sampleSize >= 1)) return 'Dites combien de poules vous avez pesées.';
      if (live != null && live > 0 && input.sampleSize > live) return 'Vous ne pouvez pas peser plus de poules qu’il y en a.';
      return null;
  }
}

// ── « Problème » (health report) ──────────────────────────────────────────

export const PROBLEM_TITLE = 'Problème signalé par l’éleveur';

/** Simple-French refusal of a report with nothing in it, or null. */
export function problemRefusal(signs: readonly string[], count: number, photos: number): string | null {
  return signs.length === 0 && !(count > 0) && photos === 0 ? 'Touchez ce que vous voyez, ou dites combien de poules.' : null;
}

/**
 * The declaration of a farmer's report: a symptom event of yellow severity with
 * the ticked clinical signs and the number of dead or sick birds. The vet
 * qualifies it later.
 */
export function buildProblemDeclaration(input: { signs: readonly string[]; count: number; today: string }): DeclarationPayload {
  return withDeclarationFields(
    {
      kind: 'SYMPTOME',
      occurredAt: input.today,
      severity: 'JAUNE',
      title: PROBLEM_TITLE,
      ...(input.count > 0 ? { quantity: Math.floor(input.count) } : {}),
    },
    { clinicalSigns: input.signs, suspicion: false },
  );
}

// ── Keypad ────────────────────────────────────────────────────────────────

export type KeypadKey = number | 'back' | 'clear';

export const KEYPAD_MAX = 99999;

/** One key press on the big keypad: a digit appends, back drops the last digit. */
export function pressKey(value: number, key: KeypadKey, max = KEYPAD_MAX): number {
  if (key === 'clear') return 0;
  if (key === 'back') return Math.floor(value / 10);
  const next = value * 10 + key;
  return next > max ? value : next;
}

/** The − / + buttons: never below 0 nor above `max`. */
export function stepValue(value: number, delta: number, max = KEYPAD_MAX): number {
  return Math.min(max, Math.max(0, value + delta));
}

// ── Spoken sentences (short, imperative or a plain question) ─────────────

export const SENTENCES = {
  home: 'Que voulez-vous faire ? Touchez une image.',
  band: 'Quelle bande ? Touchez la bande.',
  morts: 'Combien de poules sont mortes aujourd’hui ?',
  aliment: 'Combien de sacs avez-vous donnés aujourd’hui ?',
  eau: 'Combien de litres d’eau avez-vous donnés aujourd’hui ?',
  oeufsAlveoles: 'Combien d’alvéoles d’œufs avez-vous ramassées ?',
  oeufsLoose: 'Combien d’œufs seuls en plus ?',
  peseeWeight: 'Quel est le poids moyen d’une poule, en grammes ?',
  peseeCount: 'Combien de poules avez-vous pesées ?',
  vaccin: 'Voici les soins à faire. Touchez Fait quand c’est fini.',
  vaccinNone: 'Aucun soin à faire pour le moment.',
  vaccinCount: 'Combien de poules avez-vous soignées ?',
  probleme: 'Qu’est-ce qui ne va pas ? Touchez ce que vous voyez.',
  problemeCount: 'Combien de poules sont mortes ou malades ?',
  problemePhotos: 'Prenez une photo si vous pouvez.',
  saved: 'C’est enregistré.',
  savedOffline: 'C’est enregistré sur le téléphone. Il sera envoyé avec le réseau.',
  error: 'Il y a un problème. Corrigez puis recommencez.',
} as const;
