#!/usr/bin/env node
// Over-the-air updates of Fermia (Expo Updates protocol v1, served as static files by nginx).
//
//   node scripts/ota.mjs runtime                       compute the runtime version, write it in app.json
//   node scripts/ota.mjs publish  --dist D --out O ... publish an `expo export` bundle (signed)
//   node scripts/ota.mjs rollback --to ID --out O ...  republish an older release as the newest one
//   node scripts/ota.mjs list     --out O ...          list the kept releases
//   node scripts/ota.mjs version-json --apk F ...      write version.json next to the APK
//
// Layout under --out (served by nginx, see deploy/nginx-fermia.conf):
//   assets/<md5><.ext>                      content-addressed files, shared by every release
//   rv/<runtimeVersion>/current.multipart   what the phones download (signed manifest)
//   rv/<runtimeVersion>/releases/<id>/{manifest.json,manifest.multipart}   kept for rollback
//
// A phone only takes an update whose createdAt is newer than the one it runs, so a rollback is
// a NEW release (fresh id and createdAt) that points at the older assets.
import { createHash, createSign, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BOUNDARY = 'fermia-ota-boundary';
const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', json: 'application/json',
  mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', pdf: 'application/pdf', ico: 'image/x-icon',
};

const md5 = (buf) => createHash('md5').update(buf).digest('hex');
const sha256b64url = (buf) => createHash('sha256').update(buf).digest('base64url');

/** Multipart body with one signed `manifest` part. The signature covers the exact bytes of the JSON. */
export function buildMultipart(manifestJson, signatureHeader) {
  const lines = [
    `--${BOUNDARY}`,
    'Content-Disposition: form-data; name="manifest"',
    'Content-Type: application/json; charset=utf-8',
  ];
  if (signatureHeader) lines.push(`expo-signature: ${signatureHeader}`);
  return `${lines.join('\r\n')}\r\n\r\n${manifestJson}\r\n--${BOUNDARY}--\r\n`;
}

/** RSA-SHA256 over the manifest bytes, as the SFV dictionary expo-updates expects. */
export function signManifest(manifestJson, privateKeyPem, keyId = 'main') {
  const sig = createSign('RSA-SHA256').update(manifestJson, 'utf8').sign(privateKeyPem, 'base64');
  return `sig="${sig}", keyid="${keyId}", alg="rsa-v1_5-sha256"`;
}

/** Copies a file into assets/ under a content-addressed name; returns manifest fields. */
function addAsset(file, ext, assetsDir, baseUrl) {
  const buf = fs.readFileSync(file);
  const key = md5(buf);
  const dot = ext ? `.${ext}` : '';
  const name = `${key}${dot}`;
  const target = path.join(assetsDir, name);
  if (!fs.existsSync(target)) fs.copyFileSync(file, target);
  return { hash: sha256b64url(buf), key, url: `${baseUrl}/assets/${name}`, dot };
}

/** Builds the manifest of an `expo export` output (Android). */
export function buildManifest({ dist, assetsDir, baseUrl, runtimeVersion, createdAt }) {
  const meta = JSON.parse(fs.readFileSync(path.join(dist, 'metadata.json'), 'utf8'));
  const android = meta.fileMetadata?.android;
  if (!android?.bundle) throw new Error('metadata.json has no Android bundle: run `expo export --platform android`.');
  fs.mkdirSync(assetsDir, { recursive: true });
  const launch = addAsset(path.join(dist, android.bundle), 'bundle', assetsDir, baseUrl);
  const assets = (android.assets ?? []).map((a) => {
    const ext = (a.ext ?? '').replace(/^\./, '');
    const r = addAsset(path.join(dist, a.path), ext, assetsDir, baseUrl);
    return { hash: r.hash, key: r.key, fileExtension: r.dot, contentType: MIME[ext.toLowerCase()] ?? 'application/octet-stream', url: r.url };
  });
  const cfgPath = path.join(dist, 'expoConfig.json');
  const expoClient = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : undefined;
  return {
    id: randomUUID(),
    createdAt,
    runtimeVersion,
    launchAsset: { hash: launch.hash, key: launch.key, contentType: 'application/javascript', url: launch.url },
    assets,
    metadata: {},
    extra: expoClient ? { expoClient } : {},
  };
}

/** Writes a release and switches `current.multipart` to it (atomic rename). */
export function writeRelease({ out, runtimeVersion, releaseId, manifest, privateKeyPem, keyId }) {
  const rvDir = path.join(out, 'rv', runtimeVersion);
  const relDir = path.join(rvDir, 'releases', releaseId);
  fs.mkdirSync(relDir, { recursive: true });
  const json = JSON.stringify(manifest);
  const multipart = buildMultipart(json, privateKeyPem ? signManifest(json, privateKeyPem, keyId) : null);
  fs.writeFileSync(path.join(relDir, 'manifest.json'), json);
  fs.writeFileSync(path.join(relDir, 'manifest.multipart'), multipart);
  const tmp = path.join(rvDir, 'current.multipart.tmp');
  fs.writeFileSync(tmp, multipart);
  fs.renameSync(tmp, path.join(rvDir, 'current.multipart'));
  return relDir;
}

/** Keeps the newest `keep` releases of a runtime version, then removes assets nobody references. */
export function prune({ out, runtimeVersion, keep }) {
  const relRoot = path.join(out, 'rv', runtimeVersion, 'releases');
  if (fs.existsSync(relRoot)) {
    const ids = fs.readdirSync(relRoot).sort();
    for (const id of ids.slice(0, Math.max(0, ids.length - keep))) fs.rmSync(path.join(relRoot, id), { recursive: true, force: true });
  }
  const used = new Set();
  const rvRoot = path.join(out, 'rv');
  for (const rv of fs.existsSync(rvRoot) ? fs.readdirSync(rvRoot) : []) {
    const root = path.join(rvRoot, rv, 'releases');
    for (const id of fs.existsSync(root) ? fs.readdirSync(root) : []) {
      const m = JSON.parse(fs.readFileSync(path.join(root, id, 'manifest.json'), 'utf8'));
      for (const a of [m.launchAsset, ...m.assets]) used.add(path.basename(new URL(a.url).pathname));
    }
  }
  const assetsDir = path.join(out, 'assets');
  for (const f of fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : []) {
    if (!used.has(f)) fs.rmSync(path.join(assetsDir, f), { force: true });
  }
}

export function listReleases({ out, runtimeVersion }) {
  const relRoot = path.join(out, 'rv', runtimeVersion, 'releases');
  return fs.existsSync(relRoot) ? fs.readdirSync(relRoot).sort() : [];
}

/** Same release id format everywhere: sortable, readable. */
export function releaseIdFor(date, build) {
  return `${date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-b${build}`;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[argv[i].slice(2)] = true;
    else {
      args[argv[i].slice(2)] = next;
      i++;
    }
  }
  return args;
}

const need = (args, k) => {
  if (typeof args[k] !== 'string' || !args[k]) throw new Error(`Missing --${k}`);
  return args[k];
};

function readKey(args) {
  if (args['no-sign']) return null;
  return fs.readFileSync(need(args, 'key'), 'utf8');
}

/** Newest runtime version folder, for a rollback without --runtime. */
function newestRuntime(out) {
  const root = path.join(out, 'rv');
  const dirs = fs.existsSync(root) ? fs.readdirSync(root) : [];
  dirs.sort((a, b) => fs.statSync(path.join(root, b)).mtimeMs - fs.statSync(path.join(root, a)).mtimeMs);
  if (!dirs[0]) throw new Error('No OTA release published yet.');
  return dirs[0];
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (cmd === 'runtime') {
    // Fingerprint of the native side (managed workflow, before prebuild): identical in the APK job
    // and in the OTA-only job as long as the native code is the same.
    const appJson = path.resolve(args.app ?? 'app.json');
    const stdout = execFileSync('npx', ['expo-updates', 'fingerprint:generate', '--platform', 'android', '--workflow', 'managed'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    const line = stdout.trim().split('\n').filter((l) => l.startsWith('{')).pop();
    const hash = JSON.parse(line ?? '{}').hash;
    if (typeof hash !== 'string' || hash.length < 16) throw new Error(`Unreadable fingerprint output: ${stdout}`);
    const rv = `fp-${hash.slice(0, 20)}`;
    const j = JSON.parse(fs.readFileSync(appJson, 'utf8'));
    j.expo.runtimeVersion = rv;
    fs.writeFileSync(appJson, `${JSON.stringify(j, null, 2)}\n`);
    console.log(rv);
  } else if (cmd === 'publish') {
    const out = path.resolve(need(args, 'out'));
    const runtimeVersion = need(args, 'runtime');
    const createdAt = typeof args['created-at'] === 'string' ? args['created-at'] : new Date().toISOString();
    const manifest = buildManifest({
      dist: path.resolve(need(args, 'dist')),
      assetsDir: path.join(out, 'assets'),
      baseUrl: need(args, 'base-url').replace(/\/$/, ''),
      runtimeVersion,
      createdAt,
    });
    const id = releaseIdFor(new Date(createdAt), args.build ?? '0');
    writeRelease({ out, runtimeVersion, releaseId: id, manifest, privateKeyPem: readKey(args), keyId: args['key-id'] ?? 'main' });
    prune({ out, runtimeVersion, keep: Number(args.keep ?? 10) });
    console.log(`Published ${id} for runtime ${runtimeVersion}`);
  } else if (cmd === 'rollback') {
    const out = path.resolve(need(args, 'out'));
    const runtimeVersion = typeof args.runtime === 'string' && args.runtime ? args.runtime : newestRuntime(out);
    const from = need(args, 'to');
    const src = path.join(out, 'rv', runtimeVersion, 'releases', from, 'manifest.json');
    if (!fs.existsSync(src)) throw new Error(`Unknown release ${from}. Available: ${listReleases({ out, runtimeVersion }).join(', ')}`);
    const now = new Date();
    const manifest = { ...JSON.parse(fs.readFileSync(src, 'utf8')), id: randomUUID(), createdAt: now.toISOString() };
    const id = releaseIdFor(now, `rollback-${from}`);
    writeRelease({ out, runtimeVersion, releaseId: id, manifest, privateKeyPem: readKey(args), keyId: args['key-id'] ?? 'main' });
    prune({ out, runtimeVersion, keep: Number(args.keep ?? 10) });
    console.log(`Rolled back runtime ${runtimeVersion} to the content of ${from} (new release ${id})`);
  } else if (cmd === 'list') {
    const out = path.resolve(need(args, 'out'));
    const runtimeVersion = typeof args.runtime === 'string' && args.runtime ? args.runtime : newestRuntime(out);
    console.log(`Runtime ${runtimeVersion}:\n${listReleases({ out, runtimeVersion }).join('\n')}`);
  } else if (cmd === 'version-json') {
    const apk = path.resolve(need(args, 'apk'));
    const buf = fs.readFileSync(apk);
    const name = path.basename(apk);
    const doc = {
      versionCode: Number(need(args, 'code')),
      version: need(args, 'version'),
      runtimeVersion: need(args, 'runtime'),
      apk: name,
      url: `${need(args, 'base-url').replace(/\/$/, '')}/${name}`,
      sha256: createHash('sha256').update(buf).digest('hex'),
      size: buf.length,
      publishedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.resolve(need(args, 'out')), `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`version.json: build ${doc.versionCode}, runtime ${doc.runtimeVersion}`);
  } else {
    console.error('Usage: ota.mjs runtime | publish | rollback | list | version-json  (see the header of this file)');
    process.exit(2);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`ota: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
