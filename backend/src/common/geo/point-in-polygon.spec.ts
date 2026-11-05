import { describe, expect, it } from 'vitest';
import type { GeoJsonMultiPolygon, GeoJsonPolygon } from './geo-geometry.js';
import { pointInGeometry, ringsAreClosed } from './point-in-polygon.js';

/** Axis-aligned closed ring [lng, lat] from (x0, y0) to (x1, y1). */
const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

const square: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [box(0, 0, 10, 10)],
};
const withHole: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [box(0, 0, 10, 10), box(4, 4, 6, 6)],
};
const twoIslands: GeoJsonMultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [[box(0, 0, 2, 2)], [box(5, 5, 8, 8), box(6, 6, 7, 7)]],
};

// pointInGeometry takes (latitude, longitude): y first.
describe('pointInGeometry (ray casting)', () => {
  it('square: inside / outside', () => {
    expect(pointInGeometry(5, 5, square)).toBe(true);
    expect(pointInGeometry(0.001, 9.999, square)).toBe(true);
    expect(pointInGeometry(11, 5, square)).toBe(false);
    expect(pointInGeometry(5, -0.001, square)).toBe(false);
    expect(pointInGeometry(-5, -5, square)).toBe(false);
  });

  it('counts a point on an edge or a vertex as inside', () => {
    expect(pointInGeometry(0, 5, square)).toBe(true); // bottom edge
    expect(pointInGeometry(5, 10, square)).toBe(true); // right edge
    expect(pointInGeometry(10, 10, square)).toBe(true); // vertex
    expect(pointInGeometry(0, 0, square)).toBe(true); // first vertex
  });

  it('a ray through a vertex is counted once', () => {
    const diamond: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [5, 0],
          [10, 5],
          [5, 10],
          [0, 5],
          [5, 0],
        ],
      ],
    };
    // The horizontal ray from (lng 1, lat 5) passes through vertex (10, 5).
    expect(pointInGeometry(5, 1, diamond)).toBe(true);
    expect(pointInGeometry(5, -1, diamond)).toBe(false);
    expect(pointInGeometry(5, 11, diamond)).toBe(false);
  });

  it('excludes the inside of a hole, keeps its boundary', () => {
    expect(pointInGeometry(5, 5, withHole)).toBe(false);
    expect(pointInGeometry(2, 2, withHole)).toBe(true);
    expect(pointInGeometry(4, 5, withHole)).toBe(true); // on the hole edge
  });

  it('MultiPolygon: any member counts, holes still apply', () => {
    expect(pointInGeometry(1, 1, twoIslands)).toBe(true);
    expect(pointInGeometry(5.5, 5.5, twoIslands)).toBe(true);
    expect(pointInGeometry(6.5, 6.5, twoIslands)).toBe(false); // hole
    expect(pointInGeometry(3.5, 3.5, twoIslands)).toBe(false); // between
  });

  it('accepts unclosed rings', () => {
    const open: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [box(0, 0, 10, 10).slice(0, 4)],
    };
    expect(pointInGeometry(5, 5, open)).toBe(true);
    expect(pointInGeometry(0, 5, open)).toBe(true); // closing edge
    expect(pointInGeometry(15, 5, open)).toBe(false);
  });

  it('handles negative coordinates (southern hemisphere, Gabon)', () => {
    const south: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [box(13, -2, 14, -1)],
    };
    expect(pointInGeometry(-1.63, 13.58, south)).toBe(true);
    expect(pointInGeometry(1.63, 13.58, south)).toBe(false);
  });
});

describe('ringsAreClosed', () => {
  it('detects an unclosed ring', () => {
    expect(ringsAreClosed(square)).toBe(true);
    expect(ringsAreClosed(twoIslands)).toBe(true);
    expect(
      ringsAreClosed({
        type: 'Polygon',
        coordinates: [
          box(0, 0, 1, 1)
            .slice(0, 4)
            .concat([[0, 0.5]]),
        ],
      }),
    ).toBe(false);
  });
});
