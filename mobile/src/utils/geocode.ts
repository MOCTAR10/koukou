/** Géocodage open-source via Photon (OpenStreetMap) — restreint au Gabon. */
export interface GeoResult {
  latitude: number;
  longitude: number;
  label: string;
  city?: string;
  province?: string;
}

export type GeoSuggest = GeoResult;

const PHOTON_URL = 'https://photon.komoot.io/api/';
const GEOCODE_TIMEOUT_MS = 8000;

async function photonFetch(url: string): Promise<GeoResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: { geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> }[] };
    return (data.features ?? [])
      .filter((f) => f.geometry?.coordinates?.length === 2)
      .map((f) => {
        const [lon, lat] = f.geometry!.coordinates!;
        const p = f.properties ?? {};
        const parts = [p.name, p.street, p.city, p.state, p.country].filter(Boolean);
        return {
          latitude: lat,
          longitude: lon,
          label: parts.join(', '),
          city: typeof p.city === 'string' ? p.city : undefined,
          province: typeof p.state === 'string' ? p.state : undefined,
        };
      });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Recherche dynamique (au fil de la frappe) d'une adresse au Gabon, cadrée par province si sélectionnée. */
export async function suggestGabonAddress(query: string, province?: string): Promise<GeoSuggest[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const parts = [trimmed, province, 'Gabon'].filter(Boolean);
  const url = `${PHOTON_URL}?q=${encodeURIComponent(parts.join(', '))}&limit=6&lang=fr`;
  const results = await photonFetch(url);
  if (!province) return results;
  // Prioritize results in the selected province
  const inProvince = results.filter((r) => r.province?.toLowerCase().includes(province.toLowerCase()));
  const outside = results.filter((r) => !r.province?.toLowerCase().includes(province.toLowerCase()));
  return [...inProvince, ...outside].slice(0, 6);
}

/** Géocodage ponctuel (au moment de l'enregistrement). */
export async function geocodeGabonAddress(parts: { province?: string; address?: string }): Promise<GeoResult | null> {
  const query = [parts.address?.trim(), parts.province?.trim(), 'Gabon'].filter(Boolean).join(', ');
  if (!query) return null;
  const url = `${PHOTON_URL}?q=${encodeURIComponent(query)}&limit=1&lang=fr`;
  const results = await photonFetch(url);
  return results[0] ?? null;
}