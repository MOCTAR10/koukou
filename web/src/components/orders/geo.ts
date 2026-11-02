/** Open-source geocoding through Photon (OpenStreetMap), restricted to Gabon. */
export interface GeoResult {
  latitude: number;
  longitude: number;
  label: string;
  province?: string;
}

export const GABON_PROVINCES: { name: string; capital: string }[] = [
  { name: 'Estuaire', capital: 'Libreville' },
  { name: 'Haut-Ogooué', capital: 'Franceville' },
  { name: 'Moyen-Ogooué', capital: 'Lambaréné' },
  { name: 'Ngounié', capital: 'Mouila' },
  { name: 'Nyanga', capital: 'Tchibanga' },
  { name: 'Ogooué-Ivindo', capital: 'Makokou' },
  { name: 'Ogooué-Lolo', capital: 'Koulamoutou' },
  { name: 'Ogooué-Maritime', capital: 'Port-Gentil' },
  { name: 'Woleu-Ntem', capital: 'Oyem' },
];

const PHOTON_URL = 'https://photon.komoot.io/api/';
const GEOCODE_TIMEOUT_MS = 8000;

interface PhotonFeature {
  geometry?: { coordinates?: number[] };
  properties?: Record<string, unknown>;
}

/** The API refuses coordinates with more than 7 decimals. */
function round7(n: number): number {
  return Math.round(n * 1e7) / 1e7;
}

async function photonFetch(url: string): Promise<GeoResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: PhotonFeature[] };
    const seen = new Set<string>();
    const results: GeoResult[] = [];
    for (const f of data.features ?? []) {
      const coords = f.geometry?.coordinates;
      if (coords?.length !== 2) continue;
      const p = f.properties ?? {};
      const label = [p.name, p.street, p.city, p.state, p.country].filter(Boolean).join(', ');
      if (seen.has(label)) continue;
      seen.add(label);
      results.push({
        latitude: round7(coords[1]),
        longitude: round7(coords[0]),
        label,
        province: typeof p.state === 'string' ? p.state : undefined,
      });
    }
    return results;
  } catch {
    // The map service is a convenience: an address can always be typed by hand.
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Search-as-you-type, with results from the chosen province first. */
export async function suggestGabonAddress(query: string, province?: string | null): Promise<GeoResult[]> {
  const parts = [query.trim(), province, 'Gabon'].filter(Boolean);
  const results = await photonFetch(`${PHOTON_URL}?q=${encodeURIComponent(parts.join(', '))}&limit=6&lang=fr`);
  if (!province) return results;
  const wanted = province.toLowerCase();
  const inside = results.filter((r) => r.province?.toLowerCase().includes(wanted));
  const outside = results.filter((r) => !r.province?.toLowerCase().includes(wanted));
  return [...inside, ...outside].slice(0, 6);
}

/** One-shot lookup at save time, for an address typed by hand. */
export async function geocodeGabonAddress(parts: { province?: string | null; address?: string }): Promise<GeoResult | null> {
  const address = parts.address?.trim();
  const province = parts.province?.trim();
  if (!address && !province) return null;
  const query = [address, province, 'Gabon'].filter(Boolean).join(', ');
  const results = await photonFetch(`${PHOTON_URL}?q=${encodeURIComponent(query)}&limit=1&lang=fr`);
  return results[0] ?? null;
}
