#!/usr/bin/env node
/**
 * POUFA demo seed: fills an EMPTY POUFA database through the HTTP API of a
 * running backend, so every business rule applies (registry, duplicates,
 * owner activation, bands, feed stock, Market, institutional access).
 *
 * Usage (from backend/, server already booted on the demo DB, see
 * scripts/README-poufa-demo.md):
 *
 *   node --env-file=.env scripts/seed-poufa-demo.mjs --out <credentials.md>
 *
 * Reads PLATFORM_ADMIN_PHONE / PLATFORM_ADMIN_PASSWORD (the platform admin
 * the boot seed creates from the same .env), PORT or SEED_API_URL, and
 * optionally SEED_CSV (default test/fixtures/fermes-poufa.csv).
 *
 * Not idempotent on purpose: it refuses to run when the registry already
 * holds farms (recreate the database and boot again). Login codes are
 * secrets even for a demo: the credentials file must live outside the repo.
 * Plain Node >= 22 (global fetch/FormData), no dependency.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomInt } from 'node:crypto';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');

// ---------------------------------------------------------------- config
const argOut = process.argv.indexOf('--out');
const OUT = resolve(
  argOut > 0
    ? process.argv[argOut + 1]
    : (process.env.SEED_CREDENTIALS_OUT ??
        join(tmpdir(), 'poufa-demo', 'credentials.md')),
);
const rel = relative(repoRoot, OUT);
if (!rel.startsWith('..') && !isAbsolute(rel)) {
  throw new Error(
    `Refus : le fichier d'identifiants (${OUT}) ne doit pas être dans le dépôt.`,
  );
}
const API = (
  process.env.SEED_API_URL ?? `http://localhost:${process.env.PORT ?? 3100}`
).replace(/\/$/, '');
const ADMIN_PHONE = process.env.PLATFORM_ADMIN_PHONE;
const ADMIN_CODE = process.env.PLATFORM_ADMIN_PASSWORD;
const CSV_PATH = resolve(
  process.env.SEED_CSV ??
    join(scriptDir, '..', 'test', 'fixtures', 'fermes-poufa.csv'),
);
if (!ADMIN_PHONE || !ADMIN_CODE) {
  throw new Error(
    'PLATFORM_ADMIN_PHONE et PLATFORM_ADMIN_PASSWORD sont requis (les mêmes que ceux du serveur).',
  );
}

// ---------------------------------------------------------------- helpers
class ApiError extends Error {
  constructor(method, path, status, data) {
    super(
      `${method} ${path} → ${status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`,
    );
    this.status = status;
    this.data = data;
  }
}

let calls = 0;
/** One API call; throws unless the status is in `ok`. */
async function api(method, path, { token, body, form, ok = [200, 201] } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  calls += 1;
  const res = await fetch(API + path, { method, headers, body: payload });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!ok.includes(res.status))
    throw new ApiError(method, path, res.status, data);
  return { status: res.status, data };
}
const get = async (path, token) => (await api('GET', path, { token })).data;
const post = async (path, body, token) =>
  (await api('POST', path, { token, body })).data;
const patch = async (path, body, token) =>
  (await api('PATCH', path, { token, body })).data;
const put = async (path, body, token) =>
  (await api('PUT', path, { token, body })).data;

const log = (...a) => console.log(...a);
const step = (t) => log(`\n== ${t}`);

/** Deterministic PRNG (mulberry32) so two runs produce the same figures. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const todayUtc = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
/** YYYY-MM-DD, `offset` days from today (UTC). */
const day = (offset) =>
  new Date(todayUtc.getTime() + offset * DAY).toISOString().slice(0, 10);
const atNoon = (offset) => `${day(offset)}T10:00:00.000Z`;

async function login(phone, code) {
  return (await post('/auth/login', { phone, code })).accessToken;
}

const loginCode = () => String(randomInt(10_000_000, 99_999_999));

// ---------------------------------------------------------------- zootechnics
/** Broiler feed intake, g/bird/day, at age `a` (days). */
const feedG = (a) => Math.min(210, 12 + 5.4 * a - 0.03 * a * a);
/** Broiler average live weight, kg, at age `a` (Cobb/Ross-like curve). */
const WEIGHT_CURVE = [
  [0, 0.042],
  [7, 0.18],
  [14, 0.46],
  [21, 0.9],
  [28, 1.42],
  [35, 1.98],
  [42, 2.52],
  [56, 3.3],
];
function weightKg(a) {
  for (let i = 1; i < WEIGHT_CURVE.length; i++) {
    const [a1, w1] = WEIGHT_CURVE[i];
    const [a0, w0] = WEIGHT_CURVE[i - 1];
    if (a <= a1) return w0 + ((w1 - w0) * (a - a0)) / (a1 - a0);
  }
  return WEIGHT_CURVE.at(-1)[1];
}
const phaseOf = (a) =>
  a <= 10 ? 'DEMARRAGE' : a <= 24 ? 'CROISSANCE' : 'FINITION';

/**
 * Simulated daily entries of a band: one per day from its opening to
 * `lastOffset` (included). `trouble` = mortality spike + water drop on the
 * last 3 days (disease signal for the advisory engine).
 */
function simulateBand(band) {
  const rnd = prng(band.seed);
  const entries = [];
  let alive = band.quantity;
  for (let off = band.openOffset; off <= band.lastOffset; off++) {
    const i = off - band.openOffset;
    const age = band.initialAgeDays + i;
    const late = band.trouble && off > band.lastOffset - 3;
    const rate = (age < 7 ? 0.004 : 0.0011) * (0.5 + rnd()) * (late ? 9 : 1);
    const deaths = Math.min(alive - 1, Math.round(alive * rate));
    alive -= deaths;
    const feedKg = Math.round((alive * feedG(age)) / 100) / 10;
    const waterFactor = late ? 1.25 : 1.85 + rnd() * 0.15;
    const entry = {
      entryDate: day(off),
      deaths,
      feedQuantity: feedKg,
      feedUnit: 'KG',
      feedPhase: phaseOf(age),
      waterL: Math.round(feedKg * waterFactor),
    };
    // Weekly weighing (and the last day), sample of 30 birds.
    if (i > 0 && (age % 7 === 0 || off === band.lastOffset)) {
      entry.avgWeightKg =
        Math.round(weightKg(age) * (0.95 + rnd() * 0.07) * 1000) / 1000;
      entry.sampleSize = 30;
    }
    entries.push(entry);
  }
  return { entries, alive };
}

// ---------------------------------------------------------------- demo plan
/** Registry enrichment: pick = n-th farm (by code) of the province. */
const SHEETS = [
  {
    key: 'mba',
    province: 'G1',
    pick: 0,
    localite: 'Komo-Mondah',
    cohort: 'COHORTE_1',
    exploitant: ['Jean-Pierre Mba Obame', '+24177101001'],
    gps: [0.392, 9.768],
    capacity: 3000,
    infra: [
      ['BATIMENT_ELEVAGE', 2, 600],
      ['MAGASIN_ALIMENT', 1, 40],
      ['POINT_EAU', 1],
      ['PEDILUVE', 2],
      ['GROUPE_ELECTROGENE', 1],
    ],
    status: 'OPERATIONNELLE',
    owner: true,
    verified: true,
  },
  {
    key: 'ndong1',
    province: 'G1',
    pick: 1,
    localite: 'Komo',
    cohort: 'COHORTE_1',
    exploitant: ['Marie-Claire Ndong', '+24177101002'],
    gps: [0.168, 10.118],
    capacity: 2500,
    infra: [
      ['BATIMENT_ELEVAGE', 2, 500],
      ['MAGASIN_ALIMENT', 1, 30],
      ['RESERVOIR_EAU', 1],
      ['CLOTURE', 1],
    ],
    status: 'OPERATIONNELLE',
    owner: true,
    verified: true,
  },
  {
    // Same exploitant as ndong1: one account, two farms (linkExistingUser).
    key: 'ndong2',
    province: 'G1',
    pick: 2,
    localite: 'Komo',
    cohort: 'COHORTE_2',
    exploitant: ['Marie-Claire Ndong', '+24177101002'],
    gps: [0.205, 10.155],
    capacity: 1000,
    infra: [
      ['BATIMENT_ELEVAGE', 1, 250],
      ['POINT_EAU', 1],
    ],
    status: 'OPERATIONNELLE',
    owner: 'link',
  },
  {
    // GPS read in Franceville while the farm is in the Estuaire: warning.
    key: 'gpsout',
    province: 'G1',
    pick: 3,
    localite: 'Libreville',
    cohort: 'COHORTE_1',
    exploitant: ['Paul Essono Nze', '+24177101003'],
    gps: [-1.633, 13.583],
    gpsReason: 'Relevé saisi depuis le récépissé AMI (à vérifier sur place)',
    capacity: 1500,
    infra: [['BATIMENT_ELEVAGE', 1, 300]],
    status: 'OPERATIONNELLE',
    owner: true,
  },
  {
    key: 'prep',
    province: 'G1',
    pick: 4,
    localite: 'Noya',
    cohort: 'COHORTE_2',
    exploitant: ['Sylvie Mintsa', '+24177101004'],
    gps: [0.995, 9.586],
    capacity: 1200,
    infra: [['BATIMENT_ELEVAGE', 1, 240]],
    status: null, // stays EN_PREPARATION (import default)
  },
  {
    key: 'suspended',
    province: 'G1',
    pick: 5,
    localite: 'Komo-Mondah',
    cohort: 'COHORTE_1',
    exploitant: ['Rodrigue Ondo Mve', '+24177101005'],
    gps: [0.412, 9.702],
    capacity: 2000,
    infra: [
      ['BATIMENT_ELEVAGE', 2, 400],
      ['MAGASIN_ALIMENT', 1, 25],
    ],
    status: 'OPERATIONNELLE',
    suspend:
      'Contrôle du 03/11 : vide sanitaire non respecté, reprise après désinfection validée par l’agent technique.',
    owner: true,
  },
  {
    key: 'franceville',
    province: 'G2',
    pick: 0,
    localite: 'Mpassa',
    cohort: 'COHORTE_1',
    exploitant: ['Albert Moussavou', '+24177102001'],
    gps: [-1.62, 13.6],
    capacity: 2000,
    infra: [
      ['BATIMENT_ELEVAGE', 2, 400],
      ['POINT_EAU', 1],
    ],
    status: 'OPERATIONNELLE',
    owner: true,
  },
  {
    key: 'moanda',
    province: 'G2',
    pick: 1,
    localite: 'Lemboumbi-Leyou',
    cohort: 'COHORTE_2',
    exploitant: ['Clarisse Bongo Nzé', '+24177102002'],
    capacity: 800,
    status: 'OPERATIONNELLE',
  },
  {
    key: 'portgentil',
    province: 'G8',
    pick: 0,
    localite: 'Bendjé',
    cohort: 'COHORTE_1',
    exploitant: ['Hervé Rapontchombo', '+24177108001'],
    gps: [-0.717, 8.781],
    capacity: 2500,
    infra: [
      ['BATIMENT_ELEVAGE', 2, 450],
      ['PANNEAUX_SOLAIRES', 1],
      ['FOSSE_CADAVRES', 1],
    ],
    status: 'OPERATIONNELLE',
    owner: true,
    verified: true,
  },
  {
    key: 'omboue',
    province: 'G8',
    pick: 1,
    localite: 'Etimboué',
    cohort: 'COHORTE_2',
    exploitant: ['Gisèle Ogandaga', '+24177108002'],
    capacity: 600,
    status: 'OPERATIONNELLE',
  },
  {
    key: 'oyem',
    province: 'G9',
    pick: 0,
    localite: 'Woleu',
    cohort: 'COHORTE_1',
    exploitant: ['Fabrice Nguema Ella', '+24177109001'],
    gps: [1.599, 11.579],
    capacity: 1500,
    infra: [
      ['BATIMENT_ELEVAGE', 1, 300],
      ['LOGEMENT_GARDIEN', 1],
    ],
    status: 'OPERATIONNELLE',
    owner: true,
  },
  {
    key: 'bitam',
    province: 'G9',
    pick: 1,
    localite: 'Ntem',
    cohort: 'COHORTE_2',
    exploitant: ['Brigitte Obiang', '+24177109002'],
    gps: [2.078, 11.5],
    capacity: 900,
    status: 'OPERATIONNELLE',
  },
  {
    key: 'mouila',
    province: 'G4',
    pick: 0,
    localite: 'Douya-Onoye',
    cohort: 'COHORTE_1',
    exploitant: ['Didier Mboumba', '+24177104001'],
    gps: [-1.866, 11.057],
    capacity: 1200,
    infra: [['BATIMENT_ELEVAGE', 1, 250]],
    status: 'OPERATIONNELLE',
    owner: true,
  },
  {
    key: 'lambarene',
    province: 'G3',
    pick: 0,
    localite: 'Ogooué et des Lacs',
    cohort: 'COHORTE_2',
    exploitant: ['Yolande Ndjave', '+24177103001'],
    gps: [-0.7, 10.24],
    capacity: 1000,
    status: 'OPERATIONNELLE',
  },
  {
    key: 'tchibanga',
    province: 'G5',
    pick: 0,
    localite: 'Mougoutsi',
    cohort: 'COHORTE_1',
    exploitant: ['Joseph Mavoungou', '+24177105001'],
    gps: [-2.85, 11.03],
    capacity: 700,
    status: 'OPERATIONNELLE',
  },
];

/**
 * Bands (L3). Offsets are days from today; lastOffset = last daily entry.
 * `close` sells every bird left on that day (VENTE sortie → auto-closure).
 */
const BANDS = [
  {
    farm: 'mba',
    key: 'mbaClosed',
    name: 'Bande Cobb octobre',
    building: 'Bâtiment A',
    breed: 'Cobb 500',
    quantity: 1200,
    openOffset: -60,
    lastOffset: -19,
    initialAgeDays: 0,
    seed: 11,
    close: { offset: -18, price: 3200, buyer: 'Grossiste Owendo (démo)' },
  },
  {
    farm: 'mba',
    key: 'mbaActive',
    name: 'Bande Cobb novembre',
    building: 'Bâtiment B',
    breed: 'Cobb 500',
    quantity: 1500,
    openOffset: -26,
    lastOffset: -1,
    initialAgeDays: 0,
    seed: 12,
  },
  {
    farm: 'ndong1',
    key: 'ndongActive',
    name: 'Bande Ross 1',
    building: 'Bâtiment 1',
    breed: 'Ross 308',
    quantity: 2000,
    openOffset: -20,
    lastOffset: 0,
    initialAgeDays: 0,
    seed: 21,
  },
  {
    // Bought as 21-day-old birds: J+21 at opening.
    farm: 'ndong2',
    key: 'ndongJ21',
    name: 'Bande J+21 (poulets démarrés)',
    building: 'Poulailler unique',
    breed: 'Cobb 500',
    quantity: 800,
    openOffset: -14,
    lastOffset: -1,
    initialAgeDays: 21,
    initialAvgWeightG: 880,
    seed: 31,
  },
  {
    farm: 'franceville',
    key: 'fvTrouble',
    name: 'Bande Franceville',
    building: 'Bâtiment principal',
    breed: 'Cobb 500',
    quantity: 1000,
    openOffset: -28,
    lastOffset: 0,
    initialAgeDays: 0,
    seed: 41,
    trouble: true,
  },
  {
    farm: 'portgentil',
    key: 'pgActive',
    name: 'Bande Port-Gentil',
    building: 'Bâtiment Nord',
    breed: 'Ross 308',
    quantity: 1200,
    openOffset: -17,
    lastOffset: 0,
    initialAgeDays: 0,
    seed: 51,
    lowFeed: true,
  },
];

/** Rough Estuaire outline for the demo (NOT the official boundary). */
const G1_DEMO_OUTLINE = {
  type: 'Polygon',
  coordinates: [
    [
      [9.25, 1.05],
      [9.8, 1.2],
      [10.35, 1.05],
      [10.65, 0.6],
      [10.55, 0.0],
      [10.2, -0.35],
      [9.55, -0.5],
      [9.25, -0.1],
      [9.25, 1.05],
    ],
  ],
};

// ---------------------------------------------------------------- run
const creds = {
  admin: { phone: ADMIN_PHONE, code: ADMIN_CODE },
  owners: [],
  institutions: [],
  buyers: [],
};
const notes = [];
const skipped = [];

async function main() {
  log(`API ${API}`);
  const health = await api('GET', '/market/listings', { ok: [200] }).catch(
    (e) => {
      throw new Error(`Serveur injoignable sur ${API} : ${e.message}`);
    },
  );
  void health;

  step('Administrateur plateforme');
  const admin = await login(ADMIN_PHONE, ADMIN_CODE);
  const existing = await get('/programme/farms?pageSize=1', admin);
  if (existing.total > 0) {
    throw new Error(
      `Le registre contient déjà ${existing.total} ferme(s) : ce script se lance sur une base vide (recréez-la puis redémarrez le serveur).`,
    );
  }

  // ----- 1. registry
  step('Territoire : contour de démonstration de l’Estuaire (G1)');
  const provinces = await get('/programme/provinces', admin);
  const provinceByCode = new Map(provinces.map((p) => [p.code, p]));
  await put(
    '/programme/provinces/G1/geometry',
    { geometry: G1_DEMO_OUTLINE },
    admin,
  );
  notes.push(
    'Contour G1 (Estuaire) = polygone approximatif de démonstration, pas la limite officielle ; les autres provinces n’ont pas de contour (contrôle GPS « non vérifiable »).',
  );

  step('Import du registre (CSV POUFA)');
  const csv = readFileSync(CSV_PATH);
  const importCsv = async (dryRun) => {
    const form = new FormData();
    form.append(
      'file',
      new Blob([csv], { type: 'text/csv' }),
      'fermes-poufa.csv',
    );
    form.append('dryRun', String(dryRun));
    return (
      await api('POST', '/programme/farms/import', { token: admin, form })
    ).data;
  };
  const dry = await importCsv(true);
  log(
    `essai à blanc : lues ${dry.read}, à créer ${dry.created}, déjà présentes ${dry.matched}, rejetées ${dry.rejected}`,
  );
  if (dry.rejected > 0) {
    for (const l of dry.lines.filter((x) => x.outcome === 'REJETEE'))
      log(`  rejet ligne ${l.line ?? '?'} ${l.name} : ${l.reason}`);
  }
  const real = await importCsv(false);
  log(
    `import réel : créées ${real.created}, déjà présentes ${real.matched}, rejetées ${real.rejected}`,
  );

  const all = await get('/programme/farms?pageSize=200', admin);
  const byProvince = new Map();
  for (const f of all.items) {
    const code = f.province?.code;
    if (!byProvince.has(code)) byProvince.set(code, []);
    byProvince.get(code).push(f);
  }
  for (const list of byProvince.values())
    list.sort((a, b) => a.code.localeCompare(b.code));

  step('Enrichissement de 15 fiches');
  const farms = {}; // key -> { id, code, name, sheet }
  for (const s of SHEETS) {
    const f = byProvince.get(s.province)?.[s.pick];
    if (!f) throw new Error(`Pas de ferme n°${s.pick} en ${s.province}`);
    const prov = provinceByCode.get(s.province);
    const loc = prov.localites.find((l) => l.name === s.localite);
    if (!loc)
      throw new Error(`Localité ${s.localite} introuvable en ${s.province}`);
    const sheetPatch = {
      localiteId: loc.id,
      cohort: s.cohort,
      exploitantName: s.exploitant[0],
      exploitantPhone: s.exploitant[1],
      capacityPlaces: s.capacity,
      amiRef: `AMI-POUFA-2026-${f.code.replace('-', '')}`,
      // ndong1/ndong2 share an exploitant: a corroborating signal only.
      confirmDuplicate: s.owner === 'link' ? true : undefined,
    };
    const patched = await api('PATCH', `/programme/farms/${f.id}`, {
      token: admin,
      body: sheetPatch,
      ok: [200, 409],
    });
    if (patched.status === 409) {
      log(
        `  ${f.code} : doublon probable signalé (${patched.data.message}), confirmé`,
      );
      await patch(
        `/programme/farms/${f.id}`,
        { ...sheetPatch, confirmDuplicate: true },
        admin,
      );
    }
    if (s.gps) {
      const g = await put(
        `/programme/farms/${f.id}/gps`,
        {
          latitude: s.gps[0],
          longitude: s.gps[1],
          source: s.gpsReason ? 'MANUEL' : 'APPAREIL',
          accuracyM: s.gpsReason ? undefined : 8,
          reason: s.gpsReason,
        },
        admin,
      );
      if (g.provinceWarning)
        log(
          `  ${f.code} : avertissement GPS → ${JSON.stringify(g.provinceWarning)}`,
        );
    }
    if (s.infra) {
      await put(
        `/programme/farms/${f.id}/infrastructures`,
        {
          items: s.infra.map(([code, count, surfaceM2]) => ({
            code,
            count,
            ...(surfaceM2 ? { surfaceM2 } : {}),
          })),
        },
        admin,
      );
    }
    if (s.status) {
      await post(
        `/programme/farms/${f.id}/status`,
        { statusCode: s.status },
        admin,
      );
    }
    farms[s.key] = { id: f.id, code: f.code, name: f.name, spec: s };
    log(
      `  ${f.code} ${f.name} — ${s.exploitant[0]} (${s.localite}${s.status ? ', ' + s.status : ', EN_PREPARATION'})`,
    );
  }

  step('Doublon probable confirmé');
  const twin = byProvince.get('G1').find((f) => f.name === 'AGRI VERT');
  const dupBody = {
    name: 'Ferme Agri-Vert',
    provinceCode: 'G1',
    localiteId: provinceByCode
      .get('G1')
      .localites.find((l) => l.name === 'Libreville').id,
    exploitantName: 'Agri Vert SARL (fiche papier)',
    exploitantPhone: '+24177101099',
    capacityPlaces: 1000,
  };
  const dup = await api('POST', '/programme/farms', {
    token: admin,
    body: dupBody,
    ok: [201, 409],
  });
  if (dup.status === 409) {
    log(
      `  409 attendu : ${dup.data.message} (candidats : ${(dup.data.duplicates ?? []).map((d) => d.code ?? 'masqué').join(', ')})`,
    );
    const confirmed = await post(
      '/programme/farms',
      { ...dupBody, confirmDuplicate: true },
      admin,
    );
    farms.dup = {
      id: confirmed.id,
      code: confirmed.code,
      name: confirmed.name,
    };
    log(
      `  créée avec confirmDuplicate : ${confirmed.code} « ${confirmed.name} », doublon de ${twin?.code ?? '?'} AGRI VERT`,
    );
  } else {
    farms.dup = { id: dup.data.id, code: dup.data.code, name: dup.data.name };
    notes.push(
      `« Ferme Agri-Vert » n'a pas été détectée comme doublon (créée sans 409) — à regarder.`,
    );
  }

  // ----- 2. owners
  step('Activation des comptes exploitants');
  const ownersByPhone = new Map();
  for (const s of SHEETS.filter((x) => x.owner)) {
    const farm = farms[s.key];
    const res = await post(
      `/programme/farms/${farm.id}/activate-owner`,
      s.owner === 'link' ? { linkExistingUser: true } : {},
      admin,
    );
    const phone = res.owner.phone;
    if (!ownersByPhone.has(phone)) {
      ownersByPhone.set(phone, {
        fullName: res.owner.fullName,
        phone,
        code: res.loginCode,
        farms: [],
      });
    }
    ownersByPhone.get(phone).farms.push(`${farm.code} ${farm.name}`);
    log(
      `  ${farm.code} → ${res.owner.fullName} ${phone}${res.linkedExistingAccount ? ' (compte existant rattaché)' : ''}`,
    );
  }
  const tokens = {};
  for (const o of ownersByPhone.values()) {
    o.token = await login(o.phone, o.code);
  }
  for (const s of SHEETS.filter((x) => x.owner)) {
    farms[s.key].token = ownersByPhone.get(s.exploitant[1]).token;
    tokens[s.key] = farms[s.key].token;
  }

  // Suspension last: after the owner account exists.
  for (const s of SHEETS.filter((x) => x.suspend)) {
    await post(
      `/programme/farms/${farms[s.key].id}/status`,
      { statusCode: 'SUSPENDUE', reason: s.suspend },
      admin,
    );
    log(`  ${farms[s.key].code} suspendue : ${s.suspend}`);
  }

  // ----- 4a. Market verification (before listings)
  step('Vérification Market (isVerified)');
  for (const s of SHEETS.filter((x) => x.verified)) {
    await patch(
      `/admin/farms/${farms[s.key].id}`,
      {
        isVerified: true,
        administrativeCity:
          s.localite === 'Bendjé' ? 'Port-Gentil' : 'Libreville',
      },
      admin,
    );
    log(`  ${farms[s.key].code} vérifiée`);
  }

  // ----- 3. bands
  step('Bandes, stock d’aliment, saisies journalières');
  const breeds = await get('/breeds', tokens.mba);
  const breedId = (name) => {
    const b = breeds.find((x) => x.name === name && !x.farmId);
    if (!b) throw new Error(`Souche ${name} introuvable`);
    return b.id;
  };
  const sims = BANDS.map((b) => ({ ...b, sim: simulateBand(b) }));
  const buildings = {}; // farmKey:name -> id
  const bands = {}; // key -> { id, code, farm }

  for (const farmKey of [...new Set(BANDS.map((b) => b.farm))]) {
    const farm = farms[farmKey];
    const token = farm.token;
    const farmBands = sims.filter((b) => b.farm === farmKey);
    for (const b of farmBands) {
      const k = `${farmKey}:${b.building}`;
      if (!buildings[k]) {
        const bld = await post(
          `/farms/${farm.id}/buildings`,
          { name: b.building, capacity: Math.round(b.quantity * 1.1) },
          token,
        );
        buildings[k] = bld.id;
      }
    }
    // Feed bought before the first opening, per phase: what the entries eat
    // + a margin (only 2 days of finition/croissance left on the low-stock farm).
    const need = { DEMARRAGE: 0, CROISSANCE: 0, FINITION: 0 };
    const lastDay = { DEMARRAGE: 0, CROISSANCE: 0, FINITION: 0 };
    for (const b of farmBands) {
      for (const e of b.sim.entries) {
        need[e.feedPhase] += e.feedQuantity;
        lastDay[e.feedPhase] = Math.max(lastDay[e.feedPhase], e.feedQuantity);
      }
    }
    const firstOpen = Math.min(...farmBands.map((b) => b.openOffset));
    const low = farmBands.some((b) => b.lowFeed);
    const labels = {
      DEMARRAGE: 'Aliment démarrage poulet chair',
      CROISSANCE: 'Aliment croissance poulet chair',
      FINITION: 'Aliment finition poulet chair',
    };
    const prices = { DEMARRAGE: 17500, CROISSANCE: 16500, FINITION: 16000 };
    let lotNo = 1;
    for (const phase of Object.keys(need)) {
      const margin = low && phase !== 'DEMARRAGE' ? 2 : 10;
      const kg = need[phase] + lastDay[phase] * margin;
      if (need[phase] === 0 && phase === 'DEMARRAGE') continue;
      const bags = Math.max(4, Math.ceil(kg / 50));
      await post(
        `/farms/${farm.id}/inputs`,
        {
          kind: 'ALIMENT',
          foodType: phase,
          feedPhase: phase,
          entryType: 'BAG',
          productName: labels[phase],
          supplier: 'Provenderie de démonstration',
          supplierLotNumber: `${farm.code}-${phase.slice(0, 3)}-${String(lotNo++).padStart(2, '0')}`,
          receivedDate: day(firstOpen - 1),
          expirationDate: day(150),
          numberOfBags: bags,
          bagSizeKg: 50,
          unit: 'SAC',
          unitPriceFcfa: prices[phase],
        },
        token,
      );
    }

    for (const b of farmBands) {
      const batch = await post(
        `/farms/${farm.id}/batches`,
        {
          batchName: b.name,
          integrationDate: day(b.openOffset),
          quantityAtStart: b.quantity,
          type: 'CHAIR',
          species: 'POULET',
          breedId: breedId(b.breed),
          buildingId: buildings[`${farmKey}:${b.building}`],
          couvoirSupplier: 'Couvoir de démonstration',
          chickLotNumber: `PDJ-${day(b.openOffset).replaceAll('-', '')}`,
          hatchDate: day(b.openOffset - 1 - b.initialAgeDays),
          chickUnitPriceFcfa: b.initialAgeDays > 0 ? 1600 : 650,
          ...(b.initialAgeDays > 0
            ? {
                initialAgeDays: b.initialAgeDays,
                initialAvgWeightG: b.initialAvgWeightG,
              }
            : {}),
        },
        token,
      );
      bands[b.key] = { id: batch.id, code: batch.code, farmKey, name: b.name };
      for (const e of b.sim.entries) {
        await post(
          `/farms/${farm.id}/batches/${batch.id}/daily-entries`,
          e,
          token,
        );
      }
      log(
        `  ${farm.code} ${batch.code ?? batch.id} « ${b.name} » : ${b.quantity} sujets, J+${b.initialAgeDays} à l'ouverture, ${b.sim.entries.length} saisies, ${b.sim.alive} vivants simulés`,
      );
      if (b.close) {
        const fresh = await get(`/farms/${farm.id}/batches/${batch.id}`, token);
        const alive = fresh.quantityAlive ?? fresh.batch?.quantityAlive;
        await post(
          `/farms/${farm.id}/bandes/${batch.id}/sorties`,
          {
            sortieDate: day(b.close.offset),
            count: alive,
            reasonCode: 'VENTE_VIF',
            unitPriceFcfa: b.close.price,
            recipientName: b.close.buyer,
            weightKg: Math.round(alive * weightKg(42) * 10) / 10,
            notes: 'Vente de fin de bande (démo)',
          },
          token,
        );
        const after = await get(`/farms/${farm.id}/batches/${batch.id}`, token);
        const status = after.status ?? after.batch?.status;
        if (status !== 'CLOTURE') {
          await post(
            `/farms/${farm.id}/batches/${batch.id}/cloture`,
            {},
            token,
          );
        }
        log(
          `    vendue (${alive} sujets) puis clôturée (${status === 'CLOTURE' ? 'auto' : 'manuelle'})`,
        );
      }
    }
  }

  step('Sorties, sanitaire, tâches');
  // A cull (REFORME) and a gift on active bands: sortie history.
  await post(
    `/farms/${farms.mba.id}/bandes/${bands.mbaActive.id}/sorties`,
    {
      sortieDate: day(-5),
      count: 12,
      reasonCode: 'REFORME',
      notes: 'Sujets chétifs retirés',
    },
    tokens.mba,
  );
  await post(
    `/farms/${farms.ndong1.id}/bandes/${bands.ndongActive.id}/sorties`,
    {
      sortieDate: day(-2),
      count: 6,
      reasonCode: 'DON',
      recipientName: 'Paroisse de Kango',
      notes: 'Don (démo)',
    },
    tokens.ndong1,
  );

  // Health events.
  await post(
    `/farms/${farms.franceville.id}/batches/${bands.fvTrouble.id}/health-events`,
    {
      kind: 'MALADIE',
      occurredAt: atNoon(-1),
      severity: 'ROUGE',
      title: 'Mortalité en hausse, fientes sanglantes',
      symptoms:
        'Abattement, plumes ébouriffées, diarrhée sanglante, baisse de l’abreuvement',
      disease: 'Coccidiose (suspicion)',
      treatmentGiven:
        'Anticoccidien dans l’eau de boisson (en attente du vétérinaire)',
      vetConsulted: false,
    },
    tokens.franceville,
  );
  await post(
    `/farms/${farms.franceville.id}/batches/${bands.fvTrouble.id}/health-events`,
    {
      kind: 'VISITE_VETO',
      occurredAt: atNoon(-10),
      severity: 'VERT',
      title: 'Visite de routine',
      notes: 'Bon état général, litière à renouveler',
      vetConsulted: true,
      vetName: 'Dr Nzamba (démo)',
      resolved: true,
    },
    tokens.franceville,
  );
  await post(
    `/farms/${farms.ndong1.id}/batches/${bands.ndongActive.id}/health-events`,
    {
      kind: 'MORTALITE',
      occurredAt: atNoon(-6),
      severity: 'JAUNE',
      quantity: 15,
      title: 'Coup de chaleur après coupure d’électricité',
      description: 'Ventilation arrêtée 3 h, 15 sujets morts retrouvés le soir',
    },
    tokens.ndong1,
  );

  // Vaccination calendars (future steps) + one past vaccine done by hand.
  for (const key of [
    'mbaActive',
    'ndongActive',
    'ndongJ21',
    'fvTrouble',
    'pgActive',
  ]) {
    const band = bands[key];
    const farm = farms[band.farmKey];
    try {
      await post(
        `/farms/${farm.id}/batches/${band.id}/prophylaxis/generate`,
        {},
        farm.token,
      );
    } catch (e) {
      skipped.push(`Calendrier vaccinal ${band.name} : ${e.message}`);
    }
  }
  const manual = await post(
    `/farms/${farms.mba.id}/vaccine-schedules/manual`,
    {
      lotIds: [bands.mbaActive.id],
      careType: 'VACCIN',
      name: 'Gumboro (IBD) — rappel',
      scheduledDate: day(-12),
      route: 'Eau de boisson',
      dosage: '1 dose / sujet',
      notes: 'Ajouté par l’exploitant (démo)',
    },
    tokens.mba,
  );
  const manualEvent = Array.isArray(manual)
    ? manual[0]
    : (manual.events?.[0] ?? manual);
  if (manualEvent?.id) {
    await post(
      `/farms/${farms.mba.id}/batches/${bands.mbaActive.id}/prophylaxis/${manualEvent.id}/complete`,
      { completedAt: atNoon(-12), notes: 'Lot vaccin IBD-2610 (démo)' },
      tokens.mba,
    );
  } else {
    skipped.push(
      `Vaccin manuel : réponse inattendue ${JSON.stringify(manual).slice(0, 200)}`,
    );
  }

  // Tasks: one overdue, two upcoming.
  await post(
    `/farms/${farms.mba.id}/tasks`,
    {
      title: 'Renouveler la litière du bâtiment B',
      dueDate: day(-2),
      batchId: bands.mbaActive.id,
    },
    tokens.mba,
  );
  await post(
    `/farms/${farms.mba.id}/tasks`,
    {
      title: 'Commander l’aliment finition',
      dueDate: day(2),
      notes: 'Prévoir 40 sacs',
    },
    tokens.mba,
  );
  await post(
    `/farms/${farms.franceville.id}/tasks`,
    {
      title: 'Appeler le vétérinaire (suspicion coccidiose)',
      dueDate: day(0),
      batchId: bands.fvTrouble.id,
    },
    tokens.franceville,
  );
  await post(
    `/farms/${farms.portgentil.id}/tasks`,
    { title: 'Réceptionner la livraison d’aliment', dueDate: day(1) },
    tokens.portgentil,
  );

  // ----- 4b. Market
  step('Market : annonces');
  const listing = async (farmKey, body, publish = true) => {
    const farm = farms[farmKey];
    const l = await post(`/farms/${farm.id}/market/listings`, body, farm.token);
    if (publish)
      await post(
        `/farms/${farm.id}/market/listings/${l.id}/publish`,
        {},
        farm.token,
      );
    return l.id;
  };
  const L = {};
  L.mbaPre = await listing('mba', {
    kind: 'PRE',
    product: 'BIRDS',
    batchId: bands.mbaActive.id,
    description:
      'Poulets Cobb 500 prêts mi-novembre, nourris sans antibiotique de croissance',
    unitPriceFcfa: 3500,
    quantityPublished: 400,
    minOrderQty: 5,
    readyDate: day(10),
    depositPct: 30,
    pickupAvailable: true,
    deliveryAvailable: true,
    deliveryFeeFcfa: 2000,
  });
  L.mbaNow = await listing('mba', {
    kind: 'NOW',
    product: 'BIRDS',
    batchId: bands.mbaActive.id,
    description: 'Poulets vifs disponibles à la ferme (Ntoum)',
    unitPriceFcfa: 3000,
    quantityPublished: 100,
    minOrderQty: 1,
    pickupAvailable: true,
  });
  L.ndongPre = await listing('ndong1', {
    kind: 'PRE',
    product: 'BIRDS',
    batchId: bands.ndongActive.id,
    description: 'Ross 308 pour fêtes de fin d’année',
    unitPriceFcfa: 3200,
    quantityPublished: 800,
    minOrderQty: 10,
    readyDate: day(15),
    depositPct: 20,
    pickupAvailable: true,
  });
  L.ndongPaused = await listing('ndong1', {
    kind: 'NOW',
    product: 'BIRDS',
    batchId: bands.ndongActive.id,
    unitPriceFcfa: 2800,
    quantityPublished: 50,
    pickupAvailable: true,
    description: 'Petits poulets (annonce en pause)',
  });
  await post(
    `/farms/${farms.ndong1.id}/market/listings/${L.ndongPaused}/pause`,
    {},
    tokens.ndong1,
  );
  L.pgNow = await listing('portgentil', {
    kind: 'NOW',
    product: 'BIRDS',
    batchId: bands.pgActive.id,
    description: 'Poulets vifs Port-Gentil, livraison en ville',
    unitPriceFcfa: 3000,
    quantityPublished: 150,
    pickupAvailable: true,
    deliveryAvailable: true,
    deliveryFeeFcfa: 1500,
  });
  L.pgDraft = await listing(
    'portgentil',
    {
      kind: 'PRE',
      product: 'BIRDS',
      batchId: bands.pgActive.id,
      unitPriceFcfa: 3300,
      quantityPublished: 300,
      readyDate: day(20),
      depositPct: 25,
      pickupAvailable: true,
      description: 'Brouillon non publié',
    },
    false,
  );
  log(`  ${Object.keys(L).length} annonces (dont 1 en pause, 1 brouillon)`);

  step('Acheteurs');
  const buyers = [
    {
      key: 'particulier',
      fullName: 'Nadège Ilougou',
      phone: '+24166200001',
      type: 'PARTICULIER',
      city: 'Libreville',
    },
    {
      key: 'restaurant',
      fullName: 'Christian Engonga',
      phone: '+24166200002',
      type: 'RESTAURANT',
      organizationName: 'Restaurant Le Fromager (démo)',
      city: 'Libreville',
    },
  ];
  const btok = {};
  for (const b of buyers) {
    const code = loginCode();
    const { key, ...profile } = b;
    const res = await post('/auth/register-buyer', { ...profile, code });
    btok[key] = res.accessToken;
    creds.buyers.push({ ...b, code });
    log(
      `  ${b.fullName} (${b.type}${b.organizationName ? ', ' + b.organizationName : ''})`,
    );
  }

  step('Market : demandes et commandes');
  const request = async (buyerKey, body) =>
    post('/market/orders', body, btok[buyerKey]);
  const farmOrders = async (farmKey) =>
    get(`/farms/${farms[farmKey].id}/market/orders`, farms[farmKey].token);

  // 1) Particulier, NOW, pickup → accepted → delivered and paid cash.
  const r1 = await request('particulier', {
    listingId: L.mbaNow,
    quantity: 10,
    fulfilment: 'PICKUP',
    note: 'Je passe samedi matin',
  });
  const a1 = await post(
    `/farms/${farms.mba.id}/market/orders/${r1.id}/accept`,
    {},
    tokens.mba,
  );
  const order1 = a1.orderId ?? a1.order?.id;
  await post(
    `/farms/${farms.mba.id}/caisse/open`,
    { openingBalanceFcfa: 25000 },
    tokens.mba,
  ).catch((e) => {
    if (e.status !== 400 && e.status !== 409) throw e;
  });
  if (order1) {
    try {
      const o = await get(
        `/farms/${farms.mba.id}/orders/${order1}`,
        tokens.mba,
      );
      const total =
        o.totalFcfa ?? o.sale?.totalFcfa ?? o.sale?.totalAmountFcfa ?? 30000;
      await post(
        `/farms/${farms.mba.id}/orders/${order1}/livrer`,
        {
          payment: {
            method: 'CASH',
            amountFcfa: total,
            idempotencyKey: `seed-livrer-${order1}`,
          },
        },
        tokens.mba,
      );
    } catch (e) {
      skipped.push(`Livraison de la commande Market n°1 : ${e.message}`);
    }
  }
  // 2) Restaurant, PRE with delivery → accepted → 30 % deposit recorded.
  const r2 = await request('restaurant', {
    listingId: L.mbaPre,
    quantity: 60,
    fulfilment: 'DELIVERY',
    address: 'Quartier Louis, Libreville',
    contactPhone: '+24166200002',
    note: 'Livraison avant 10 h svp',
  });
  const a2 = await post(
    `/farms/${farms.mba.id}/market/orders/${r2.id}/accept`,
    {},
    tokens.mba,
  );
  const order2 = a2.orderId ?? a2.order?.id;
  if (order2) {
    try {
      // Snapshotted on the request at request time (30 % of the lines).
      const due =
        r2.depositRequiredFcfa ||
        a2.depositRequiredFcfa ||
        Math.round(60 * 3500 * 0.3);
      await post(
        `/farms/${farms.mba.id}/orders/${order2}/deposit`,
        {
          method: 'CASH',
          amountFcfa: due,
          idempotencyKey: `seed-deposit-${order2}`,
        },
        tokens.mba,
      );
    } catch (e) {
      skipped.push(`Acompte de la commande Market n°2 : ${e.message}`);
    }
  }
  // 3) Restaurant on Ndong's preorder → rejected by the farm.
  const r3 = await request('restaurant', {
    listingId: L.ndongPre,
    quantity: 100,
    fulfilment: 'PICKUP',
    note: 'Pour le réveillon',
  });
  await post(
    `/farms/${farms.ndong1.id}/market/orders/${r3.id}/reject`,
    {
      reason:
        'Quantité déjà réservée pour cette date, rappelez-nous pour janvier.',
    },
    tokens.ndong1,
  );
  // 4) Particulier on Ndong's preorder → left waiting for an answer.
  await request('particulier', {
    listingId: L.ndongPre,
    quantity: 12,
    fulfilment: 'PICKUP',
    note: 'Pour un baptême',
  });
  // 5) Particulier on Port-Gentil → waiting; 6) one cancelled by the buyer.
  await request('particulier', {
    listingId: L.pgNow,
    quantity: 20,
    fulfilment: 'DELIVERY',
    address: 'Quartier Balise, Port-Gentil',
  });
  const r6 = await request('restaurant', {
    listingId: L.pgNow,
    quantity: 30,
    fulfilment: 'PICKUP',
  });
  await post(`/market/orders/${r6.id}/cancel`, {}, btok.restaurant);
  // 7) Restaurant, accepted but deposit not paid yet (Port-Gentil has no deposit %: plain accepted order).
  const r7 = await request('restaurant', {
    listingId: L.pgNow,
    quantity: 25,
    fulfilment: 'PICKUP',
    note: 'Commande hebdomadaire',
  });
  await post(
    `/farms/${farms.portgentil.id}/market/orders/${r7.id}/accept`,
    {},
    tokens.portgentil,
  );
  const states = {};
  for (const k of ['mba', 'ndong1', 'portgentil']) {
    for (const o of (await farmOrders(k)).items ?? (await farmOrders(k))) {
      const s = o.state ?? o.status;
      states[s] = (states[s] ?? 0) + 1;
    }
  }
  log(`  demandes par état : ${JSON.stringify(states)}`);

  // ----- 5. institutions
  step('Comptes institutionnels');
  await post(
    '/programme/access/profiles',
    {
      code: 'AGENT_PROVINCIAL',
      label: 'Agent technique provincial (démo)',
      scopeKind: 'PROVINCES',
      matrix: {
        REGISTRE: ['CONSULTER'],
        TECHNIQUE: ['CONSULTER', 'VALIDER'],
        INTRANTS: ['CONSULTER'],
        PARAMETRES: ['CONSULTER'],
      },
    },
    admin,
  );
  const memberships = [
    {
      profileCode: 'DGE',
      fullName: 'Direction Générale de l’Élevage (démo)',
      phone: '+24162300001',
      check:
        'Registre national (lecture/écriture fiches), pilotage, paramètres de suivi',
    },
    {
      profileCode: 'VETERINAIRE',
      fullName: 'Dr Aimée Koumba (Services vétérinaires)',
      phone: '+24162300002',
      check:
        'Volet sanitaire de toutes les fermes, paramètres sanitaires, déclaration d’événements',
    },
    {
      profileCode: 'AGENT_TECHNIQUE',
      fullName: 'Serge Mbina (agent technique)',
      phone: '+24162300003',
      farmCodes: ['mba', 'ndong1', 'ndong2'],
      check:
        'Périmètre FERMES : seulement 3 fermes (Mba, Ndong ×2), suivi technique',
    },
    {
      profileCode: 'AGENT_PROVINCIAL',
      fullName: 'Lucie Abessolo (agent provincial Estuaire)',
      phone: '+24162300004',
      provinceCodes: ['G1'],
      check:
        'Profil personnalisé, périmètre PROVINCES = G1 : toutes les fermes de l’Estuaire, aucune autre',
    },
    {
      profileCode: 'ADMIN',
      fullName: 'Thierry Nzoghe (administrateur du programme)',
      phone: '+24162300005',
      check:
        'Administration : comptes, profils, listes, territoires, activation des exploitants',
    },
    {
      profileCode: 'MAEDR',
      fullName: 'MAEDR — cellule statistique (démo)',
      phone: '+24162300006',
      check: 'Périmètre AGRÉGÉ : pilotage consolidé, aucune fiche de ferme',
    },
    {
      profileCode: 'ANINF',
      fullName: 'ANINF — auditeur (démo)',
      phone: '+24162300007',
      check:
        'Périmètre AUDIT : journal d’audit, scellés, export ; rien d’autre',
    },
    {
      profileCode: 'BCEG',
      fullName: 'BCEG — chargé de crédit (démo)',
      phone: '+24162300008',
      check:
        'Périmètre FINANCÉ : vide tant que le consentement n’existe pas (écran « aucune ferme »)',
    },
    {
      profileCode: 'AGENT_TECHNIQUE',
      fullName: 'Ancien agent (suspendu)',
      phone: '+24162300009',
      farmCodes: ['franceville'],
      suspend: true,
      check: 'Rattachement suspendu : la connexion ou l’accès doit être refusé',
    },
  ];
  for (const m of memberships) {
    const body = {
      fullName: m.fullName,
      phone: m.phone,
      profileCode: m.profileCode,
      ...(m.provinceCodes ? { provinceCodes: m.provinceCodes } : {}),
      ...(m.farmCodes ? { farmIds: m.farmCodes.map((k) => farms[k].id) } : {}),
    };
    const res = await post('/programme/access/memberships', body, admin);
    if (m.suspend)
      await patch(
        `/programme/access/memberships/${res.id}`,
        { active: false },
        admin,
      );
    const scope = m.provinceCodes
      ? `PROVINCES ${m.provinceCodes.join(', ')}`
      : m.farmCodes
        ? `FERMES ${m.farmCodes.map((k) => farms[k].code).join(', ')}`
        : (res.profile?.scopeKind ?? res.scopeKind ?? '');
    creds.institutions.push({
      ...m,
      code: res.loginCode,
      scope,
      suspended: !!m.suspend,
    });
    log(
      `  ${m.profileCode.padEnd(16)} ${m.phone} ${scope}${m.suspend ? ' (suspendu)' : ''}`,
    );
  }
  // Each active institution signs in once (INSTITUTION_OTP=off: code only).
  for (const i of creds.institutions) {
    const res = await api('POST', '/auth/login', {
      body: { phone: i.phone, code: i.code },
      ok: [201, 401, 403],
    });
    let me = null;
    if (res.status === 201 && res.data.accessToken) {
      const r = await api('GET', '/programme/access/me', {
        token: res.data.accessToken,
        ok: [200, 403],
      });
      me = r.status === 200 ? r.data : `403 ${r.data?.message ?? ''}`;
    } else if (res.data?.otpRequired) {
      me = 'OTP demandé (INSTITUTION_OTP=sms ?)';
    }
    i.loginCheck =
      res.status === 201
        ? typeof me === 'string'
          ? me
          : `OK (${me?.profile?.code ?? me?.profileCode ?? 'profil'})`
        : `${res.status} ${res.data?.message ?? ''}`;
  }

  // ----- 6. credentials
  for (const [phone, o] of ownersByPhone) {
    creds.owners.push({
      fullName: o.fullName,
      phone,
      code: o.code,
      farms: o.farms,
    });
  }
  writeCredentials(farms, bands, real);
  log(`\n${calls} appels API. Identifiants écrits dans ${OUT}`);
}

const OWNER_CHECKS = {
  '+24177101001':
    'Tableau de bord à 2 bandes (1 clôturée + 1 active J+26), stock aliment, ventes, caisse, commandes Market (livrée, acompte), annonces PRE/NOW, vaccin fait + calendrier, tâche en retard',
  '+24177101002':
    'Propriétaire de 2 fermes (sélecteur de ferme) : bande Ross active + bande J+21 ; annonces (PRE + une en pause), demande refusée/en attente, sorties DON',
  '+24177101003':
    'Fiche avec avertissement GPS hors province (Franceville pour une ferme de l’Estuaire), aucune bande : état vide',
  '+24177101005': 'Ferme SUSPENDUE (motif) : bannière/blocages ventes',
  '+24177102001':
    'Bande en difficulté : pic de mortalité + baisse d’eau → alertes rouges, événement MALADIE, tâche vétérinaire',
  '+24177108001':
    'Stock d’aliment bas (autonomie) → alerte ALIMENT, annonce NOW + brouillon, commande acceptée',
  '+24177109001': 'Ferme opérationnelle activée sans bande (Woleu-Ntem)',
  '+24177104001': 'Ferme opérationnelle activée sans bande (Ngounié)',
};

function writeCredentials(farms, bands, report) {
  const lines = [];
  const now = new Date().toISOString();
  lines.push('# POUFA demo — identifiants (SECRET, hors dépôt)', '');
  lines.push(
    `Généré le ${now} par backend/scripts/seed-poufa-demo.mjs sur ${API}.`,
  );
  lines.push(
    'Connexion = téléphone + code. `INSTITUTION_OTP=off` : les institutions se connectent avec le code seul (pas de SMS).',
    '',
  );
  lines.push('## Administrateur plateforme', '');
  lines.push('| Téléphone | Code | À vérifier |', '|---|---|---|');
  lines.push(
    `| ${creds.admin.phone} | ${creds.admin.code} | Registre national (151 fermes), import, fiches enrichies, doublon confirmé, statuts, GPS, activation exploitants, profils & rattachements, /app/platform |`,
    '',
  );
  lines.push('## Exploitants (PROPRIETAIRE)', '');
  lines.push(
    '| Nom | Téléphone | Code | Fermes | À vérifier |',
    '|---|---|---|---|---|',
  );
  for (const o of creds.owners) {
    lines.push(
      `| ${o.fullName} | ${o.phone} | ${o.code} | ${o.farms.join('<br>')} | ${OWNER_CHECKS[o.phone] ?? ''} |`,
    );
  }
  lines.push('', '## Institutions (INSTITUTION)', '');
  lines.push(
    '| Profil | Nom | Téléphone | Code | Périmètre | Connexion (contrôle du seed) | À vérifier |',
    '|---|---|---|---|---|---|---|',
  );
  for (const i of creds.institutions) {
    lines.push(
      `| ${i.profileCode}${i.suspended ? ' (suspendu)' : ''} | ${i.fullName} | ${i.phone} | ${i.code} | ${i.scope} | ${i.loginCheck ?? ''} | ${i.check} |`,
    );
  }
  lines.push('', '## Acheteurs Market (ACHETEUR)', '');
  lines.push(
    '| Nom | Type | Téléphone | Code | À vérifier |',
    '|---|---|---|---|---|',
  );
  for (const b of creds.buyers) {
    const check =
      b.type === 'RESTAURANT'
        ? 'Mes achats : précommande acceptée avec acompte, demande refusée, demande annulée, commande acceptée Port-Gentil'
        : 'Catalogue, Mes achats : commande livrée et payée, 2 demandes en attente';
    lines.push(
      `| ${b.fullName}${b.organizationName ? ' — ' + b.organizationName : ''} | ${b.type} | ${b.phone} | ${b.code} | ${check} |`,
    );
  }
  lines.push('', '## Fermes clés', '');
  lines.push('| Clé | Code | Nom | Notes |', '|---|---|---|---|');
  for (const [k, f] of Object.entries(farms)) {
    const s = f.spec;
    const note = !s
      ? 'Doublon probable confirmé (confirmDuplicate) de AGRI VERT'
      : [
          s.suspend ? 'SUSPENDUE' : (s.status ?? 'EN_PREPARATION'),
          s.owner ? 'compte activé' : 'sans compte',
          s.verified ? 'vérifiée Market' : null,
          s.gpsReason ? 'GPS hors province' : null,
        ]
          .filter(Boolean)
          .join(', ');
    lines.push(`| ${k} | ${f.code} | ${f.name} | ${note} |`);
  }
  lines.push('', '## Bandes', '');
  for (const b of Object.values(bands))
    lines.push(`- ${farms[b.farmKey].code} — ${b.code ?? b.id} « ${b.name} »`);
  lines.push('', '## Notes', '');
  lines.push(
    `- Import : ${report.created} fermes créées, ${report.rejected} rejetées ; ~${135} fermes restent des fiches brutes (nom + province), sans exploitant ni compte.`,
  );
  lines.push(
    '- Les saisies journalières antérieures à hier sont marquées « rattrapage » (catchUp) : elles ont été envoyées le jour du seed.',
  );
  for (const n of notes) lines.push(`- ${n}`);
  for (const s of skipped) lines.push(`- Non fait : ${s}`);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
  console.log('\n' + lines.join('\n'));
}

main().catch((e) => {
  console.error('\nÉCHEC :', e.message);
  if (skipped.length) console.error('Ignorés :', skipped);
  process.exit(1);
});
