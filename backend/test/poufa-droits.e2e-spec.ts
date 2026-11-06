// POUFA lot A droits: the Fermia bonus domains opened to institutions (read
// only, journaled), confidentiality (F6, F7, F8, F9) and the field rights
// (farm GPS point, deliveries).
process.env.INSTITUTION_OTP = 'off';

import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  AlertKind,
  AlertLevel,
} from './../src/common/enums/alert-level.enum.js';
import { Alert } from './../src/modules/alerts/entities/alert.entity.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  uniquePhone,
} from './helpers/programme-farm.js';

describe('POUFA lot A droits — modules Fermia, confidentialité, GPS (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let ownerToken: string;
  let ownerId: string;
  let farmId: string;
  let otherOwnerToken: string;
  let batchId: string;

  const digits = String(Date.now()).slice(-7);
  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');

  const tokens: Record<string, string> = {};

  const get = (url: string, token: string) =>
    request(server).get(url).set(auth(token));
  const send = (
    method: 'post' | 'put' | 'patch',
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
      { fullName: `Droits ${profileCode} ${digits}`, phone: p, profileCode, ...scope },
      adminToken,
    ).expect(201);
    return login(server, p, res.body.loginCode as string);
  }

  async function profile(code: string, scopeKind: string, matrix: object) {
    await send(
      'post',
      '/programme/access/profiles',
      { code, label: `Profil ${code}`, scopeKind, matrix },
      adminToken,
    ).expect(201);
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
      name: `Ferme Droits ${tag}`,
      exploitantName: 'Exploitant Droits',
    });
    ownerToken = owner.ownerToken;
    ownerId = owner.ownerId;
    farmId = owner.farmId;
    otherOwnerToken = (
      await createProgrammeFarm(server, adminToken, {
        name: `Ferme Voisine ${tag}`,
      })
    ).ownerToken;

    // A band with a chick price (economic data) and an employee with a salary.
    const batch = await send(
      'post',
      `/farms/${farmId}/batches`,
      {
        batchName: `Bande droits ${digits}`,
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
    await ds.getRepository(Alert).save([
      {
        farmId,
        kind: AlertKind.RENTABILITE,
        level: AlertLevel.ROUGE,
        message: 'Marge négative (e2e droits)',
      },
      {
        farmId,
        kind: AlertKind.MORTALITE,
        level: AlertLevel.JAUNE,
        message: 'Mortalité (e2e droits)',
      },
    ]);

    tokens.DGE = await institution('DGE');
    tokens.AGENT_TECHNIQUE = await institution('AGENT_TECHNIQUE', {
      farmIds: [farmId],
    });
    tokens.VETERINAIRE = await institution('VETERINAIRE');
    const ecoOnly = `ECO${digits}`;
    await profile(ecoOnly, 'ALL', {
      REGISTRE: ['CONSULTER'],
      ECONOMIQUE: ['CONSULTER'],
    });
    tokens.ECO = await institution(ecoOnly);
  }, 180_000);

  afterAll(async () => {
    await app.close();
  });

  describe('matrix: the Fermia bonus domains, consultation only', () => {
    it('serves them in the catalogue with « Consulter » as only action', async () => {
      const res = await get('/programme/access/catalog', adminToken).expect(200);
      const byCode = new Map(
        (res.body.domains as Array<{ code: string; actions: string[]; fermia: boolean }>).map(
          (d) => [d.code, d],
        ),
      );
      for (const code of ['VENTES', 'MARCHE', 'COMPTABILITE', 'EQUIPE']) {
        expect(byCode.get(code)).toMatchObject({
          fermia: true,
          actions: ['CONSULTER'],
        });
      }
      expect(byCode.get('REGISTRE')?.fermia).toBe(false);
      for (const code of ['CULTURES', 'COMPTE', 'PLATEFORME']) {
        expect(byCode.has(code)).toBe(false);
      }
    });

    it('refuses a write action on them and the never-grantable domains', async () => {
      for (const matrix of [
        { VENTES: ['CREER'] },
        { COMPTABILITE: ['CONSULTER', 'MODIFIER'] },
        { CULTURES: ['CONSULTER'] },
        { PLATEFORME: ['CONSULTER'] },
      ]) {
        const res = await send(
          'post',
          '/programme/access/profiles',
          { code: `W${digits}${Object.keys(matrix)[0].slice(0, 2)}`, label: 'W', scopeKind: 'ALL', matrix },
          adminToken,
        ).expect(400);
        expect(typeof res.body.message).toBe('string');
      }
      await profile(`RH${digits}`, 'ALL', { EQUIPE: ['CONSULTER'] });
    });

    it('gives the DGE consultation by default (seed and migration)', async () => {
      const me = await get('/programme/access/me', tokens.DGE).expect(200);
      for (const d of ['VENTES', 'MARCHE', 'COMPTABILITE', 'EQUIPE']) {
        expect(me.body.profile.matrix[d]).toEqual(['CONSULTER']);
      }
      const farmMe = await get(`/farms/${farmId}/me`, tokens.DGE).expect(200);
      expect(farmMe.body.permissions).toEqual(
        expect.arrayContaining(['caisse:lire', 'rh:lire', 'compta:lire', 'market:lire', 'compta:rapports']),
      );
      for (const write of ['vente:creer', 'caisse:ouvrir', 'compta:ecritures', 'market:publier', 'equipe:gerer', 'compta:depense']) {
        expect(farmMe.body.permissions).not.toContain(write);
      }
    });
  });

  describe('DGE: reads every bonus page of a farm in its scope, journaled, unmasked', () => {
    const routes = [
      ['/farms/:farmId/caisse/current', 'caisse/current'],
      ['/farms/:farmId/caisse/sessions', 'caisse/sessions'],
      ['/farms/:farmId/sales', 'sales'],
      ['/farms/:farmId/expenses', 'expenses'],
      ['/farms/:farmId/payments', 'payments'],
      ['/farms/:farmId/customers', 'customers'],
      ['/farms/:farmId/promotions', 'promotions'],
      ['/farms/:farmId/orders', 'orders'],
      ['/farms/:farmId/points-of-sale', 'points-of-sale'],
      ['/farms/:farmId/stock-transfers', 'stock-transfers'],
      ['/farms/:farmId/rentabilite/overview', 'rentabilite/overview'],
      ['/farms/:farmId/accounting/journal', 'accounting/journal'],
      ['/farms/:farmId/accounting/balance', 'accounting/balance'],
      ['/farms/:farmId/eleveurs', 'eleveurs'],
      ['/farms/:farmId/team', 'team'],
      ['/farms/:farmId/market/listings', 'market/listings'],
      ['/farms/:farmId/market/orders', 'market/orders'],
      ['/farms/:farmId/feed-stock', 'feed-stock'],
      ['/farms/:farmId/slaughter-orders', 'slaughter-orders'],
      ['/farms/:farmId/advisory/next-actions', 'advisory/next-actions'],
      ['/farms/:farmId/weather', 'weather'],
    ] as const;

    it('answers each read and journals it as a sensitive read', async () => {
      const since = new Date(Date.now() - 1000);
      const dge = userIdOf(tokens.DGE);
      const failures: string[] = [];
      for (const [route, path] of routes) {
        const res = await get(`/farms/${farmId}/${path}`, tokens.DGE);
        if (res.status !== 200) {
          failures.push(`${path}: ${res.status} ${JSON.stringify(res.body).slice(0, 160)}`);
          continue;
        }
        if ((await readEvents(dge, route, since)) < 1) {
          failures.push(`${path}: lecture non journalisée`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('shows the salaries to the granted profile (no masking)', async () => {
      await send(
        'post',
        `/farms/${farmId}/eleveurs`,
        {
          phone: uniquePhone(),
          fullName: 'Salarié Droits',
          code: 'secret-droits-1',
          role: 'ELEVEUR',
          jobTitle: 'Éleveur',
          salaryFcfa: 175000,
        },
        ownerToken,
      ).expect(201);
      const res = await get(`/farms/${farmId}/eleveurs`, tokens.DGE).expect(200);
      expect(JSON.stringify(res.body)).toContain('175000');
    });

    it('never writes: create, open or post stay 403', async () => {
      await send('post', `/farms/${farmId}/expenses`, {}, tokens.DGE).expect(403);
      await send('post', `/farms/${farmId}/caisse/open`, {}, tokens.DGE).expect(403);
      await send('post', `/farms/${farmId}/accounting/entries`, {}, tokens.DGE).expect(403);
      await send('post', `/farms/${farmId}/market/listings`, {}, tokens.DGE).expect(403);
      await send('post', `/farms/${farmId}/eleveurs`, {}, tokens.DGE).expect(403);
    });

    it('does not journal the owner reading his own sales, but journals the platform admin', async () => {
      const since = new Date(Date.now() - 1000);
      await get(`/farms/${farmId}/sales`, ownerToken).expect(200);
      expect(await readEvents(ownerId, '/farms/:farmId/sales', since)).toBe(0);
      await get(`/farms/${farmId}/sales`, adminToken).expect(200);
      expect(
        await readEvents(userIdOf(adminToken), '/farms/:farmId/sales', since),
      ).toBe(1);
    });
  });

  describe('F6: no economic data without the grant', () => {
    it('agent technique: no cash collected, no margin alert, no chick price', async () => {
      const token = tokens.AGENT_TECHNIQUE;
      const dash = await get(`/farms/${farmId}/dashboard`, token).expect(200);
      expect(dash.body.collectedTodayFcfa).toBeNull();
      const alerts = await get(`/farms/${farmId}/alerts`, token).expect(200);
      const kinds = (alerts.body as Array<{ kind: string }>).map((a) => a.kind);
      expect(kinds).toContain('MORTALITE');
      expect(kinds).not.toContain('RENTABILITE');
      const batch = await get(`/farms/${farmId}/batches/${batchId}`, token).expect(200);
      expect(batch.body.chickUnitPriceFcfa).toBeNull();
      await get(`/farms/${farmId}/caisse/current`, token).expect(403);
      await get(`/farms/${farmId}/sales`, token).expect(403);
    });

    it('the DGE and the owner keep them', async () => {
      for (const token of [tokens.DGE, ownerToken]) {
        const dash = await get(`/farms/${farmId}/dashboard`, token).expect(200);
        expect(dash.body.collectedTodayFcfa).toBe(0);
        const alerts = await get(`/farms/${farmId}/alerts`, token).expect(200);
        expect((alerts.body as Array<{ kind: string }>).map((a) => a.kind)).toContain('RENTABILITE');
        const batch = await get(`/farms/${farmId}/batches/${batchId}`, token).expect(200);
        expect(batch.body.chickUnitPriceFcfa).toBe(450);
      }
    });

    it('a profile with ECONOMIQUE but not VENTES reads the sales, not the caisse', async () => {
      await get(`/farms/${farmId}/sales`, tokens.ECO).expect(200);
      await get(`/farms/${farmId}/caisse/current`, tokens.ECO).expect(403);
      await get(`/farms/${farmId}/eleveurs`, tokens.ECO).expect(403);
    });
  });

  describe('F9: salaries masked in the journal', () => {
    it('keeps « changed » without the amount, at both levels', async () => {
      const created = await send(
        'post',
        `/farms/${farmId}/eleveurs`,
        {
          phone: uniquePhone(),
          fullName: 'Salaire Masqué',
          code: 'secret-droits-2',
          role: 'ELEVEUR',
          jobTitle: 'Gardien',
          salaryFcfa: 98765,
        },
        ownerToken,
      ).expect(201);
      const employmentId = created.body.employment.id as string;
      const rows: Array<{ after: Record<string, unknown> }> = await ds.query(
        `SELECT "after" FROM audit_row_changes
          WHERE table_name = 'farm_employees' AND row_id = $1`,
        [employmentId],
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.after).not.toHaveProperty('salary_fcfa');
        expect(JSON.stringify(r.after)).not.toContain('98765');
      }
      const events: Array<{ summary: unknown }> = await ds.query(
        `SELECT summary FROM audit_events
          WHERE route = '/farms/:farmId/eleveurs' AND method = 'POST'
            AND actor_user_id = $1 ORDER BY occurred_at DESC LIMIT 1`,
        [ownerId],
      );
      expect(JSON.stringify(events[0].summary)).not.toContain('98765');
      expect(JSON.stringify(events[0].summary)).toContain('[masqué]');
    });
  });

  describe('A8: the farm GPS point from the field', () => {
    const gpsUrl = () => `/programme/farms/${farmId}/gps`;

    it('the owner records his own point, once per replay key', async () => {
      const key = `gps-${digits}-${tag}`;
      const body = { latitude: 0.41, longitude: 9.46, source: 'APPAREIL', accuracyM: 6, idempotencyKey: key };
      const first = await send('put', gpsUrl(), body, ownerToken).expect(200);
      expect(first.body).toMatchObject({ applied: true, replay: false, message: null });
      expect(first.body.gps).toMatchObject({ latitude: 0.41, longitude: 9.46 });
      const before = await get(`/programme/farms/${farmId}/gps-history`, adminToken).expect(200);
      const replay = await send('put', gpsUrl(), body, ownerToken).expect(200);
      expect(replay.body).toMatchObject({ applied: false, replay: true });
      const after = await get(`/programme/farms/${farmId}/gps-history`, adminToken).expect(200);
      expect(after.body).toHaveLength(before.body.length);
    });

    it('ignores a fix older than the current point, with a French message', async () => {
      const res = await send(
        'put',
        gpsUrl(),
        { latitude: 0.5, longitude: 9.5, capturedAt: '2026-01-02T08:00:00Z' },
        ownerToken,
      ).expect(200);
      expect(res.body.applied).toBe(false);
      expect(res.body.message).toMatch(/plus ancien que le point actuel/);
      expect(res.body.gps).toMatchObject({ latitude: 0.41 });
    });

    it('opens it to the agent technique (TECHNIQUE:VALIDER) and to an éleveur, not to others', async () => {
      await send('put', gpsUrl(), { latitude: 0.42, longitude: 9.47 }, tokens.AGENT_TECHNIQUE).expect(200);
      const p = uniquePhone();
      await send(
        'post',
        `/farms/${farmId}/eleveurs`,
        { phone: p, fullName: 'Éleveur GPS', code: 'secret-droits-3', role: 'ELEVEUR', jobTitle: 'Éleveur' },
        ownerToken,
      ).expect(201);
      const eleveur = await login(server, p, 'secret-droits-3');
      await send('put', gpsUrl(), { latitude: 0.43, longitude: 9.48 }, eleveur).expect(200);
      await send('put', gpsUrl(), { latitude: 0.44, longitude: 9.49 }, tokens.VETERINAIRE).expect(403);
      await send('put', gpsUrl(), { latitude: 0.44, longitude: 9.49 }, otherOwnerToken).expect(403);
      // The agent technique still cannot edit the registry sheet.
      await send('patch', `/programme/farms/${farmId}`, { localiteId: null }, tokens.AGENT_TECHNIQUE).expect(403);
    });

    it('reads the State deliveries through intrants:lire', async () => {
      const p = uniquePhone();
      await send(
        'post',
        `/farms/${farmId}/eleveurs`,
        { phone: p, fullName: 'Admin sans intrants', code: 'secret-droits-4', role: 'ADMIN', jobTitle: 'Comptable', permissions: ['caisse:lire'] },
        ownerToken,
      ).expect(201);
      const member = await login(server, p, 'secret-droits-4');
      await get(`/farms/${farmId}/input-deliveries`, member).expect(403);
      await get(`/farms/${farmId}/input-deliveries`, ownerToken).expect(200);
      await get(`/farms/${farmId}/input-deliveries`, tokens.AGENT_TECHNIQUE).expect(200);
    });
  });

  describe('F8: Market verification and conduct thresholds through the matrix', () => {
    it('REGISTRE:VALIDER verifies a farm; the status OPERATIONNELLE does too', async () => {
      const set = await send('put', `/programme/farms/${farmId}/verification`, { verified: true, reason: 'Visite' }, tokens.DGE).expect(200);
      expect(set.body.isVerified).toBe(true);
      await send('put', `/programme/farms/${farmId}/verification`, { verified: false }, tokens.VETERINAIRE).expect(403);
      await send('put', `/programme/farms/${farmId}/verification`, { verified: false }, tokens.DGE).expect(200);
      await send('post', `/programme/farms/${farmId}/status`, { statusCode: 'OPERATIONNELLE' }, adminToken).expect(201);
      const sheet = await get(`/programme/farms/${farmId}`, adminToken).expect(200);
      expect(sheet.body.isVerified).toBe(true);
    });

    it('each threshold is changed by its owner profile only', async () => {
      const list = await get('/reference-constants', tokens.VETERINAIRE).expect(200);
      const rows = list.body as Array<{ key: string; value: number; ownerProfile: string; isEditable: boolean }>;
      const vide = rows.find((r) => r.key === 'vide_sanitaire_min_days');
      const marge = rows.find((r) => r.key === 'rentabilite_marge_min_pct');
      expect(vide?.ownerProfile).toBe('VETERINAIRE');
      expect(marge?.ownerProfile).toBe('DGE');
      if (vide?.isEditable) {
        await send('patch', '/reference-constants/vide_sanitaire_min_days', { value: vide.value }, tokens.DGE).expect(403);
        await send('patch', '/reference-constants/vide_sanitaire_min_days', { value: vide.value }, tokens.VETERINAIRE).expect(200);
      }
      if (marge?.isEditable) {
        await send('patch', '/reference-constants/rentabilite_marge_min_pct', { value: marge.value }, tokens.VETERINAIRE).expect(403);
        await send('patch', '/reference-constants/rentabilite_marge_min_pct', { value: marge.value }, tokens.DGE).expect(200);
      }
      await send('patch', '/reference-constants/rentabilite_marge_min_pct', { value: 10 }, tokens.AGENT_TECHNIQUE).expect(403);
      await send('patch', '/reference-constants/rentabilite_marge_min_pct', { value: 10 }, ownerToken).expect(403);
    });
  });

  describe('programme-wide economic synthesis', () => {
    it('gives the DGE every column per farm and per province, and exports it', async () => {
      const res = await get('/programme/economie/synthese', tokens.DGE).expect(200);
      expect(res.body.columns).toMatchObject({ sales: true, collected: true, payroll: true, stock: true });
      const row = (res.body.farms as Array<{ farmId: string; payrollMonthlyFcfa: number; employeeCount: number }>).find((f) => f.farmId === farmId);
      expect(row).toBeDefined();
      expect(row!.payrollMonthlyFcfa).toBeGreaterThanOrEqual(175000 + 98765);
      expect(res.body.provinces.length).toBeGreaterThan(0);
      expect(res.body.total.farmCount).toBe(res.body.farms.length);
      const csv = await get('/programme/economie/synthese/export?format=csv', tokens.DGE).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('Masse salariale mensuelle');
      const xlsx = await get('/programme/economie/synthese/export?format=xlsx', tokens.DGE).expect(200);
      expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    });

    it('nulls the columns a profile is not granted, refuses one without ECONOMIQUE', async () => {
      const res = await get('/programme/economie/synthese', tokens.ECO).expect(200);
      expect(res.body.columns).toMatchObject({ sales: true, collected: true, payroll: false, stock: false });
      expect(res.body.total.payrollMonthlyFcfa).toBeNull();
      await get('/programme/economie/synthese', tokens.AGENT_TECHNIQUE).expect(403);
      await get('/programme/economie/synthese', ownerToken).expect(403);
      await get('/programme/economie/synthese?from=2026-02-01&to=2026-01-01', tokens.DGE).expect(400);
    });
  });
});
