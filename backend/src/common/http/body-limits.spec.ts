import { describe, expect, it } from 'vitest';
import { GEOMETRY_ROUTE } from './body-limits.js';

describe('GEOMETRY_ROUTE', () => {
  it('matches the province boundary upload only', () => {
    expect(GEOMETRY_ROUTE.test('/programme/provinces/G1/geometry')).toBe(true);
    expect(GEOMETRY_ROUTE.test('/programme/provinces/G1/geometry/')).toBe(true);
    expect(GEOMETRY_ROUTE.test('/programme/provinces')).toBe(false);
    expect(GEOMETRY_ROUTE.test('/programme/provinces/G1/geometry/x')).toBe(false);
    expect(GEOMETRY_ROUTE.test('/farms/x/programme/provinces/G1/geometry')).toBe(false);
  });
});
