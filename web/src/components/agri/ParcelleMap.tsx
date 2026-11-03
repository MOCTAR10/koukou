import { lazy, Suspense, useEffect, useState, useSyncExternalStore, type ComponentType } from 'react';
import { CalendarClock, MapPinOff, Pencil, RefreshCw, WifiOff, X } from 'lucide-react';
import type { Parcelle } from '../../api/types-agri';
import { useFarm } from '../../app/FarmContext';
import { useFarmProfile } from '../../app/useFarmProfile';
import { classNames, num } from '../../lib/format';
import { isOnline, onReconnect, subscribeConnectivity } from '../../offline/connectivity';
import { Note } from '../flock/shared';
import { Button } from '../form';
import { Card, Loading } from '../ui';
import { ParcelleStatusBadge, StageSummary } from './AgriBits';
import {
  CROP_CATEGORY_LABELS,
  cultureStage,
  formatArea,
  PARCELLE_STATUS_LABELS,
  PARCELLE_STATUS_ORDER,
  PARCELLE_STATUS_STROKE,
} from './agri';
import type { ParcelleMapCanvasProps } from './ParcelleMapCanvas';

/** Stands in for the map when its code can't be fetched: the panel shows the list instead. */
function CanvasUnavailable({ onTilesFailed }: ParcelleMapCanvasProps) {
  useEffect(onTilesFailed, [onTilesFailed]);
  return null;
}

// Leaflet stays out of the main bundle. A failed chunk must not crash the page.
const ParcelleMapCanvas = lazy<ComponentType<ParcelleMapCanvasProps>>(() =>
  import('./ParcelleMapCanvas').catch(() => ({ default: CanvasUnavailable })),
);

/**
 * "Carte" view of the parcels. The background needs a connection: without one,
 * the parcels stay readable as a list rather than sitting on an empty grey map.
 */
export function ParcelleMapPanel({
  parcelles,
  selectedId,
  onSelect,
  onEdit,
}: {
  parcelles: Parcelle[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onEdit: (parcelle: Parcelle) => void;
}) {
  const { farm } = useFarm();
  const { hasPermission } = useFarmProfile();
  const online = useSyncExternalStore(subscribeConnectivity, isOnline);
  const [tilesFailed, setTilesFailed] = useState(false);

  useEffect(() => onReconnect(() => setTilesFailed(false)), []);

  const selected = parcelles.find((p) => p.id === selectedId) ?? null;
  const drawn = parcelles.filter((p) => p.boundaryGeoJson).length;
  const canManage = hasPermission('agri:gerer');

  const detail = selected ? (
    <SelectedParcelle
      parcelle={selected}
      onClear={() => onSelect(null)}
      onEdit={canManage ? () => onEdit(selected) : undefined}
    />
  ) : null;

  if (!online || tilesFailed) {
    return (
      <div className="space-y-4">
        <Note tone="amber" icon={<WifiOff />}>
          {online
            ? 'Le fond de carte n’a pas pu se charger. Voici vos parcelles en liste.'
            : 'Hors ligne : le fond de carte ne peut pas se charger. Voici vos parcelles en liste, la carte reviendra avec la connexion.'}
        </Note>
        {online ? (
          <Button tone="secondary" onClick={() => setTilesFailed(false)}>
            <RefreshCw className="h-4 w-4" /> Réessayer
          </Button>
        ) : null}
        {detail}
        <Card className="divide-y divide-slate-100">
          {parcelles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={classNames(
                'flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50',
                p.id === selectedId && 'bg-brand-50',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-900">{p.name}</span>
                <span className="block truncate text-xs text-slate-500">
                  {p.culture.name} · {formatArea(p)}
                </span>
              </span>
              <ParcelleStatusBadge status={p.status} />
            </button>
          ))}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {drawn === 0 ? (
        <Note tone="slate" icon={<MapPinOff />}>
          Aucune parcelle n’a encore de contour GPS : la carte montre la position de la ferme, sans parcelle dessinée.
        </Note>
      ) : null}
      {/* `isolate` keeps Leaflet's high z-indexes under the sticky header and the modals. */}
      <div className="relative isolate h-[26rem] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        <Suspense
          fallback={
            <div className="p-4">
              <Loading label="Chargement de la carte…" />
            </div>
          }
        >
          <ParcelleMapCanvas
            farm={farm}
            parcelles={parcelles}
            selectedId={selectedId}
            onSelect={onSelect}
            onTilesFailed={() => setTilesFailed(true)}
          />
        </Suspense>
        <span className="pointer-events-none absolute bottom-2.5 left-2.5 z-[1000] rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700">
          {num(parcelles.length, 0)} parcelle{parcelles.length > 1 ? 's' : ''}
        </span>
      </div>
      {detail}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {PARCELLE_STATUS_ORDER.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PARCELLE_STATUS_STROKE[s] }} />
            {PARCELLE_STATUS_LABELS[s]}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SelectedParcelle({
  parcelle,
  onClear,
  onEdit,
}: {
  parcelle: Parcelle;
  onClear: () => void;
  onEdit?: () => void;
}) {
  const stage = parcelle.status === 'ACTIVE' ? cultureStage(parcelle.plantedAt, parcelle.culture.defaultCycleDays) : null;
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
            {parcelle.name}
            <ParcelleStatusBadge status={parcelle.status} />
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {parcelle.culture.name} · {CROP_CATEGORY_LABELS[parcelle.culture.category]} · {formatArea(parcelle)}
          </p>
        </div>
        <button onClick={onClear} className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Fermer la fiche">
          <X className="h-4 w-4" />
        </button>
      </div>
      {stage ? <StageSummary stage={stage} culture={parcelle.culture} /> : null}
      {!stage && !parcelle.plantedAt ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <CalendarClock className="h-3.5 w-3.5" /> Non plantée
        </p>
      ) : null}
      {onEdit ? (
        <Button tone="secondary" onClick={onEdit}>
          <Pencil className="h-4 w-4" /> Modifier la parcelle
        </Button>
      ) : null}
    </Card>
  );
}
