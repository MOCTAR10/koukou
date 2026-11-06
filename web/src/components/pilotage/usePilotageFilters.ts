import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parsePilotageParams, pilotageParamsOf, type PilotageFilters } from './filters';

/** The steering filters, kept in the page URL (shared by the dashboard, the map and the objective). */
export function usePilotageFilters(): {
  filters: PilotageFilters;
  setFilters: (next: PilotageFilters) => void;
  params: URLSearchParams;
  setParam: (key: string, value: string | null) => void;
} {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parsePilotageParams(params), [params]);
  return {
    filters,
    params,
    setFilters: (next) => setParams((prev) => pilotageParamsOf(next, prev), { replace: true }),
    setParam: (key, value) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      ),
  };
}
