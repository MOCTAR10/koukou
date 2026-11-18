// Data hooks of the simple experience. Same query keys and offline queue as the
// daily-entry sheet, so every read works from the cached copy and every write
// goes through `queueDailyEntry`.
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/auth/AuthContext';
import { fetchAdvisory, fetchBatches, fetchDailyEntries, fetchFeedStock, fetchProphylaxis } from '@/api';
import { invalidateFarmQueries } from '@/api/invalidate';
import { todayStr } from '@/api/mutations';
import { fetchBandSheet, type WeighingStatus } from '@/api/poufa';
import type { Alert, BatchWithMetrics, DailyEntryRecord, ProphylaxisEvent } from '@/api/types';
import { queueDailyEntry } from '@/offline';
import { cachedRead } from '@/offline/ref-cache';
import { buildSimplePayload, caresToDo, careBucket, validateSimple, type SimpleEntryInput } from './simple-logic';
import { markDone, useSimpleSession } from './simpleSession';

/** Open bands of the active farm (offline: the cached list). */
export function useOpenBands() {
  const { farmId } = useAuth();
  const query = useQuery({ queryKey: ['batches', farmId], queryFn: () => fetchBatches(farmId) });
  const bands = useMemo(() => (query.data ?? []).filter((b) => b.status !== 'CLOTURE'), [query.data]);
  return { bands, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch };
}

/** Today's daily entry of a band, as last known on this phone. */
export function useDayEntry(band: BatchWithMetrics | null) {
  const { farmId } = useAuth();
  const query = useQuery({
    queryKey: ['daily-entries', farmId, band?.id],
    queryFn: () => fetchDailyEntries(farmId, band!.id),
    enabled: !!band,
  });
  const today = todayStr();
  const entry = useMemo<DailyEntryRecord | null>(() => (query.data ?? []).find((e) => e.entryDate === today) ?? null, [query.data, today]);
  return { entry, today, isFetching: query.isFetching, isFetched: query.isFetched };
}

/** Feed stock suggestions (FEFO lot per phase), for the automatic feed choice. */
export function useFeedStock() {
  const { farmId } = useAuth();
  return useQuery({ queryKey: ['feed-stock', farmId], queryFn: () => fetchFeedStock(farmId), staleTime: 60_000 });
}

/** Planned cares of a band, and those due today or late. */
export function useBandCares(band: BatchWithMetrics | null) {
  const { farmId } = useAuth();
  const query = useQuery({
    queryKey: ['prophylaxis', farmId, band?.id],
    queryFn: () => fetchProphylaxis(farmId, band!.id),
    enabled: !!band,
  });
  const { caresDone } = useSimpleSession();
  const today = todayStr();
  const todo = useMemo<ProphylaxisEvent[]>(
    () => caresToDo((query.data ?? []).filter((e) => !caresDone.includes(e.id)), today),
    [query.data, today, caresDone],
  );
  const late = todo.filter((e) => careBucket(e, today) === 'late').length;
  return { todo, late, dueToday: todo.length - late, isLoading: query.isLoading };
}

/** Weighing rule of the programme for the band (null until known, e.g. never loaded offline). */
export function useBandWeighing(band: BatchWithMetrics | null): WeighingStatus | null {
  const { farmId } = useAuth();
  const query = useQuery({
    queryKey: ['band-sheet', farmId, band?.id],
    queryFn: () => cachedRead(`band-sheet.${farmId}.${band!.id}`, () => fetchBandSheet(farmId, band!.id)),
    enabled: !!band,
    staleTime: 10 * 60_000,
  });
  return query.data?.weighing ?? null;
}

/** Whether the programme's weighing is due today or late (null when unknown). */
export function isWeighingDue(w: WeighingStatus | null, today: string): boolean | null {
  if (!w) return null;
  return w.late || w.nextDueDate.slice(0, 10) <= today;
}

/** Unresolved red alerts of the farm, newest first (offline: the cached advisory). */
export function useRedAlerts(): Alert[] {
  const { farmId } = useAuth();
  const query = useQuery({ queryKey: ['advisory', farmId], queryFn: () => fetchAdvisory(farmId) });
  return useMemo(
    () =>
      (query.data?.alerts ?? [])
        .filter((a) => a.level === 'ROUGE' && a.status !== 'ACQUITTEE' && a.status !== 'RESOLUE')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [query.data],
  );
}

export type SaveOutcome = { ok: true; queued: boolean } | { ok: false; message: string };

/**
 * Validates one simple answer and saves it through the offline queue, merged
 * into the day's entry. Never throws: the caller shows the outcome.
 */
export function useSaveSimpleEntry(band: BatchWithMetrics | null, existing: DailyEntryRecord | null, today: string) {
  const { farmId } = useAuth();
  const queryClient = useQueryClient();
  return useCallback(
    async (input: SimpleEntryInput): Promise<SaveOutcome> => {
      if (!band) return { ok: false, message: 'Choisissez d’abord une bande.' };
      const refusal = validateSimple(input, { live: band.metrics.liveCount, existing });
      if (refusal) return { ok: false, message: refusal };
      try {
        const result = await queueDailyEntry(farmId, band.id, buildSimplePayload(input, today, existing));
        if (result.status === 'sent') {
          invalidateFarmQueries(queryClient, { farmId, batchId: band.id });
          void queryClient.invalidateQueries({ queryKey: ['daily-entries', farmId, band.id] });
        }
        markDone(today, band.id, input.kind);
        return { ok: true, queued: result.status === 'queued' };
      } catch {
        return { ok: false, message: 'Impossible d’enregistrer. Recommencez.' };
      }
    },
    [band, existing, farmId, queryClient, today],
  );
}
