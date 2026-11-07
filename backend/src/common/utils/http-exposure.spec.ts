import { describe, expect, it } from 'vitest';
import {
  corsOriginsSetting,
  securityHeaders,
  swaggerEnabled,
  trustProxyHops,
} from './http-exposure.js';

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

describe('corsOriginsSetting', () => {
  it('keeps * as the development default only', () => {
    expect(corsOriginsSetting(undefined, false)).toBe('*');
    expect(() => corsOriginsSetting(undefined, true)).toThrow(/CORS_ORIGINS/);
    expect(() => corsOriginsSetting('  ', true)).toThrow(/CORS_ORIGINS/);
    expect(corsOriginsSetting('https://a.ga', true)).toBe('https://a.ga');
  });
});

describe('securityHeaders', () => {
  function run(production: boolean) {
    const headers: Record<string, string> = {};
    let removed = '';
    let called = false;
    securityHeaders(production)(
      {},
      {
        setHeader: (k, v) => void (headers[k] = v),
        removeHeader: (k) => void (removed = k),
      },
      () => (called = true),
    );
    return { headers, removed, called };
  }

  it('sets the base headers and HSTS in production only', () => {
    const dev = run(false);
    expect(dev.called).toBe(true);
    expect(dev.removed).toBe('X-Powered-By');
    expect(dev.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(dev.headers['Strict-Transport-Security']).toBeUndefined();
    expect(run(true).headers['Strict-Transport-Security']).toContain('max-age');
  });
});
