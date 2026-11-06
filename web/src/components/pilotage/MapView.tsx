import { lazy, Suspense, useState, type ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPinOff, WifiOff } from 'lucide-react';
import { api } from '../../api/client';
import type { ColourLevel, MapCluster, MapPoint, PilotageMap } from '../../api/types-pilotage';
import { ErrorNote } from '../form';
import { Note, SectionCard, Tabs } from '../flock/shared';
import { DataTable, Loading, Td, Th } from '../ui';
import { periodError, pilotageQueryString, type PilotageFilters } from './filters';
import { countLabel, headsLabel, pctLabel, suppressedLabel } from './format';
import { COLOUR_KEYS, COLOUR_KEY_LABELS, colourOf, legendFor, levelOn, parseColourKey, type ColourKey } from './mapKeys';
import type { PilotageMapCanvasProps } from './MapCanvas';
import { ScopeBanner } from './shared';

function CanvasUnavailable() {
  return (
    <div className="flex h-[28rem] items-center justify-center rounded-xl bg-slate-100 p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">
      La carte n’a pas pu se charger sur cet appareil. Les provinces et les fermes restent listées ci-dessous.
    </div>
  );
}

const PilotageMapCanvas = lazy<ComponentType<PilotageMapCanvasProps>>(() =>
  import('./MapCanvas').catch(() => ({ default: CanvasUnavailable })),
);

const LEVEL_TEXT: Record<ColourLevel, string> = { VERT: 'vert', JAUNE: 'jaune', ROUGE: 'rouge' };

/**
 * Map of the programme (`GET /pilotage/map`, CDC row 38): farm points from the
 * registry GPS coloured by the chosen key, province clusters, and the farms
 * without GPS. An aggregate-only view gets clusters only (the server sends no point).
 */
export function MapView({ filters, colourKeyParam, onColourKey }: { filters: PilotageFilters; colourKeyParam: string | null; onColourKey: (k: ColourKey) => void }) {
  const invalid = periodError(filters);
  const qs = pilotageQueryString(filters);
  const query = useQuery({
    queryKey: ['pilotage-map', qs],
    queryFn: () => api.get<PilotageMap>(`/pilotage/map${qs}`),
    enabled: !invalid,
    retry: false,
  });
  const [tilesFailed, setTilesFailed] = useState(false);
  const [showClusters, setShowClusters] = useState(true);
  const key = parseColourKey(colourKeyParam);

  if (invalid) return null;
  if (query.isLoading) return <Loading label="Chargement de la carte…" />;
  if (query.error || !query.data) return <ErrorNote error={query.error ?? 'Carte indisponible.'} />;
  const d = query.data;
  const k = d.scope.minGroupSize;
  const legend = legendFor(key, d.legend);
  const valueOn = (v: { mortalityPct: number | null; completenessPct: number | null }) =>
    key === 'mortality' ? `Mortalité ${pctLabel(v.mortalityPct)}` : key === 'completeness' ? `Complétude ${pctLabel(v.completenessPct)}` : null;

  const pointLines = (p: MapPoint): string[] => {
    const level = levelOn(p.colours, key);
    return [
      `${p.code ? `${p.code} · ` : ''}${p.name}`,
      `${headsLabel(p.headcount)} · ${countLabel(p.activeBands, 'bande active', 'bandes actives')}`,
      valueOn(p) ?? `Alertes actives ${p.alerts.activeNow} (rouges ${p.alerts.activeRedNow}), publiées ${p.alerts.published}`,
      level ? `Niveau ${LEVEL_TEXT[level]}` : 'Pas de donnée sur la période',
    ];
  };
  const clusterLines = (c: MapCluster): string[] => {
    const head = `${c.code ? `${c.code} · ` : ''}${c.name} : ${countLabel(c.farms, 'ferme', 'fermes')} (${c.farmsWithGps} placées)`;
    if (c.suppressed) return [head, `Chiffres ${suppressedLabel(k)}`];
    return [
      head,
      `Effectif ${headsLabel(c.headcount)}`,
      `Mortalité ${pctLabel(c.mortalityPct)} · complétude ${pctLabel(c.completenessPct)}`,
      `Alertes actives ${c.alerts?.activeNow ?? 0}, publiées ${c.alerts?.published ?? 0}`,
    ];
  };

  return (
    <div className="space-y-4">
      <ScopeBanner scope={d.scope} period={d.period} generatedAt={d.generatedAt} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<ColourKey> value={key} onChange={onColourKey} options={COLOUR_KEYS.map((c) => ({ key: c, label: COLOUR_KEY_LABELS[c] }))} />
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showClusters} onChange={(e) => setShowClusters(e.target.checked)} />
          Regroupements par province
        </label>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-2">
          <Suspense fallback={<Loading label="Chargement de la carte…" />}>
            <PilotageMapCanvas
              points={d.points}
              clusters={d.clusters}
              colourKey={key}
              showClusters={showClusters || d.points.length === 0}
              pointLines={pointLines}
              clusterLines={clusterLines}
              onTilesFailed={() => setTilesFailed(true)}
            />
          </Suspense>
          {tilesFailed ? (
            <Note tone="slate" icon={<WifiOff className="h-4 w-4" />}>
              Fond de carte indisponible (hors ligne ou bloqué) : les fermes et les provinces restent placées sur un fond neutre.
            </Note>
          ) : null}
        </div>
        <div className="space-y-3">
          <SectionCard title={`Légende : ${COLOUR_KEY_LABELS[key].toLowerCase()}`}>
            <ul className="space-y-1.5 text-sm">
              {legend.map((i) => (
                <li key={i.level} className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: i.colour, boxShadow: '0 0 0 1px #cbd5e1' }} />
                  <span className="text-slate-700">{i.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              {key === 'mortality' ? d.legend.mortality.description : key === 'completeness' ? d.legend.completeness.description : d.legend.alert.description}
            </p>
            <p className="mt-2 text-xs text-slate-500">Cercles larges : une province (centre de sa limite, sinon moyenne de ses fermes) ; en pointillé, ses chiffres sont masqués.</p>
          </SectionCard>
          <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <MapPinOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <span>
              <strong className="tabular-nums">{d.farmsWithoutGps}</strong> ferme{d.farmsWithoutGps > 1 ? 's' : ''} sans position GPS au registre (absente
              {d.farmsWithoutGps > 1 ? 's' : ''} de la carte).
            </span>
          </div>
          {d.scope.aggregateOnly ? (
            <p className="text-xs text-slate-500">Données agrégées : la carte montre les provinces, jamais une ferme.</p>
          ) : null}
        </div>
      </div>

      <SectionCard title="Provinces" flush>
        <DataTable>
          <thead>
            <tr>
              <Th>Province</Th>
              <Th>Fermes</Th>
              <Th>Placées</Th>
              <Th>Effectif</Th>
              <Th>Mortalité</Th>
              <Th>Complétude</Th>
              <Th>Alertes</Th>
              <Th>Niveau</Th>
            </tr>
          </thead>
          <tbody>
            {d.clusters.map((c) => (
              <tr key={c.provinceId || 'none'}>
                <Td>
                  <span className="font-medium text-slate-800">{c.code ? `${c.code} · ` : ''}{c.name}</span>
                  {!c.centroid ? <span className="ml-1 text-xs text-slate-400">(non placée)</span> : null}
                </Td>
                <Td label="Fermes">{c.farms}</Td>
                <Td label="Placées">{c.farmsWithGps}</Td>
                {c.suppressed ? (
                  <Td label="Chiffres" className="italic text-slate-400">
                    {suppressedLabel(k)}
                  </Td>
                ) : (
                  <>
                    <Td label="Effectif">{headsLabel(c.headcount)}</Td>
                    <Td label="Mortalité">{pctLabel(c.mortalityPct)}</Td>
                    <Td label="Complétude">{pctLabel(c.completenessPct)}</Td>
                    <Td label="Alertes">
                      {c.alerts?.activeNow ?? 0} actives · {c.alerts?.published ?? 0} publiées
                    </Td>
                    <Td label="Niveau">
                      <LevelDot level={levelOn(c.colours, key)} />
                    </Td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </DataTable>
      </SectionCard>

      {d.points.length > 0 ? (
        <details className="rounded-2xl border border-slate-200 bg-white shadow-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">Fermes placées ({d.points.length})</summary>
          <DataTable>
            <thead>
              <tr>
                <Th>Ferme</Th>
                <Th>Province</Th>
                <Th>Effectif</Th>
                <Th>Mortalité</Th>
                <Th>Complétude</Th>
                <Th>Alertes</Th>
                <Th>Niveau</Th>
              </tr>
            </thead>
            <tbody>
              {d.points.map((p) => (
                <tr key={p.farmId}>
                  <Td>
                    <span className="font-medium text-slate-800">{p.code ? `${p.code} · ` : ''}{p.name}</span>
                  </Td>
                  <Td label="Province">{p.provinceCode ?? '—'}</Td>
                  <Td label="Effectif">{headsLabel(p.headcount)}</Td>
                  <Td label="Mortalité">{pctLabel(p.mortalityPct)}</Td>
                  <Td label="Complétude">{pctLabel(p.completenessPct)}</Td>
                  <Td label="Alertes">
                    {p.alerts.activeNow} actives · {p.alerts.published} publiées
                  </Td>
                  <Td label="Niveau">
                    <LevelDot level={levelOn(p.colours, key)} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </details>
      ) : null}
    </div>
  );
}

function LevelDot({ level }: { level: ColourLevel | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colourOf(level) }} />
      {level ? LEVEL_TEXT[level] : 'sans donnée'}
    </span>
  );
}
