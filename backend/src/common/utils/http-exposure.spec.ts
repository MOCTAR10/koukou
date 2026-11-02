import { describe, expect, it } from 'vitest';
import { swaggerEnabled, trustProxyHops } from './http-exposure.js';

describe('trustProxyHops', () => {
  it('defaults to no proxy', () => {
    expect(trustProxyHops(undefined)).toBe(0);
    expect(trustProxyHops('  ')).toBe(0);
  });

  it('reads a number of proxies', () => {
    expect(trustProxyHops('1')).toBe(1);
    expect(trustProxyHops(' 2 ')).toBe(2);
  });

  it('refuses anything else at boot', () => {
    for (const raw of ['true', '-1', '1.5', 'loopback']) {
      expect(() => trustProxyHops(raw)).toThrow(/TRUST_PROXY/);
    }
  });
});

describe('swaggerEnabled', () => {
  it('is on outside production, off in production', () => {
    expect(swaggerEnabled(undefined, undefined)).toBe(true);
    expect(swaggerEnabled('development', undefined)).toBe(true);
    expect(swaggerEnabled('production', undefined)).toBe(false);
  });

  it('follows an explicit flag', () => {
    expect(swaggerEnabled('production', 'true')).toBe(true);
    expect(swaggerEnabled('development', 'false')).toBe(false);
  });
});
