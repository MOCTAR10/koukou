import { describe, expect, it } from 'vitest';

import {
  centerOfRing,
  geoCoordToLatLng,
  geoJsonOuterRing,
  parcelleCenter,
  parcellesCenter,
  parcellesSpanDelta,
  ringLatDelta,
} from './geo';
import type { GeoJsonGeometry, Parcelle } from '@/api/types';

const square: GeoJsonGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};

const multi: GeoJsonGeometry = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [10, 10],
        [11, 10],
        [10, 11],
        [10, 10],
      ],
    ],
  ],
};

const culture = {
  id: 'c1',
  name: 'Plantain',
  category: 'TUBERCULE' as const,
  defaultCycleDays: 330,
  waterNeedsLPlantDay: 12,
  notes: null,
};

function parcelle(boundaryGeoJson: GeoJsonGeometry | null): Parcelle {
  return {
    id: 'p1',
    farmId: 'f1',
    name: 'Parcelle A',
    culture,
    cultureId: culture.id,
    areaHa: 1.5,
    areaM2: 15000,
    boundaryGeoJson,
    plantedAt: null,
    status: 'ACTIVE',
    notes: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  };
}

describe('geoCoordToLatLng', () => {
  it('convertit [lng, lat] en {latitude, longitude}', () => {
    expect(geoCoordToLatLng([45.5, -1.2])).toEqual({ latitude: -1.2, longitude: 45.5 });
  });

  it('retourne null pour des coordonnées invalides', () => {
    expect(geoCoordToLatLng([])).toBeNull();
    expect(geoCoordToLatLng([10])).toBeNull();
    expect(geoCoordToLatLng([181, 0])).toBeNull();
    expect(geoCoordToLatLng([0, 91])).toBeNull();
    expect(geoCoordToLatLng([NaN, 0])).toBeNull();
  });
});

describe('geoJsonOuterRing', () => {
  it('extrait l’anneau extérieur d’un Polygon', () => {
    const ring = geoJsonOuterRing(square);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual({ latitude: 0, longitude: 0 });
  });

  it('extrait le premier anneau d’un MultiPolygon', () => {
    const ring = geoJsonOuterRing(multi);
    expect(ring).toHaveLength(4);
    expect(ring[0]).toEqual({ latitude: 10, longitude: 10 });
  });

  it('retourne une liste vide sans géométrie', () => {
    expect(geoJsonOuterRing(null)).toEqual([]);
  });
});

describe('centerOfRing', () => {
  it('calcule le centroïde moyen', () => {
    expect(centerOfRing([{ latitude: 0, longitude: 0 }, { latitude: 10, longitude: 10 }])).toEqual({
      latitude: 5,
      longitude: 5,
    });
  });

  it('retourne null sur un anneau vide', () => {
    expect(centerOfRing([])).toBeNull();
  });
});

describe('parcelleCenter / parcellesCenter', () => {
  it('utilise le contour de la parcelle', () => {
    expect(parcelleCenter(parcelle(square))).toEqual({ latitude: 0.5, longitude: 0.5 });
  });

  it('retourne null sans contour', () => {
    expect(parcelleCenter(parcelle(null))).toBeNull();
  });

  it('moyenne sur plusieurs parcelles avec contours', () => {
    const p2 = { ...parcelle(multi), id: 'p2' };
    expect(parcellesCenter([parcelle(square), p2])).toEqual({ latitude: 5.416666666666667, longitude: 5.416666666666667 });
  });

  it('retourne null sans aucune géométrie', () => {
    expect(parcellesCenter([parcelle(null)])).toBeNull();
  });
});

describe('ringLatDelta', () => {
  it('calcule l’étendue en latitude', () => {
    expect(ringLatDelta(geoJsonOuterRing(square))).toBe(1);
  });

  it('force un minimum non nul', () => {
    expect(ringLatDelta([])).toBe(0.001);
  });
});

describe('parcellesSpanDelta', () => {
  const square = (lat: number, lng: number, side: number) =>
    ({
      boundaryGeoJson: {
        type: 'Polygon',
        coordinates: [[[lng, lat], [lng + side, lat], [lng + side, lat + side], [lng, lat + side], [lng, lat]]],
      },
    }) as never;

  it('covers every parcel, not only the first', () => {
    expect(parcellesSpanDelta([square(0, 9, 0.001), square(0.05, 9, 0.001)])).toBeCloseTo(0.051);
  });

  it('counts an east-west spread too', () => {
    expect(parcellesSpanDelta([square(0, 9, 0.001), square(0, 9.2, 0.001)])).toBeCloseTo(0.201);
  });

  it('has a small default with no outline', () => {
    expect(parcellesSpanDelta([{ boundaryGeoJson: null } as never])).toBe(0.001);
  });
});
