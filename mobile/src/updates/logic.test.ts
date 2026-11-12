import { describe, expect, it } from 'vitest';

import { isCheckDue, parseApkInfo, shouldOfferApk } from './logic';

const remote = { versionCode: 6, version: '0.1.0', runtimeVersion: 'fp-b', url: 'https://x/apk/f.apk' };

describe('parseApkInfo', () => {
  it('accepts a valid file and rejects junk', () => {
    expect(parseApkInfo({ versionCode: '6', url: 'https://x/a.apk', runtimeVersion: 'r' })?.versionCode).toBe(6);
    expect(parseApkInfo(null)).toBeNull();
    expect(parseApkInfo({ versionCode: 0, url: 'https://x' })).toBeNull();
    expect(parseApkInfo({ versionCode: 3, url: 'http://x/a.apk' })).toBeNull();
  });
});

describe('shouldOfferApk', () => {
  const base = { buildNumber: 4, runtimeVersion: 'fp-a', otaEnabled: true };
  it('offers it when native code changed', () => expect(shouldOfferApk(remote, base)).toBe(true));
  it('leaves JS-only builds to the OTA', () => expect(shouldOfferApk(remote, { ...base, runtimeVersion: 'fp-b' })).toBe(false));
  it('offers it when OTA is not available', () => expect(shouldOfferApk(remote, { ...base, otaEnabled: false, runtimeVersion: 'fp-b' })).toBe(true));
  it('ignores an equal or older build', () => {
    expect(shouldOfferApk(remote, { ...base, buildNumber: 6 })).toBe(false);
    expect(shouldOfferApk(remote, { ...base, buildNumber: null })).toBe(false);
  });
});

describe('isCheckDue', () => {
  it('throttles', () => {
    expect(isCheckDue(null, 100, 50)).toBe(true);
    expect(isCheckDue(100, 120, 50)).toBe(false);
    expect(isCheckDue(100, 150, 50)).toBe(true);
  });
});
