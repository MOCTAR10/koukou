import { describe, expect, it } from 'vitest';

// WCAG 2.x contrast of the colour tokens declared in the @theme block of
// index.css: body text must reach 4.5:1 on the surfaces it is drawn on.
import css from '../index.css?raw';

const tokens = new Map<string, string>();
for (const m of css.matchAll(/--color-([a-z]+-\d+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens.set(m[1]!, m[2]!);
// `--color-status-ok-fg: var(--color-emerald-800)` style aliases.
for (const m of css.matchAll(/--color-(status-[a-z-]+):\s*var\(--color-([a-z]+-\d+)\)\s*;/g)) {
  const target = tokens.get(m[2]!);
  if (target) tokens.set(m[1]!, target);
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const color = (name: string): string => {
  if (name === 'white') return '#ffffff';
  const v = tokens.get(name);
  if (!v) throw new Error(`token manquant : ${name}`);
  return v;
};

describe('palette contrast (WCAG AA)', () => {
  it('reads the tokens from index.css', () => {
    expect(tokens.size).toBeGreaterThan(50);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  // [foreground, background]: body text pairs used by the app (>= 4.5:1).
  const bodyPairs: Array<[string, string]> = [
    ['slate-900', 'white'],
    ['slate-800', 'white'],
    ['slate-700', 'white'],
    ['slate-600', 'white'],
    ['slate-500', 'white'],
    ['slate-500', 'slate-50'],
    ['slate-500', 'slate-100'],
    ['slate-600', 'slate-100'],
    ['brand-500', 'white'],
    ['brand-600', 'white'],
    ['brand-700', 'brand-50'],
    ['white', 'brand-600'],
    ['white', 'brand-700'],
    ['emerald-600', 'white'],
    ['emerald-700', 'emerald-50'],
    ['amber-600', 'white'],
    ['amber-700', 'amber-50'],
    ['accent-700', 'white'],
    ['red-500', 'white'],
    ['red-600', 'red-50'],
    ['status-ok-fg', 'status-ok-bg'],
    ['status-warning-fg', 'status-warning-bg'],
    ['status-danger-fg', 'status-danger-bg'],
    ['status-info-fg', 'status-info-bg'],
    ['status-neutral-fg', 'status-neutral-bg'],
  ];
  it.each(bodyPairs)('%s on %s reaches 4.5:1', (fg, bg) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps slate-400 for icons and borders only (3:1 non-text minimum)', () => {
    expect(contrast(color('slate-400'), '#ffffff')).toBeGreaterThanOrEqual(3);
  });
});
