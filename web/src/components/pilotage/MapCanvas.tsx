import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapCluster, MapPoint } from '../../api/types-pilotage';
import { COUNTRY_ZOOM, GABON_CENTER, clusterRadius, colourOf, levelOn, type ColourKey } from './mapKeys';

import { GABON_BOUNDS, GABON_MIN_ZOOM, MAP_TILE_ATTRIBUTION, MAP_TILE_MAX_ZOOM, MAP_TILE_SUBDOMAINS, MAP_TILE_URL } from '../../lib/mapTiles';
const TILE_ERRORS_BEFORE_GIVING_UP = 4;

export interface PilotageMapCanvasProps {
  points: MapPoint[];
  clusters: MapCluster[];
  colourKey: ColourKey;
  showClusters: boolean;
  /** Text lines of a point's / a cluster's tooltip (built by the view, French). */
  pointLines: (p: MapPoint) => string[];
  clusterLines: (c: MapCluster) => string[];
  /** No tile could load (offline, blocked): the marks stay, on a plain background. */
  onTilesFailed: () => void;
}

/** Tooltips render strings as HTML: farm names typed by users go in as text. */
function linesNode(lines: string[]): HTMLElement {
  const el = document.createElement('div');
  lines.forEach((line, i) => {
    const row = document.createElement('div');
    row.textContent = line;
    if (i === 0) row.style.fontWeight = '600';
    el.appendChild(row);
  });
  return el;
}

/**
 * Leaflet map of the programme farms (registry GPS) and province clusters,
 * loaded on demand. Tiles from a configurable light basemap (lib/mapTiles.ts); without them (offline) the
 * map keeps its marks on a plain background: the data never depends on tiles.
 */
export default function PilotageMapCanvas({ points, clusters, colourKey, showClusters, pointLines, clusterLines, onTilesFailed }: PilotageMapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marks = useRef<L.LayerGroup | null>(null);
  const framed = useRef<string | null>(null);
  const callbacks = useRef({ onTilesFailed, pointLines, clusterLines });
  callbacks.current = { onTilesFailed, pointLines, clusterLines };

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, {
      scrollWheelZoom: false,
      minZoom: GABON_MIN_ZOOM,
      maxBounds: GABON_BOUNDS,
      maxBoundsViscosity: 1,
    }).setView(GABON_CENTER, COUNTRY_ZOOM);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      callbacks.current.onTilesFailed();
    } else {
      let loaded = false;
      let errors = 0;
      const tiles = L.tileLayer(MAP_TILE_URL, { maxZoom: MAP_TILE_MAX_ZOOM, subdomains: MAP_TILE_SUBDOMAINS, attribution: MAP_TILE_ATTRIBUTION });
      tiles
        .on('tileload', () => {
          loaded = true;
        })
        .on('tileerror', () => {
          errors += 1;
          // A few missing tiles are normal; none at all means no usable background.
          if (!loaded && errors >= TILE_ERRORS_BEFORE_GIVING_UP) {
            instance.removeLayer(tiles);
            callbacks.current.onTilesFailed();
          }
        })
        .addTo(instance);
    }
    map.current = instance;
    marks.current = L.layerGroup().addTo(instance);
    return () => {
      instance.remove();
      map.current = null;
      marks.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    const group = marks.current;
    if (!instance || !group) return;
    group.clearLayers();
    const bounds = L.latLngBounds([]);

    if (showClusters) {
      for (const c of clusters) {
        if (!c.centroid) continue;
        const colour = colourOf(c.suppressed ? null : levelOn(c.colours, colourKey));
        L.circleMarker([c.centroid.latitude, c.centroid.longitude], {
          radius: clusterRadius(c.farms),
          color: colour,
          weight: 2,
          fillColor: colour,
          fillOpacity: 0.25,
          dashArray: c.suppressed ? '4 4' : undefined,
        })
          .bindTooltip(linesNode(callbacks.current.clusterLines(c)))
          .addTo(group);
        bounds.extend([c.centroid.latitude, c.centroid.longitude]);
      }
    }
    for (const p of points) {
      L.circleMarker([p.latitude, p.longitude], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: colourOf(levelOn(p.colours, colourKey)),
        fillOpacity: 1,
      })
        .bindTooltip(linesNode(callbacks.current.pointLines(p)))
        .addTo(group);
      bounds.extend([p.latitude, p.longitude]);
    }

    // Reframe when the set of marks changes, never because the colour key did.
    const signature = `${showClusters}|${points.map((p) => p.farmId).join(',')}|${clusters.map((c) => c.provinceId).join(',')}`;
    if (framed.current !== signature) {
      framed.current = signature;
      if (bounds.isValid()) instance.fitBounds(bounds.pad(0.15), { maxZoom: 10 });
      else instance.setView(GABON_CENTER, COUNTRY_ZOOM);
    }
  }, [points, clusters, colourKey, showClusters]);

  // Inline background: leaflet.css (unlayered) would beat a Tailwind class. It is the plain background without tiles.
  return (
    <div
      ref={container}
      style={{ background: '#f1f5f9' }}
      className="h-[28rem] w-full rounded-xl ring-1 ring-slate-200"
      role="region"
      aria-label="Carte des fermes du programme"
    />
  );
}
