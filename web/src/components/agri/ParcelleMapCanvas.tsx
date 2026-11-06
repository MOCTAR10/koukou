import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Parcelle } from '../../api/types-agri';
import type { Farm } from '../../api/types';
import { PARCELLE_STATUS_STROKE } from './agri';

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
/** Same fallback point as the mobile map when the farm has no position. */
const DEFAULT_CENTER: L.LatLngTuple = [-0.6, 9.45];
const COUNTRY_ZOOM = 7;
const FARM_ZOOM = 14;
const BRAND_STROKE = '#0C2331';
const TILE_ERRORS_BEFORE_GIVING_UP = 4;

/** Tooltips render strings as HTML: names typed by users must go in as text. */
function textNode(text: string): HTMLElement {
  const el = document.createElement('span');
  el.textContent = text;
  return el;
}

export interface ParcelleMapCanvasProps {
  farm: Farm | null;
  parcelles: Parcelle[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onTilesFailed: () => void;
}

/** Leaflet map, loaded on demand: tiles from OpenStreetMap, no API key. */
export default function ParcelleMapCanvas({
  farm,
  parcelles,
  selectedId,
  onSelect,
  onTilesFailed,
}: ParcelleMapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const shapes = useRef<L.LayerGroup | null>(null);
  const framedFor = useRef<string | null>(null);
  const focused = useRef<string | null>(null);
  const callbacks = useRef({ onSelect, onTilesFailed });
  callbacks.current = { onSelect, onTilesFailed };

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { scrollWheelZoom: false }).setView(DEFAULT_CENTER, COUNTRY_ZOOM);
    let loaded = false;
    let errors = 0;
    L.tileLayer(OSM_URL, { maxZoom: 19, attribution: OSM_ATTRIBUTION })
      .on('tileload', () => {
        loaded = true;
      })
      .on('tileerror', () => {
        errors += 1;
        // A few missing tiles are normal; none at all means no usable background.
        if (!loaded && errors >= TILE_ERRORS_BEFORE_GIVING_UP) callbacks.current.onTilesFailed();
      })
      .addTo(instance);
    map.current = instance;
    shapes.current = L.layerGroup().addTo(instance);
    return () => {
      instance.remove();
      map.current = null;
      shapes.current = null;
    };
  }, []);

  const farmLat = farm?.latitude ?? null;
  const farmLng = farm?.longitude ?? null;
  const farmName = farm?.name ?? 'Ma ferme';

  useEffect(() => {
    const instance = map.current;
    const group = shapes.current;
    if (!instance || !group) return;
    group.clearLayers();

    const bounds = L.latLngBounds([]);
    let selectedBounds: L.LatLngBounds | null = null;

    if (farmLat != null && farmLng != null) {
      L.circleMarker([farmLat, farmLng], {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: BRAND_STROKE,
        fillOpacity: 1,
      })
        .bindTooltip(textNode(farmName))
        .addTo(group);
      bounds.extend([farmLat, farmLng]);
    }

    for (const p of parcelles) {
      if (!p.boundaryGeoJson) continue;
      const selected = p.id === selectedId;
      const stroke = PARCELLE_STATUS_STROKE[p.status];
      const shape = L.geoJSON(p.boundaryGeoJson as unknown as Parameters<typeof L.geoJSON>[0], {
        style: {
          color: selected ? BRAND_STROKE : stroke,
          weight: selected ? 3.5 : 2,
          fillColor: stroke,
          fillOpacity: 0.35,
        },
      });
      const shapeBounds = shape.getBounds();
      if (!shapeBounds.isValid()) continue;
      shape
        .bindTooltip(textNode(`${p.name} · ${p.culture.name}`))
        .on('click', () => callbacks.current.onSelect(p.id))
        .addTo(group);
      bounds.extend(shapeBounds);
      if (selected) selectedBounds = shapeBounds;
    }

    // Reframe when the content changes, never because a parcel was picked on the map.
    const frameKey = JSON.stringify([farmLat, farmLng, parcelles.map((p) => (p.boundaryGeoJson ? p.id : null))]);
    if (framedFor.current !== frameKey) {
      framedFor.current = frameKey;
      if (parcelles.some((p) => p.boundaryGeoJson) && bounds.isValid()) {
        instance.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
      } else if (farmLat != null && farmLng != null) {
        instance.setView([farmLat, farmLng], FARM_ZOOM);
      }
    }
    if (selectedId !== focused.current) {
      focused.current = selectedId;
      if (selectedBounds) instance.fitBounds(selectedBounds, { padding: [48, 48], maxZoom: 18 });
    }
  }, [parcelles, selectedId, farmLat, farmLng, farmName]);

  return <div ref={container} className="h-full w-full" />;
}
