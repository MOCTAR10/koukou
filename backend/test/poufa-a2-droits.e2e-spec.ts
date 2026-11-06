// POUFA lot A2 droits: third-party reads journaled (#5), the official band
// economics masked without ECONOMIQUE (#6, F6) and the Fermia bonus features
// stored under programme domains kept read-only for institutions (#7).
process.env.INSTITUTION_OTP = 'off';

import { randomBytes, randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  uniquePhone,
} from './helpers/programme-farm.js';

interface Indicator {
  key: string;
  value: number | null;
}

describe('POUFA lot A2 droits — journal, F6, bonus en lecture seule (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let ownerToken: string;
  let ownerId: string;
  let farmId: string;
  let batchId: string;

  const digits = String(Date.now()).slice(-7);
  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');
  const tokens: Record<string, string> = {};

  const get = (url: string, token: string) =>
    request(server).get(url).set(auth(token));
  const send = (
    method: 'post' | 'put' | 'patch' | 'delete',
    url: string,
    body: object,
    token: string,
  ) => request(server)[method](url).set(auth(token)).send(body);

  async function institution(
    profileCode: string,
    scope: { farmIds?: string[] } = {},
  ): Promise<string> {
    const p = uniquePhone();
    const res = await send(
      'post',
      '/programme/access/memberships',
      { fullName: `A2 ${profileCode} ${digits}`, phone: p, profileCode, ...scope },
      adminToken,
    ).expect(201);
    return login(server, p, res.body.loginCode as string);
  }

  /** READ_SENSITIVE events of `userId` on `route` since `since`. */
  async function readEvents(userId: string, route: string, since: Date) {
    const rows: Array<{ n: string }> = await ds.query(
      `SELECT COUNT(*) AS n FROM audit_events
        WHERE actor_user_id = $1 AND route = $2 AND action = 'READ_SENSITIVE'
          AND occurred_at >= $3`,
      [userId, route, since],
    );
    return Number(rows[0].n);
  }

  const userIdOf = (token: string) =>
    String(
      JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
        .sub,
    );

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    adminToken = (await createPlatformAdmin(server, ds)).token;

    const owner = await createProgrammeFarm(server, adminToken, {
      name: `Ferme A2 Droits ${tag}`,
      exploitantName: 'Exploitant A2',
    });
    ownerToken = owner.ownerToken;
    ownerId = owner.ownerId;
    farmId = owner.farmId;

    // A band with a chick price: its official charges, cost and margin exist.
    const batch = await send(
      'post',
      `/farms/${farmId}/batches`,
      {
        batchName: `Bande A2 ${digits}`,
        integrationDate: new Date(Date.now() - 86_400_000)
          .toISOString()
          .slice(0, 10),
        quantityAtStart: 100,
        type: 'CHAIR',
        chickUnitPriceFcfa: 450,
      },
      ownerToken,
    ).expect(201);
    batchId = batch.body.id;

    tokens.DGE = await institution('DGE');
    tokens.AGENT = await institution('AGENT_TECHNIQUE', { farmIds: [farmId] });
    // A profile the admin granted every write action on the programme
    // domains holding Fermia bonus features.
    const writer = `ECR${digits}`;
    await send(
      'post',
      '/programme/access/profiles',
      {
        code: writer,
        label: `Écriture ${writer}`,
        scopeKind: 'ALL',
        matrix: {
          REGISTRE: ['CONSULTER'],
          TECHNIQUE: ['CONSULTER', 'CREER', 'MODIFIER'],
          ECONOMIQUE: ['CONSULTER', 'CREER', 'MODIFIER'],
          INTRANTS: ['CONSULTER', 'CREER', 'MODIFIER'],
          TRACABILITE: ['CONSULTER', 'CREER', 'MODIFIER'],
        },
      },
      adminToken,
    ).expect(201);
    tokens.WRITER = await institution(writer);
  }, 180_000);

  afterAll(async () => {
    await app.close();
  });

  describe('#5 third-party reads are journaled', () => {
    const indicators = () => `/farms/${farmId}/bandes/${batchId}/indicators`;

    it('journals the DGE reading the registry, the dashboard and the band economics', async () => {
      const since = new Date(Date.now() - 1000);
      const dge = userIdOf(tokens.DGE);
      await get('/programme/farms', tokens.DGE).expect(200);
      await get('/farms', tokens.DGE).expect(200);
      await get(`/farms/${farmId}/dashboard`, tokens.DGE).expect(200);
      await get(indicators(), tokens.DGE).expect(200);
      await get(`/farms/${farmId}/bandes`, tokens.DGE).expect(200);
      await get(`/farms/${farmId}/batches/${batchId}`, tokens.DGE).expect(200);
      await get(`/farms/${farmId}/alerts`, tokens.DGE).expect(200);
      for (const route of [
        '/programme/farms',
        '/farms',
        '/farms/:farmId/dashboard',
        '/farms/:farmId/bandes/:batchId/indicators',
        '/farms/:farmId/bandes',
        '/farms/:farmId/batches/:batchId',
        '/farms/:farmId/alerts',
      ]) {
        expect(await readEvents(dge, route, since), route).toBe(1);
      }
      const [event] = await ds.query(
        `SELECT summary FROM audit_events
          WHERE actor_user_id = $1 AND route = '/programme/farms'
            AND action = 'READ_SENSITIVE' AND occurred_at >= $2`,
        [dge, since],
      );
      expect(JSON.stringify(event.summary)).toContain('exploitants');
    });

    it('journals the agent technique too, even when it gets the masked view', async () => {
      const since = new Date(Date.now() - 1000);
      await get(indicators(), tokens.AGENT).expect(200);
      expect(
        await readEvents(
          userIdOf(tokens.AGENT),
          '/farms/:farmId/bandes/:batchId/indicators',
          since,
        ),
      ).toBe(1);
    });

    it('does not journal the owner reading his own farm', async () => {
      const since = new Date(Date.now() - 1000);
      await get('/farms', ownerToken).expect(200);
      await get(`/farms/${farmId}/dashboard`, ownerToken).expect(200);
      await get(indicators(), ownerToken).expect(200);
      await get(`/farms/${farmId}/bandes`, ownerToken).expect(200);
      for (const route of [
        '/farms',
        '/farms/:farmId/dashboard',
        '/farms/:farmId/bandes/:batchId/indicators',
        '/farms/:farmId/bandes',
      ]) {
        expect(await readEvents(ownerId, route, since), route).toBe(0);
      }
    });
  });

  describe('#6 F6: official revenue, cost and margin need ECONOMIQUE', () => {
    const money = ['marge_fcfa', 'taux_marge', 'cout_production_kg', 'cout_production_tete', 'marge_kg'];

    it('serves them to the owner and the DGE', async () => {
      for (const token of [ownerToken, tokens.DGE]) {
        const res = await get(
          `/farms/${farmId}/bandes/${batchId}/indicators`,
          token,
        ).expect(200);
        expect(res.body.economicMasked).toBe(false);
        expect(res.body.variables.charges_fcfa).toBeGreaterThan(0);
        const keys = (res.body.indicators as Indicator[]).map((i) => i.key);
        expect(keys).toEqual(expect.arrayContaining(money));
        const list = await get(`/farms/${farmId}/bandes?status=EN_COURS`, token).expect(200);
        const band = (list.body as Array<{ id: string; summary: Record<string, unknown> }>).find(
          (b) => b.id === batchId,
        );
        expect(band?.summary).toMatchObject({ economicMasked: false });
        expect(band?.summary.chargesFcfa).toBeGreaterThan(0);
      }
    });

    it('withholds them from the agent technique (TECHNIQUE only), server side', async () => {
      const res = await get(
        `/farms/${farmId}/bandes/${batchId}/indicators`,
        tokens.AGENT,
      ).expect(200);
      expect(res.body.economicMasked).toBe(true);
      expect(res.body.variables.ca_fcfa).toBeNull();
      expect(res.body.variables.charges_fcfa).toBeNull();
      expect(res.body.variables.mis_en_place).toBe(100);
      const keys = (res.body.indicators as Indicator[]).map((i) => i.key);
      for (const key of money) expect(keys).not.toContain(key);
      expect(keys).toEqual(expect.arrayContaining(['taux_mortalite', 'viabilite', 'ic', 'gmq_g_j']));

      const list = await get(`/farms/${farmId}/bandes`, tokens.AGENT).expect(200);
      const band = (list.body as Array<{ id: string; summary: Record<string, unknown> & { indicators: Indicator[] } }>).find(
        (b) => b.id === batchId,
      );
      expect(band?.summary).toMatchObject({
        economicMasked: true,
        revenueFcfa: null,
        chargesFcfa: null,
        marginFcfa: null,
      });
      expect(band!.summary.indicators.map((i) => i.key)).not.toContain('marge_fcfa');
    });

    it('masks the frozen bilan of a closed band the same way', async () => {
      await send('post', `/farms/${farmId}/batches/${batchId}/cloture`, {}, ownerToken).expect(201);
      const owner = await get(`/farms/${farmId}/bandes/${batchId}/snapshots`, ownerToken).expect(200);
      expect(owner.body.length).toBeGreaterThan(0);
      expect(owner.body[0].economicMasked).toBe(false);
      expect(owner.body[0].chargesFcfa).toBeGreaterThan(0);
      const agent = await get(`/farms/${farmId}/bandes/${batchId}/snapshots`, tokens.AGENT).expect(200);
      expect(agent.body[0]).toMatchObject({
        economicMasked: true,
        revenueFcfa: null,
        chargesFcfa: null,
        marginFcfa: null,
      });
      expect(agent.body[0].variables.charges_fcfa).toBeNull();
      const keys = (agent.body[0].indicators as Indicator[]).map((i) => i.key);
      for (const key of money) expect(keys).not.toContain(key);
      const closed = await get(`/farms/${farmId}/bandes?status=CLOTURE`, tokens.AGENT).expect(200);
      const band = (closed.body as Array<{ id: string; summary: Record<string, unknown> }>).find(
        (b) => b.id === batchId,
      );
      expect(band?.summary).toMatchObject({ source: 'BILAN', economicMasked: true, marginFcfa: null });
    });
  });

  describe('#7 Fermia bonus features stay read-only for an institution', () => {
    const consultationOnly = (feature: string) =>
      new RegExp(`« ${feature} ».*consultation seule`);
    const someId = randomUUID();

    it('never hands the bonus write codes to an institution', async () => {
      const me = await get(`/farms/${farmId}/me`, tokens.WRITER).expect(200);
      const perms = me.body.permissions as string[];
      for (const code of ['compta:depense', 'stock:gerer', 'production:abattage']) {
        expect(perms).not.toContain(code);
      }
      expect(perms).toEqual(expect.arrayContaining(['compta:rapports', 'saisie:creer']));
    });

    it.each([
      ['post', '/expenses', 'Dépenses'],
      ['patch', `/expenses/${someId}`, 'Dépenses'],
      ['delete', `/expenses/${someId}`, 'Dépenses'],
      ['post', '/expenses/sync', 'Dépenses'],
      ['post', '/sales', 'Ventes'],
      ['post', '/feed-stock/losses', 'Stock d’aliment \\(FEFO\\)'],
      ['post', '/feed-products', 'Catalogue du stock'],
      ['patch', `/feed-products/${someId}`, 'Catalogue du stock'],
      ['post', '/inputs', 'Réceptions de stock'],
      ['post', '/slaughter-orders', 'Abattage'],
      ['post', `/slaughter-orders/${someId}/send`, 'Abattage'],
      ['post', '/tasks', 'Tâches de l’équipe'],
      ['patch', `/tasks/${someId}`, 'Tâches de l’équipe'],
      ['post', `/alerts/${someId}/acknowledge`, 'Conseils d’élevage'],
    ] as const)('refuses %s %s with a French 403', async (method, path, feature) => {
      const res = await send(method, `/farms/${farmId}${path}`, {}, tokens.WRITER).expect(403);
      expect(res.body.message).toMatch(consultationOnly(feature));
    });

    it('still reads them, and still writes outside the bonus features', async () => {
      for (const path of ['expenses', 'feed-stock', 'feed-products', 'inputs', 'slaughter-orders', 'tasks', 'alerts']) {
        await get(`/farms/${farmId}/${path}`, tokens.WRITER).expect(200);
      }
      // A write the CDC gives the programme (TECHNIQUE:CREER) is untouched:
      // the guard lets it through to the service.
      const res = await send(
        'post',
        `/farms/${farmId}/batches/${batchId}/daily-entries`,
        { entryDate: new Date().toISOString().slice(0, 10), deaths: 0 },
        tokens.WRITER,
      );
      expect(String(res.body.message ?? '')).not.toMatch(/consultation seule/);
    });

    it('leaves the farm owner writing', async () => {
      const res = await send(
        'post',
        `/farms/${farmId}/expenses`,
        {},
        ownerToken,
      );
      // Validation (400), not the read-only rule.
      expect(res.status).toBe(400);
    });
  });
});
