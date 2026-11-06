import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { ProgrammePerimeter } from '../../api/types-pilotage';
import { Pill } from '../flock/shared';
import { isProgrammeBand } from '../pilotage/perimeter';

/** `GET /farms/:farmId/programme-perimeter` (POUFA lot A, F2), cached: a DGE parameter rarely changes. */
export function useProgrammePerimeter(farmId: string | null | undefined) {
  return useQuery({
    queryKey: ['programme-perimeter', farmId],
    queryFn: () => api.get<ProgrammePerimeter>(`/farms/${farmId}/programme-perimeter`),
    enabled: !!farmId,
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * « Hors programme » on a band whose species and type are not in
 * `BANDE_TYPES_ELIGIBLES`: it stays in the farm, but not in the programme
 * figures. Nothing while loading, on error, or for a programme band.
 */
export function ProgrammeBadge({ farmId, band }: { farmId: string | null | undefined; band: { species?: string | null; type?: string | null } }) {
  const perimeter = useProgrammePerimeter(farmId);
  if (!perimeter.data || isProgrammeBand(perimeter.data.eligibleBandTypes, band)) return null;
  return (
    <span title={perimeter.data.note}>
      <Pill tone="slate">Hors programme</Pill>
    </span>
  );
}
