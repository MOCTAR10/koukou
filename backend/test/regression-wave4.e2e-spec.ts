// Regression wave 4: GET routes that seed on first read stay idempotent under
// concurrency, concurrent internal slaughter codes, and a data-driven sweep
// that calls every GET route of the app (discovered from the OpenAPI document,
// so new routes are covered automatically) and asserts none answers a 5xx.
process.env.INSTITUTION_OTP = 'off';

import { randomBytes, randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  registerBuyer,
  uniquePhone,
} from './helpers/programme-farm.js';

describe('Regression wave 4 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let farmId: string;
  let token: string;
  let instToken: string;
  let buyerToken: string;

  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');
  const today = new Date().toISOString().slice(0, 10);
  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

  const get = (url: string, t = token) =>
    request(server).get(url).set(auth(t));
  const post = (url: string, body: object, t = token) =>
    request(server).post(url).set(auth(t)).send(body);

  async function newBatch(qty: number, f = farmId, t = token): Promise<string> {
    const res = await post(
      `/farms/${f}/batches`,
      {
        batchName: `Lot wave4 ${qty}`,
        integrationDate: daysAgo(45),
        quantityAtStart: qty,
        type: 'CHAIR',
        couvoirSupplier: 'Canabec',
        chickLotNumber: `W4-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        hatchDate: today,
      },
      t,
    ).expect(201);
    return res.body.id as string;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    // Concurrent requests need a listening server: on an idle one, supertest
    // opens and closes an ephemeral port per request and the first to finish
    // resets the others (ECONNRESET).
    await app.listen(0);
    server = app.getHttpServer();
    ds = app.get(DataSource);
    adminToken = (await createPlatformAdmin(server, ds)).token;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Wave4 ${tag}`,
    });
    farmId = farm.farmId;
    token = farm.ownerToken;

    const code = `W4${tag}`;
    await post(
      '/programme/access/profiles',
      {
        code,
        label: `Profil ${code}`,
        scopeKind: 'FARMS',
        matrix: {
          REGISTRE: ['CONSULTER'],
          VENTES: ['CONSULTER'],
          TECHNIQUE: ['CONSULTER'],
        },
      },
      adminToken,
    ).expect(201);
    const phone = uniquePhone();
    const m = await post(
      '/programme/access/memberships',
      { fullName: 'Lecteur wave4', phone, profileCode: code, farmIds: [farmId] },
      adminToken,
    ).expect(201);
    instToken = await login(server, phone, m.body.loginCode as string);

    const buyer = await registerBuyer(server);
    buyerToken = await login(server, buyer.phone, buyer.code);
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  // ------------------------------------- 1. GET that seed on first read

  describe('lectures qui initialisent : idempotentes en concurrence', () => {
    it('bilan de clôture : N premières lectures simultanées, une seule version 1', async () => {
      const batchId = await newBatch(100);
      await ds.query(
        `UPDATE production_batches SET status = 'CLOTURE', closed_at = now() WHERE id = $1`,
        [batchId],
      );
      await ds.query(`DELETE FROM bande_snapshots WHERE batch_id = $1`, [
        batchId,
      ]);

      // A read-only institution does not create the frozen bilan.
      for (const url of [
        `/farms/${farmId}/bandes/${batchId}/snapshots`,
        `/farms/${farmId}/bandes?status=CLOTURE`,
      ]) {
        expect((await get(url, instToken)).status).toBeLessThan(500);
      }
      const [{ n: afterInst }] = await ds.query(
        `SELECT count(*)::int AS n FROM bande_snapshots WHERE batch_id = $1`,
        [batchId],
      );
      expect(afterInst).toBe(0);

      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          i % 2
            ? get(`/farms/${farmId}/bandes/${batchId}/snapshots`)
            : get(`/farms/${farmId}/bandes?status=CLOTURE`),
        ),
      );
      for (const r of results) expect(r.status).toBe(200);
      const [{ n }] = await ds.query(
        `SELECT count(*)::int AS n FROM bande_snapshots WHERE batch_id = $1 AND version = 1`,
        [batchId],
      );
      expect(n).toBe(1);
    });

    it('lots de traçabilité : lectures simultanées, une seule racine par bande, rien pour une institution', async () => {
      const batchId = await newBatch(80);
      await ds.query(
        `DELETE FROM lot_events WHERE lot_id IN (SELECT id FROM trace_lots WHERE batch_id = $1)`,
        [batchId],
      );
      await ds.query(`DELETE FROM trace_lots WHERE batch_id = $1`, [batchId]);

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          get(`/farms/${farmId}/trace/lots?batchId=${batchId}`),
        ),
      );
      for (const r of results) expect(r.status).toBe(200);
      const [{ n }] = await ds.query(
        `SELECT count(*)::int AS n FROM trace_lots WHERE batch_id = $1 AND parent_id IS NULL`,
        [batchId],
      );
      expect(n).toBe(1);

      // Institutions are not allowed on this route, and never write through it.
      const inst = await get(`/farms/${farmId}/trace/lots`, instToken);
      expect(inst.status).toBeLessThan(500);
    });

    it('règles de notification et modèles de rapports : lectures simultanées sans doublon', async () => {
      const results = await Promise.all([
        ...Array.from({ length: 6 }, () =>
          get('/programme/notification-rules', adminToken),
        ),
        ...Array.from({ length: 6 }, () =>
          get('/pilotage/reports/templates', adminToken),
        ),
      ]);
      for (const r of results) expect(r.status).toBe(200);
      const dupRules = await ds.query(
        `SELECT program_id, code FROM notification_rules GROUP BY 1, 2 HAVING count(*) > 1`,
      );
      const dupTemplates = await ds.query(
        `SELECT program_id, code FROM report_templates GROUP BY 1, 2 HAVING count(*) > 1`,
      );
      expect(dupRules).toEqual([]);
      expect(dupTemplates).toEqual([]);
    });

    it('calendrier prophylactique et tâches : institution sans écriture, propriétaire en concurrence', async () => {
      const batchId = await newBatch(60);
      const results = await Promise.all([
        ...Array.from({ length: 4 }, () =>
          get(`/farms/${farmId}/batches/${batchId}/prophylaxis`),
        ),
        ...Array.from({ length: 4 }, () => get(`/farms/${farmId}/tasks`)),
        get(`/farms/${farmId}/batches/${batchId}/prophylaxis`, instToken),
        get(`/farms/${farmId}/tasks`, instToken),
      ]);
      for (const r of results) expect(r.status).toBeLessThan(500);
    });

    it('scan QR public : entrées hostiles, journal borné, jamais de 500', async () => {
      const longCode = 'A'.repeat(4000);
      const ua = 'x'.repeat(5000);
      const probes = [
        '/public/lots/INCONNU',
        `/public/lots/${longCode}`,
        '/public/lots/%00%00',
        '/public/lots/LOT-1?s=a&s=b',
        '/public/lots/LOT-1?s=a&lat[]=1&lng[a]=2',
        '/public/lots/LOT-1?lat=NaN&lng=Infinity&s=zz',
        '/public/lots/LOT-1?lat=1e999&lng=-1e999',
      ];
      const before = await ds.query(`SELECT count(*)::int AS n FROM qr_scans`);
      for (const p of probes) {
        const r = await request(server).get(p).set('User-Agent', ua);
        expect(r.status).toBeLessThan(500);
      }
      const rows = await ds.query(
        `SELECT max(length(code))::int AS c, max(length(user_agent))::int AS u FROM qr_scans`,
      );
      expect(rows[0].c).toBeLessThanOrEqual(80);
      expect(rows[0].u ?? 0).toBeLessThanOrEqual(300);
      const after = await ds.query(`SELECT count(*)::int AS n FROM qr_scans`);
      expect(after[0].n).toBeGreaterThanOrEqual(before[0].n);
    });
  });

  // ------------------------------------------------ 2. slaughter codes

  describe('abattage : code interne', () => {
    it('envois simultanés d’ordres INTERNE : tous acceptés, codes internes distincts', async () => {
      const batchId = await newBatch(400);
      const orders = await Promise.all(
        Array.from({ length: 6 }, () =>
          post(`/farms/${farmId}/slaughter-orders`, {
            batchId,
            slaughterType: 'ABATTU',
            destination: 'INTERNE',
            plannedDate: today,
            birdCount: 10,
          }),
        ),
      );
      for (const o of orders) expect(o.status).toBe(201);
      const sent = await Promise.all(
        orders.map((o) =>
          post(`/farms/${farmId}/slaughter-orders/${o.body.id}/send`, {}),
        ),
      );
      for (const s of sent) expect(s.status).toBe(201);
      const codes = sent.map((s) => s.body.internalBatchCode as string);
      for (const c of codes) expect(c).toMatch(/-I$/);
      expect(new Set(codes).size).toBe(codes.length);
    });
  });

  // -------------------------------------------- 3. sweep of every GET

  describe('balayage : aucune route GET ne répond 5xx', () => {
    interface Route {
      template: string;
      params: string[];
    }

    function discoverGetRoutes(): Route[] {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('sweep').build(),
      );
      const routes: Route[] = [];
      for (const [path, item] of Object.entries(document.paths)) {
        if (!(item as Record<string, unknown>).get) continue;
        routes.push({
          template: path,
          params: [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
        });
      }
      return routes;
    }

    async function sweep(
      routes: Route[],
      tokens: Record<string, string | null>,
      valueOf: (param: string) => string,
    ): Promise<string[]> {
      const failures: string[] = [];
      const jobs: { who: string; url: string; t: string | null }[] = [];
      for (const r of routes) {
        const url = r.template.replace(/\{(\w+)\}/g, (_m, p: string) =>
          valueOf(p),
        );
        for (const [who, t] of Object.entries(tokens)) {
          jobs.push({ who, url, t });
        }
      }
      const queue = [...jobs];
      const worker = async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          let req = request(server).get(job.url);
          if (job.t) req = req.set(auth(job.t));
          try {
            const res = await req;
            if (res.status >= 500) {
              failures.push(`${res.status} ${job.who} GET ${job.url}`);
            }
          } catch (err) {
            failures.push(`ERR ${job.who} GET ${job.url} ${String(err)}`);
          }
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      return failures;
    }

    it('routes GET découvertes : au moins une centaine', () => {
      expect(discoverGetRoutes().length).toBeGreaterThan(100);
    });

    it('identifiants plausibles (ferme réelle, autres UUID inconnus)', async () => {
      const batchId = await newBatch(30);
      const known: Record<string, string> = { farmId, batchId };
      const routes = discoverGetRoutes();
      const failures = await sweep(
        routes,
        {
          owner: token,
          institution: instToken,
          buyer: buyerToken,
          admin: adminToken,
          anonymous: null,
        },
        (p) => known[p] ?? randomUUID(),
      );
      expect(failures).toEqual([]);
    }, 280_000);

    it('identifiants invalides (texte libre au lieu d’un UUID)', async () => {
      const routes = discoverGetRoutes();
      const failures = await sweep(
        routes,
        { owner: token, institution: instToken, buyer: buyerToken },
        () => 'pas-un-uuid',
      );
      expect(failures).toEqual([]);
    }, 280_000);
  });
});
