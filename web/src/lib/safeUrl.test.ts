import { describe, expect, it } from 'vitest';
import { safeHref, telHref } from './safeUrl';

describe('safeHref', () => {
  it('keeps http(s) links and app paths', () => {
    expect(safeHref('https://fermia.ga/lot/1')).toBe('https://fermia.ga/lot/1');
    expect(safeHref('/lot/abc')).toBe('/lot/abc');
  });
  it('refuses script-like and foreign schemes', () => {
    for (const bad of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'vbscript:x', '//evil.test/x', '/\\evil.test', 'tel:123', '']) {
      expect(safeHref(bad), bad).toBeNull();
    }
    expect(safeHref(null)).toBeNull();
    expect(safeHref(undefined)).toBeNull();
  });
});

describe('telHref', () => {
  it('keeps digits and a leading plus only', () => {
    expect(telHref('+241 74 12 34 56')).toBe('tel:+24174123456');
    expect(telHref('074 12 34 56')).toBe('tel:074123456');
  });
  it('never carries injected text', () => {
    expect(telHref('074123456;javascript:alert(1)')).toMatch(/^tel:\d+$/);
    expect(telHref('abc')).toBeNull();
    expect(telHref(null)).toBeNull();
  });
});
