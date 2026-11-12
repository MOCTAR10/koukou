// Manual offline regression run on Expo web (not part of CI).
//
//   cd mobile
//   EXPO_PUBLIC_API_URL=https://<server>/api npx expo start --web --port 8110   (another terminal)
//   FERMIA_PHONE=... FERMIA_CODE=... API_ORIGIN=https://<server> PLAYWRIGHT_CORE=<path to playwright-core> \
//     CHROME_PATH=<chrome executable> node scripts/regression-offline.mjs
//
// The account comes from the environment, never from the repo. The API is
// reached through a Node proxy (a browser on localhost is refused by CORS) and
// is READ-ONLY: only GETs and the login POST go through, every other request is
// aborted (a queued entry stays queued, it never reaches the server).
// Steps: sign in and online screens, go offline (indicator delay), cold start
// offline (session + saved reads), entry saved offline (queue = 1), back online,
// sign out (saved copy removed). Screenshots go to OUT_DIR. Exit code 1 when a check fails.
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const need = (k) => process.env[k] || (console.error(`Missing env ${k}`), process.exit(2));
const { chromium } = createRequire(import.meta.url)(need('PLAYWRIGHT_CORE'));
const APP = process.env.APP_URL || 'http://localhost:8110';
const API = new URL(need('API_ORIGIN')).origin;
const PHONE = need('FERMIA_PHONE');
const CODE = need('FERMIA_CODE');
const OUT = process.env.OUT_DIR || path.join(os.tmpdir(), 'fermia-regression');
const PROFILE = process.env.PROFILE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'fermia-profile-'));
fs.mkdirSync(OUT, { recursive: true });

const state = { offline: false, blocked: [] };
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
  if (!ok) failures++;
};
const CORS = (o) => ({
  'access-control-allow-origin': o || '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-expose-headers': '*',
});

async function launch() {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: process.env.CHROME_PATH || undefined,
    headless: true,
    viewport: { width: 360, height: 800 },
  });
  await ctx.route(/.*/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin === API) {
      const method = req.method();
      if (state.offline) return route.abort('internetdisconnected');
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS(req.headers().origin) });
      const isLogin = method === 'POST' && /\/auth\/login$/.test(url.pathname);
      if (method !== 'GET' && !isLogin) {
        state.blocked.push(`${method} ${url.pathname}`);
        return route.abort('blockedbyclient');
      }
      const h = { ...req.headers() };
      for (const k of ['origin', 'referer', 'host', 'content-length']) delete h[k];
      try {
        const r = await fetch(req.url(), { method, headers: h, body: isLogin ? req.postDataBuffer() : undefined, redirect: 'follow' });
        const headers = {};
        r.headers.forEach((v, k) => {
          if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) headers[k] = v;
        });
        return route.fulfill({ status: r.status, headers: { ...headers, ...CORS(req.headers().origin) }, body: Buffer.from(await r.arrayBuffer()) });
      } catch {
        return route.abort('failed');
      }
    }
    if (url.origin === APP && state.offline) {
      // The dev server stays reachable for the page shell while the browser is « offline ».
      try {
        const r = await fetch(req.url());
        return route.fulfill({ status: r.status, body: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get('content-type') ?? undefined });
      } catch {
        return route.abort();
      }
    }
    return route.continue();
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  return { ctx, page };
}

const pill = (p) => p.locator('[aria-live="polite"]').first().innerText().catch(() => '?');
const text = (p) => p.evaluate(() => document.body.innerText);
const shot = (p, n) => p.screenshot({ path: path.join(OUT, `${n}.png`) });
const go = async (p, to) => {
  await p.evaluate((x) => {
    history.pushState({}, '', x);
    dispatchEvent(new PopStateEvent('popstate'));
  }, to);
  await p.waitForTimeout(3000);
};
async function waitPill(p, re, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (re.test(await pill(p))) return Date.now() - t0;
    await p.waitForTimeout(200);
  }
  return -1;
}

// 1. online
let { ctx, page } = await launch();
await page.goto(APP, { timeout: 180_000 });
await page.waitForTimeout(5000);
if (/Se connecter/.test(await text(page))) {
  await page.getByPlaceholder('Téléphone').fill(PHONE);
  for (const d of CODE) await page.getByText(d, { exact: true }).first().click();
  await page.getByText('Se connecter').first().click();
  await page.waitForTimeout(9000);
}
check('1 online: dashboard and pill « En ligne »', /Bonjour/.test(await text(page)) && /^En ligne/.test(await pill(page)), await pill(page));
await shot(page, '1-dashboard');
await page.getByText('Lots', { exact: true }).last().click();
await page.waitForTimeout(2500);
await go(page, '/alerts');
await go(page, '/provende');
await shot(page, '1-provende');

// 2. offline with the app open
state.offline = true;
await ctx.setOffline(true);
const delay = await waitPill(page, /Hors ligne/, 30_000);
check('2 offline: pill switches', delay >= 0, `${delay} ms`);
await shot(page, '2-offline');
const t2 = await text(page);
check('2 offline: visited screen keeps its data with the amber notice', /Hors ligne · donn/.test(t2) && !/Impossible de charger/.test(t2));
await ctx.close();

// 3. cold start offline, same profile
({ ctx, page } = await launch());
await ctx.setOffline(true);
await page.goto(APP, { timeout: 180_000 });
await page.waitForTimeout(8000);
const t3 = await text(page);
check('3 cold start offline: session restored, saved data, no blocking error', /Bonjour/.test(t3) && !/Impossible de charger/.test(t3));
await shot(page, '3-cold-offline');
await page.getByText('Lots', { exact: true }).last().click();
await page.waitForTimeout(2500);
await page.getByText(/^G\d+-\d+-B\d+$/).first().click();
await page.waitForTimeout(3500);
await page.getByText('Saisir', { exact: true }).first().click();
await page.waitForTimeout(2500);
await page.locator('input[placeholder="0"]').first().fill('1');
for (let i = 0; i < 4; i++) {
  const b = page.getByText(/^(Suivant|Enregistrer.*)$/).filter({ visible: true }).first();
  const label = await b.innerText().catch(() => null);
  if (!label) break;
  await b.click();
  await page.waitForTimeout(1800);
  if (/Enregistrer/.test(label)) break;
}
await page.waitForTimeout(2500);
const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('koukou.offline.queue') || '[]').length);
check('3 entry saved offline: queued, pill « Hors ligne · n en attente »', queued >= 1 && /Hors ligne · \d+ en attente/.test(await pill(page)), `${queued} op, ${await pill(page)}`);
await shot(page, '3-entry-queued');

// 4. back online (the write stays blocked by the read-only rule)
state.offline = false;
await ctx.setOffline(false);
const back = await waitPill(page, /^En ligne/, 30_000);
await page.waitForTimeout(3000);
check('4 back online: pill returns and does not stay on « Synchronisation… »', back >= 0 && !/Synchronisation/.test(await pill(page)), `${back} ms, now ${await pill(page)}`);
await shot(page, '4-back-online');

// 5. sign out
await go(page, '/reglages');
await page.mouse.move(180, 400);
for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 700);
await page.getByText('Se déconnecter').filter({ visible: true }).last().click();
await page.waitForTimeout(1500);
await page.getByText('Se déconnecter').filter({ visible: true }).last().click().catch(() => {});
await page.waitForTimeout(3000);
const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^koukou\.(qcache|cache)\./.test(k)));
check('5 sign out: saved copy removed', keys.length === 0, keys.join(', '));

console.log('Writes blocked by the read-only rule:', JSON.stringify(state.blocked));
await ctx.close();
process.exit(failures ? 1 : 0);
