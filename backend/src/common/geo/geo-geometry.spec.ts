import { describe, expect, it } from 'vitest';
import { geoJsonAreaHaFallback, isGeoJsonGeometry } from './geo-geometry.js';

describe('geo-geometry : contours de parcelle', () => {
  it('reconnaît un Polygon GeoJSON valide', () => {
    expect(
      isGeoJsonGeometry({ type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] }),
    ).toBe(true);
  });

  it('rejette les valeurs non géométriques', () => {
    expect(isGeoJsonGeometry(null)).toBe(false);
    expect(isGeoJsonGeometry({ type: 'Point', coordinates: [0, 0] })).toBe(false);
    expect(isGeoJsonGeometry({})).toBe(false);
  });

  it('calcule la surface d’un carré d’un hectare (~100 m × 100 m)', () => {
    // 100 m ≈ 0.000899° en latitude ; surface attendue ≈ 1 ha.
    const geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0, 0.000899],
          [0.000899, 0.000899],
          [0.000899, 0],
          [0, 0],
        ],
      ],
    } as const;
    const ha = geoJsonAreaHaFallback(geometry);
    expect(ha).not.toBeNull();
    expect(ha!).toBeGreaterThan(0.9);
    expect(ha!).toBeLessThan(1.1);
  });

  it('renvoie 0 pour un contour trop petit (moins de 4 points)', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [0, 0]]],
    } as const;
    expect(geoJsonAreaHaFallback(geometry)).toBe(0);
  });
});