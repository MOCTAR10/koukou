import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Egg, Wheat } from 'lucide-react';
import { api } from '../../api/client';
import type { FlockDashboard, Lot } from '../../api/types-flock';
import { useFarm } from '../../app/FarmContext';
import { lotImage } from '../../lib/animalImages';
import { num } from '../../lib/format';
import { PhotoThumb } from '../ui';
import { weightedMean } from '../../lib/weightedMean';
import type { FarmIndicators } from '../../api/types';
import { kindLabel, lotName, Metric } from './shared';

/**
 * Laying rate of a species/type group: the server's hen-days weighted value of its species;
 * the lots' own rates weighted by headcount only when the server has none (past date, old server).
 */
function groupLayRate(items: Lot[], farmIndicators: FarmIndicators | undefined): number | null {
  const first = items[0];
  if (!first || first.type !== 'PONDEUSE') return null;
  const server = farmIndicators?.layingBySpecies.find(
    (g) => g.species === (first.species ?? 'POULET') && (g.customSpecies ?? null) === (first.customSpecies ?? null),
  );
  if (server) return server.layRatePercent;
  return weightedMean(items.map((b) => ({ value: b.metrics.layRatePercent, weight: b.metrics.liveCount })));
}

/**
 * Feed consumption and species/strain breakdown of the running lots, ported
 * from the mobile overview sheet. A past "situation au" date has no daily
 * health figure, so it falls back to feed over bird-days.
 */
export function LotsBreakdown({ lots, historical }: { lots: Lot[]; historical: boolean }) {
  const { farmId } = useFarm();
  // Farm indicators come from the server (hen-days weighted laying rate, feed per bird-day on the
  // birds present); a past "situation au" date has none, so it falls back to feed over bird-days.
  const dashboard = useQuery({
    queryKey: ['dashboard', farmId],
    queryFn: () => api.get<FlockDashboard>(`/farms/${farmId}/dashboard`),
    enabled: !!farmId && !historical,
    staleTime: 60_000,
  });
  const farmIndicators = historical ? undefined : dashboard.data?.farmIndicators;

  const totalFeedKg = lots.reduce((sum, b) => sum + (b.metrics.totalFeedKg ?? 0), 0);
  const totalBirds = lots.reduce((sum, b) => sum + b.metrics.liveCount, 0);

  const birdDays = lots.reduce((sum, b) => sum + Math.max(0, b.metrics.liveCount) * Math.max(1, b.metrics.ageDays), 0);
  const feedPerBirdDay =
    farmIndicators?.feedPerBirdDayKg != null
      ? farmIndicators.feedPerBirdDayKg * 1000
      : totalFeedKg > 0 && birdDays > 0
        ? (totalFeedKg * 1000) / birdDays
        : null;

  const groups = useMemo(() => {
    const byKey = new Map<string, { label: string; items: Lot[] }>();
    for (const b of lots) {
      const key = `${b.species ?? 'POULET'}|${b.type}`;
      const group = byKey.get(key) ?? { label: kindLabel(b), items: [] };
      group.items.push(b);
      byKey.set(key, group);
    }
    return [...byKey.values()].map(({ label, items }) => {
      return {
        label,
        items,
        birds: items.reduce((sum, b) => sum + b.metrics.liveCount, 0),
        eggs: items.reduce((sum, b) => sum + (b.metrics.eggsCollectedTotal ?? 0), 0),
        feedKg: items.reduce((sum, b) => sum + (b.metrics.totalFeedKg ?? 0), 0),
        layRate: groupLayRate(items, farmIndicators),
      };
    });
  }, [lots, farmIndicators]);

  if (lots.length === 0) return null;

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <div className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Wheat className="h-3.5 w-3.5 text-brand-600" /> Consommation alimentaire
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Aliment distribué" value={totalFeedKg > 0 ? `${num(totalFeedKg, 0)} kg` : '—'} />
          <Metric label="Par oiseau / jour" value={feedPerBirdDay != null ? `${num(feedPerBirdDay, 0)} g` : '—'} />
        </div>
      </div>
      <div className="space-y-2 lg:col-span-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Egg className="h-3.5 w-3.5 text-accent-700" /> Espèces et souches
        </h3>
        <div className="grid gap-2 md:grid-cols-2">
          {groups.map((g) => {
            const share = totalBirds > 0 ? Math.round((g.birds / totalBirds) * 100) : 0;
            return (
              <div key={g.label} className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-semibold text-slate-800">{g.label}</span>
                  <span className="shrink-0 tabular-nums text-slate-700">
                    {num(g.birds, 0)} <span className="text-xs text-slate-500">({share} %)</span>
                  </span>
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${share}%` }} />
                </div>
                <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                  <span>{g.eggs > 0 ? `${num(g.eggs, 0)} œufs` : 'Aucun œuf collecté'}</span>
                  {g.layRate != null ? <span>{num(g.layRate, 0)} % ponte</span> : null}
                  {g.feedKg > 0 ? <span>{num(g.feedKg, 0)} kg alim.</span> : null}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {g.items.map((b) => (
                    <li key={b.id} className="flex items-center gap-2 text-xs">
                      <PhotoThumb src={lotImage(b.breedName, b.species)} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-800">
                          {[b.breedCode, b.breedName ?? b.customBreed].filter(Boolean).join(' · ') || lotName(b)}
                        </span>
                        <span className="block truncate text-slate-500">
                          {lotName(b)} · J{b.metrics.ageDays}
                          {b.metrics.fcr != null ? ` · IC ${num(b.metrics.fcr, 2)}` : ''}
                          {(b.metrics.eggsCollectedTotal ?? 0) > 0 ? ` · ${num(b.metrics.eggsCollectedTotal, 0)} œufs` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-slate-700">
                        {num(b.metrics.liveCount, 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
