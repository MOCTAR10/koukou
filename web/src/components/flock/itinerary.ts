import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

/** One step of the technical itinerary (`GET /programme/itinerary`, REFERENCE). */
export interface ItineraryStep {
  id: string;
  species: string;
  productionType: string;
  dayFrom: number;
  /** Null = until the end of the band. */
  dayTo: number | null;
  feedPhase: string | null;
  title: string;
  instructions: string;
  category: string;
  /** Code of a TEXTE_REFERENCE list item (e.g. DECRET_0190_2022). */
  legalRef: string | null;
  sort: number;
  active: boolean;
}

/**
 * Active steps of a species and production type, ordered by age. Reference
 * data owned by the server: not farm data, so the key carries no farmId. A
 * failed read (offline) leaves `data` undefined and the callers fall back to
 * their built-in mapping.
 */
export function useItinerary(species: string | undefined, productionType: string | undefined) {
  return useQuery({
    queryKey: ['programme-itinerary', species ?? null, productionType ?? null],
    queryFn: () =>
      api.get<ItineraryStep[]>(
        `/programme/itinerary?species=${encodeURIComponent(species ?? '')}&type=${encodeURIComponent(productionType ?? '')}`,
      ),
    staleTime: 30 * 60_000,
    enabled: !!species && !!productionType,
  });
}

/** Feed phase of the step covering `ageDays` (same rule as the server's `feedPhaseAt`), or null. */
export function feedPhaseAt(steps: readonly ItineraryStep[], ageDays: number): string | null {
  let best: ItineraryStep | null = null;
  for (const s of steps) {
    if (!s.feedPhase || s.active === false) continue;
    if (ageDays < s.dayFrom) continue;
    if (s.dayTo != null && ageDays > s.dayTo) continue;
    if (!best || s.dayFrom > best.dayFrom) best = s;
  }
  return best?.feedPhase ?? null;
}
