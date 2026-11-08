import { describe, expect, it } from 'vitest';

import { safeExternalUrl, telUrl } from './safeUrl';

describe('safeExternalUrl', () => {
  it('garde http(s)', () => {
    expect(safeExternalUrl('https://fermia.ga/lot/1')).toBe('https://fermia.ga/lot/1');
  });
  it('refuse les schémas dangereux, le vide et le texte libre', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'intent://x#Intent;end', 'file:///etc/passwd', '/lot/1', 'pas une url', '']) {
      expect(safeExternalUrl(bad), bad).toBeNull();
    }
    expect(safeExternalUrl(undefined)).toBeNull();
  });
});

describe('telUrl', () => {
  it('chiffres et + initial seulement', () => {
    expect(telUrl('+241 74 12 34 56')).toBe('tel:+24174123456');
    expect(telUrl('074 12 34 56')).toBe('tel:074123456');
    expect(telUrl('074123456;javascript:x')).toMatch(/^tel:\d+$/);
    expect(telUrl('abc')).toBeNull();
    expect(telUrl(null)).toBeNull();
  });
});
