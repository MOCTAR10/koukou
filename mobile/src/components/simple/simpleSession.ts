// Session memory of the simple experience: the band the farmer picked, and the
// entries saved from this phone today (an offline entry is not in the cached
// server copy yet, the tile must still turn green). Immutable snapshots, so
// `useSyncExternalStore` readers (and React Compiler memoisation) stay correct.
import { useSyncExternalStore } from 'react';

import type { SimpleEntryKind } from './simple-logic';

export interface SimpleSessionState {
  selectedBandId: string | null;
  /** `${date}|${batchId}` → kinds saved from this phone. */
  done: Readonly<Record<string, readonly SimpleEntryKind[]>>;
  /** Care events completed from this phone (the cached planning may still list them as planned). */
  caresDone: readonly string[];
}

let state: SimpleSessionState = { selectedBandId: null, done: {}, caresDone: [] };
const listeners = new Set<() => void>();

function set(next: SimpleSessionState): void {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useSimpleSession(): SimpleSessionState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function selectBand(batchId: string | null): void {
  set({ ...state, selectedBandId: batchId });
}

export function doneKey(date: string, batchId: string): string {
  return `${date}|${batchId}`;
}

export function markDone(date: string, batchId: string, kind: SimpleEntryKind): void {
  const key = doneKey(date, batchId);
  const known = state.done[key] ?? [];
  if (known.includes(kind)) return;
  set({ ...state, done: { ...state.done, [key]: [...known, kind] } });
}

export function markCareDone(eventId: string): void {
  if (state.caresDone.includes(eventId)) return;
  set({ ...state, caresDone: [...state.caresDone, eventId] });
}

export function doneSet(session: SimpleSessionState, date: string, batchId: string): ReadonlySet<SimpleEntryKind> {
  return new Set(session.done[doneKey(date, batchId)] ?? []);
}
