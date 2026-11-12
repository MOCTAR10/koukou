import { describe, it, expect } from 'vitest';

import { boundedScale, describeScreen, gridColumns, scaled, widthClassFor } from './responsive';

describe('responsive', () => {
  it('classes de largeur', () => {
    expect(widthClassFor(320)).toBe('compact');
    expect(widthClassFor(359)).toBe('compact');
    expect(widthClassFor(360)).toBe('regular');
    expect(widthClassFor(411)).toBe('regular');
    expect(widthClassFor(412)).toBe('large');
    expect(widthClassFor(599)).toBe('large');
    expect(widthClassFor(600)).toBe('tablet');
  });

  it('échelle bornée', () => {
    expect(boundedScale(390)).toBe(1);
    expect(boundedScale(280)).toBe(0.88);
    expect(boundedScale(500)).toBe(1.12);
    expect(boundedScale(360)).toBeCloseTo(0.923, 2);
    expect(boundedScale(800)).toBe(1);
    expect(scaled(16, 320)).toBe(14);
    expect(scaled(16, 390)).toBe(16);
  });

  it('colonnes de grille', () => {
    expect(gridColumns(328, 150, 8)).toEqual({ columns: 2, tileWidth: 160 });
    expect(gridColumns(296, 150, 8)).toEqual({ columns: 1, tileWidth: 296 });
    expect(gridColumns(720, 150, 8).columns).toBe(4);
    expect(gridColumns(100, 150).columns).toBe(1);
    expect(gridColumns(2000, 100, 8, 3).columns).toBe(3);
  });

  it('description d’écran', () => {
    const phone = describeScreen(320, 640, 1.5);
    expect(phone.isCompact).toBe(true);
    expect(phone.isShort).toBe(true);
    expect(phone.fontScale).toBe(1.15);
    expect(phone.gutter).toBe(12);
    const tablet = describeScreen(800, 1280);
    expect(tablet.isTablet).toBe(true);
    expect(tablet.contentWidth).toBe(720);
    expect(tablet.isShort).toBe(false);
  });
});
