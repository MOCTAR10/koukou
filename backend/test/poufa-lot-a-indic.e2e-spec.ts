import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { applyBodyLimits } from './../src/common/http/body-limits.js';
import { Farm } from './../src/modules/farms/entities/farm.entity.js';
import {
  createPlatformAdmin,
  createProgrammeFarm,
  uniquePhone,
} from './helpers/programme-farm.js';

/** `YYYY-MM-DD`, `n` days from today (UTC). */
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * POUFA lot A « indic »: one indicator set (band history with the official
 * headline, PDFs), administration gaps (inactive items for the managing
 * profiles, defaults and authors, journal filters, geometry size) and the
 * Market's traced lot.
 */
describe('POUFA lot A — indicateurs, historique des bandes, administration (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let adminName: string;
  let ownerToken: string;
  let farmId: string;
  let farmCode: string;
  let savedGeometry: unknown = null;

  const stamp = Date.now();
  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');
  const GEO_PROVINCE = 'G9';

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (url: string, token = ownerToken) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token = ownerToken) =>
    request(server).post(url).set(auth(token)).send(body);

  async function openBand(over: Record<string, unknown> = {}) {
    const res = await post(`/farms/${farmId}/batches`, {
      batchName: `Bande indic ${stamp}`,
      type: 'CHAIR',
      integrationDate: day(-20),
      quantityAtStart: 500,
      ...over,
    }).expect(201);
    return res.body as { id: string; code: string };
  }

  async function createInstitution(
    profileCode: string,
    scope: { farmIds?: string[] } = {},
  ) {
    const phone = uniquePhone();
    const res = await post(
      '/programme/access/memberships',
      { fullName: `Agent ${profileCode} ${tag}`, phone, profileCode, ...scope },
      adminToken,
    ).expect(201);
    const logged = await request(server)
      .post('/auth/login')
      .send({ phone, code: res.body.loginCode })
      .expect(201);
    return logged.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    applyBodyLimits(app);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    const admin = await createPlatformAdmin(server, ds);
    adminToken = admin.token;
    adminName = (
      await ds.query(`SELECT "fullName" FROM users WHERE id = $1`, [
        admin.userId,
      ])
    )[0].fullName;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Indic ${tag}`,
      exploitantName: 'Éleveur Indic',
    });
    farmId = farm.farmId;
    farmCode = farm.farmCode;
    ownerToken = farm.ownerToken;
    const [row] = await ds.query(
      `SELECT p.geometry FROM provinces p JOIN programs g ON g.id = p.program_id
        WHERE g.code = 'POUFA' AND p.code = $1`,
      [GEO_PROVINCE],
    );
    savedGeometry = row?.geometry ?? null;
  }, 120_000);

  afterAll(async () => {
    // Leave the shared DB as found: the big outline is test data only.
    await ds?.query(
      `UPDATE provinces SET geometry = $1 WHERE code = $2
         AND program_id = (SELECT id FROM programs WHERE code = 'POUFA')`,
      [
        savedGeometry === null ? null : JSON.stringify(savedGeometry),
        GEO_PROVINCE,
      ],
    );
    await app?.close();
  });

  describe('historique des bandes (n° 11) et indicateurs officiels', () => {
    let openId: string;
    let closedId: string;

    beforeAll(async () => {
      const open = await openBand();
      openId = open.id;
      await post(`/farms/${farmId}/batches/${openId}/daily-entries`, {
        entryDate: day(-1),
        deaths: 10,
        feedQuantity: 300,
        feedUnit: 'KG',
        waterL: 0,
      }).expect(201);
      const closed = await openBand({ quantityAtStart: 200 });
      closedId = closed.id;
      await post(`/farms/${farmId}/batches/${closedId}/daily-entries`, {
        entryDate: day(-2),
        deaths: 4,
        feedQuantity: 100,
        feedUnit: 'KG',
        waterL: 0,
      }).expect(201);
      await post(`/farms/${farmId}/batches/${closedId}/cloture`, {}).expect(
        201,
      );
    }, 60_000);

    it('donne chaque bande avec son résumé officiel', async () => {
      const all = await get(`/farms/${farmId}/bandes`).expect(200);
      const ids = all.body.map((b: { id: string }) => b.id);
      expect(ids).toEqual(expect.arrayContaining([openId, closedId]));
      const open = all.body.find((b: { id: string }) => b.id === openId);
      expect(open.summary.source).toBe('EN_COURS');
      const mortality = open.summary.indicators.find(
        (i: { key: string }) => i.key === 'taux_mortalite',
      );
      // FORMULE_TAUX_MORTALITE = morts_cumules / mis_en_place * 100.
      expect(mortality.value).toBeCloseTo(2, 5);
      expect(mortality.expression).toContain('morts_cumules');
    });

    it('filtre les bandes clôturées, avec leur dernier bilan figé', async () => {
      const closed = await get(`/farms/${farmId}/bandes?status=CLOTURE`).expect(
        200,
      );
      expect(closed.body.map((b: { id: string }) => b.id)).toEqual([closedId]);
      const [band] = closed.body;
      expect(band.summary).toMatchObject({ source: 'BILAN', snapshotVersion: 1 });
      const viability = band.summary.indicators.find(
        (i: { key: string }) => i.key === 'viabilite',
      );
      expect(viability.value).toBeCloseTo(98, 5);
      expect(band.summary).toHaveProperty('marginFcfa');

      const open = await get(`/farms/${farmId}/bandes?status=EN_COURS`).expect(
        200,
      );
      expect(open.body.map((b: { id: string }) => b.id)).toEqual([openId]);
    });

    it('refuse un statut inconnu', async () => {
      const res = await get(`/farms/${farmId}/bandes?status=ACTIF`).expect(400);
      expect(res.body.message).toMatch(/CLOTURE ou EN_COURS/);
    });

    it('reste réservé à la ferme et à son périmètre', async () => {
      const other = await createProgrammeFarm(server, adminToken, {
        exploitantName: 'Autre Indic',
      });
      await get(`/farms/${farmId}/bandes`, other.ownerToken).expect(403);
    });

    it('édite toujours la fiche de suivi et le compte de résultat en PDF', async () => {
      const passport = await get(
        `/farms/${farmId}/batches/${openId}/passeport`,
      ).expect(200);
      expect(passport.headers['content-type']).toMatch(/pdf/);
      const pnl = await get(
        `/farms/${farmId}/rentabilite/batches/${openId}/export`,
      ).expect(200);
      expect(pnl.headers['content-type']).toMatch(/pdf/);
    });
  });

  describe('listes : éléments désactivés et historique (profils gestionnaires)', () => {
    const code = `IND_${tag}`;
    let dgeToken: string;
    let agentToken: string;
    let vetToken: string;

    beforeAll(async () => {
      dgeToken = await createInstitution('DGE');
      vetToken = await createInstitution('VETERINAIRE');
      agentToken = await createInstitution('AGENT_TECHNIQUE', {
        farmIds: [farmId],
      });
      await post(
        '/programme/lists/COHORTE',
        { code, label: `Cohorte ${tag}` },
        adminToken,
      ).expect(201);
      await request(server)
        .patch(`/programme/lists/COHORTE/${code}`)
        .set(auth(adminToken))
        .send({ active: false })
        .expect(200);
    }, 60_000);

    it('montre les éléments désactivés à la DGE, pas à l’agent technique', async () => {
      const active = await get('/programme/lists/COHORTE', dgeToken).expect(200);
      expect(active.body.map((i: { code: string }) => i.code)).not.toContain(
        code,
      );
      const all = await get('/programme/lists/COHORTE?all=true', dgeToken).expect(
        200,
      );
      expect(all.body.map((i: { code: string }) => i.code)).toContain(code);
      await get('/programme/lists/COHORTE?all=true', agentToken).expect(403);
      await get('/programme/provinces?all=true', dgeToken).expect(200);
      await get('/programme/provinces?all=true', agentToken).expect(403);
    });

    it('ouvre les listes sanitaires désactivées aux vétérinaires', async () => {
      await get('/programme/lists/SIGNE_CLINIQUE?all=true', vetToken).expect(200);
    });

    it('donne l’historique d’une liste avec le nom de l’auteur', async () => {
      const history = await get(
        '/programme/lists/COHORTE/history',
        dgeToken,
      ).expect(200);
      const mine = history.body.filter((e: { code: string }) => e.code === code);
      expect(mine.map((e: { kind: string }) => e.kind)).toEqual([
        'MODIFICATION',
        'CREATION',
      ]);
      expect(mine[0].changes).toEqual([
        { field: 'active', before: true, after: false },
      ]);
      expect(mine[0].actorName).toBe(adminName);
      await get('/programme/lists/COHORTE/history', agentToken).expect(403);
    });
  });

  describe('paramètres : valeur par défaut et auteur', () => {
    it('donne la valeur « Proposé » du catalogue avec la valeur en vigueur', async () => {
      const params = await get('/programme/parameters', adminToken).expect(200);
      const duration = params.body.find(
        (p: { key: string }) => p.key === 'BANDE_DUREE_REFERENCE_J',
      );
      expect(duration).toHaveProperty('defaultValue');
      expect(duration.defaultValue).not.toBeNull();
      expect(duration).toHaveProperty('createdByName');
    });

    it('nomme l’auteur de chaque version', async () => {
      // A far-future version: it changes nothing today for the other specs.
      await post(
        '/programme/parameters/OBJECTIF_NATIONAL_T',
        {
          value: 100000,
          reason: `Essai e2e auteur ${tag}`,
          validFrom: '2099-01-01T00:00:00.000Z',
        },
        adminToken,
      ).expect(201);
      const history = await get(
        '/programme/parameters/OBJECTIF_NATIONAL_T/history',
        adminToken,
      ).expect(200);
      const mine = history.body.find(
        (v: { reason: string }) => v.reason === `Essai e2e auteur ${tag}`,
      );
      expect(mine.createdByName).toBe(adminName);
    });
  });

  describe('journal : filtres statut et requête, noms des auteurs', () => {
    it('retrouve une requête refusée par son identifiant et son statut', async () => {
      const requestId = randomUUID();
      await request(server)
        .post('/programme/lists/COHORTE')
        .set(auth(adminToken))
        .set('X-Request-Id', requestId)
        .send({ label: 'sans code' })
        .expect(400);
      const byId = await get(
        `/audit/events?requestId=${requestId}`,
        adminToken,
      ).expect(200);
      expect(byId.body.items).toHaveLength(1);
      expect(byId.body.items[0]).toMatchObject({
        requestId,
        statusCode: 400,
        actorName: adminName,
      });
      const failed = await get(
        `/audit/events?requestId=${requestId}&status=4xx`,
        adminToken,
      ).expect(200);
      expect(failed.body.items).toHaveLength(1);
      const ok = await get(
        `/audit/events?requestId=${requestId}&status=SUCCES`,
        adminToken,
      ).expect(200);
      expect(ok.body.items).toHaveLength(0);
      await get('/audit/events?status=abc', adminToken).expect(400);
    });
  });

  describe('contour de province : corps de plus de 100 Ko', () => {
    it('accepte un contour lourd sur la seule route des contours', async () => {
      // A closed ring of 9 000 points (≈ 210 KB of JSON).
      const ring: [number, number][] = [];
      const n = 9000;
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        ring.push([
          Number((11.5 + Math.cos(a) * 0.8).toFixed(7)),
          Number((-1 + Math.sin(a) * 0.8).toFixed(7)),
        ]);
      }
      ring.push(ring[0]);
      const geometry = { type: 'Polygon', coordinates: [ring] };
      expect(JSON.stringify({ geometry }).length).toBeGreaterThan(150_000);
      await request(server)
        .put(`/programme/provinces/${GEO_PROVINCE}/geometry`)
        .set(auth(adminToken))
        .send({ geometry })
        .expect(200);
      // Every other route keeps the default limit.
      await request(server)
        .post('/programme/lists/COHORTE')
        .set(auth(adminToken))
        .send({ code: `BIG_${tag}`, label: 'x'.repeat(150_000) })
        .expect(413);
    });
  });

  describe('Market : lot tracé et ferme opérationnelle (F10)', () => {
    it('masque l’annonce d’une ferme non opérationnelle et montre son lot tracé', async () => {
      await ds.getRepository(Farm).update({ id: farmId }, { isVerified: true });
      const band = await openBand({ integrationDate: day(-30) });
      const draft = await post(`/farms/${farmId}/market/listings`, {
        kind: 'PRE',
        product: 'BIRDS',
        batchId: band.id,
        unitPriceFcfa: 3500,
        quantityPublished: 50,
        readyDate: day(14),
      }).expect(201);
      await post(
        `/farms/${farmId}/market/listings/${draft.body.id}/publish`,
        {},
      ).expect(201);

      // A new registry farm is EN_PREPARATION: not in the catalogue.
      await request(server).get(`/market/listings/${draft.body.id}`).expect(404);
      const farmView = await get(
        `/farms/${farmId}/market/listings/${draft.body.id}`,
      ).expect(200);
      expect(farmView.body.hiddenReason).toBe('FARM_NOT_OPERATIONAL');
      expect(farmView.body.traceLot.code).toMatch(
        new RegExp(`^${farmCode}-B\\d{2,}-L01$`),
      );

      await post(
        `/programme/farms/${farmId}/status`,
        { statusCode: 'OPERATIONNELLE' },
        adminToken,
      ).expect(201);
      const item = await request(server)
        .get(`/market/listings/${draft.body.id}`)
        .expect(200);
      const lot = item.body.traceLot;
      expect(lot.code).toBe(farmView.body.traceLot.code);
      expect(lot.path).toMatch(/^\/l\/[^?]+\?s=[A-Za-z0-9_-]{16}$/);
      // No personal data on the listing: no owner, phone nor GPS.
      expect(JSON.stringify(item.body)).not.toMatch(/phone|latitude|ownerId/i);

      // The link opens the public lot page.
      const page = await request(server)
        .get(`/public/lots/${encodeURIComponent(lot.code)}`)
        .query({ s: new URL(lot.url).searchParams.get('s') })
        .expect(200);
      expect(page.body.code ?? page.body.lot?.code).toBe(lot.code);
    });
  });
});
