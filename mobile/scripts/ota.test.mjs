import { createVerify, generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildManifest, listReleases, prune, releaseIdFor, signManifest, writeRelease } from './ota.mjs';

function fakeExport(root, content) {
  const dist = path.join(root, 'dist');
  fs.mkdirSync(path.join(dist, '_expo/static/js/android'), { recursive: true });
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dist, '_expo/static/js/android/index-x.hbc'), content);
  fs.writeFileSync(path.join(dist, 'assets/abc'), 'png-bytes');
  fs.writeFileSync(
    path.join(dist, 'metadata.json'),
    JSON.stringify({ fileMetadata: { android: { bundle: '_expo/static/js/android/index-x.hbc', assets: [{ path: 'assets/abc', ext: 'png' }] } } }),
  );
  fs.writeFileSync(path.join(dist, 'expoConfig.json'), JSON.stringify({ name: 'Fermia' }));
  return dist;
}

describe('ota publish', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });

  it('signs the exact manifest bytes and switches current', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-'));
    const out = path.join(root, 'ota');
    const manifest = buildManifest({ dist: fakeExport(root, 'js1'), assetsDir: path.join(out, 'assets'), baseUrl: 'https://x/ota', runtimeVersion: 'rv1', createdAt: '2026-01-01T00:00:00.000Z' });
    writeRelease({ out, runtimeVersion: 'rv1', releaseId: 'r1', manifest, privateKeyPem: pem, keyId: 'main' });
    const body = fs.readFileSync(path.join(out, 'rv/rv1/current.multipart'), 'utf8');
    const json = fs.readFileSync(path.join(out, 'rv/rv1/releases/r1/manifest.json'), 'utf8');
    expect(body).toContain(`\r\n\r\n${json}\r\n--`);
    const sig = /sig="([^"]+)"/.exec(body)?.[1];
    expect(createVerify('RSA-SHA256').update(json).verify(publicKey, sig, 'base64')).toBe(true);
    expect(manifest.launchAsset.url).toMatch(/^https:\/\/x\/ota\/assets\/[0-9a-f]{32}\.bundle$/);
    expect(manifest.assets[0].fileExtension).toBe('.png');
    expect(signManifest('a', pem)).toMatch(/^sig=".+", keyid="main", alg="rsa-v1_5-sha256"$/);
  });

  it('keeps the newest releases and drops unreferenced assets', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-'));
    const out = path.join(root, 'ota');
    for (const [i, js] of ['a', 'b', 'c'].entries()) {
      const m = buildManifest({ dist: fakeExport(root, js), assetsDir: path.join(out, 'assets'), baseUrl: 'https://x/ota', runtimeVersion: 'rv1', createdAt: `2026-01-0${i + 1}T00:00:00.000Z` });
      writeRelease({ out, runtimeVersion: 'rv1', releaseId: releaseIdFor(new Date(m.createdAt), i), manifest: m, privateKeyPem: null });
    }
    prune({ out, runtimeVersion: 'rv1', keep: 2 });
    expect(listReleases({ out, runtimeVersion: 'rv1' })).toHaveLength(2);
    // 2 bundles + the shared png
    expect(fs.readdirSync(path.join(out, 'assets'))).toHaveLength(3);
  });
});
