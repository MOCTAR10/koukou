import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MAP_TILE_ATTRIBUTION, MAP_TILE_MAX_ZOOM, MAP_TILE_SUBDOMAINS, MAP_TILE_URL } from '../../lib/mapTiles';

/** Small map of one farm (its registry GPS point), loaded on demand. Without tiles (offline) the point stays on a plain background. */
export default function FarmMiniMap({ latitude, longitude, label }: { latitude: number; longitude: number; label: string }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true }).setView([latitude, longitude], 11);
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      L.tileLayer(MAP_TILE_URL, { maxZoom: MAP_TILE_MAX_ZOOM, subdomains: MAP_TILE_SUBDOMAINS, attribution: MAP_TILE_ATTRIBUTION }).addTo(map);
    }
    L.circleMarker([latitude, longitude], { radius: 8, color: '#ffffff', weight: 2, fillColor: '#206080', fillOpacity: 1 }).bindTooltip(label).addTo(map);
    return () => {
      map.remove();
    };
  }, [latitude, longitude, label]);
  return <div ref={container} role="img" aria-label={`Position de la ferme ${label}`} className="h-44 w-full overflow-hidden rounded-xl" style={{ background: '#e8eef2' }} />;
}
