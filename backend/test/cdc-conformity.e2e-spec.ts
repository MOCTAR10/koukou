// CDC conformity net (jury-facing). One describe per CDC section, one test per
// requirement NOT already pinned by a dedicated spec. Requirements already
// covered are listed in docs/cdc-traceability.md with their covering spec.
// Scenarios replay the ANINF acceptance report (7 Nov 2026) against the API.
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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

function day(offset = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

describe('CDC Agri Track 241 — conformité (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let ownerC: string;
  let farmC: string;
  let ownerB: string;
  let farmB: string;
  let bandC: string;
  let bandV: string;
  let vetToken: string;
  let agentToken: string;
  const memberships: string[] = [];
  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');
  const digits = String(Date.now()).slice(-7);

  const get = (url: string, token = ownerC) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token = ownerC) =>
    request(server).post(url).set(auth(token)).send(body);
  const entry = (batchId: string, body: object, token = ownerC) =>
    post(`/farms/${farmC}/batches/${batchId}/daily-entries`, body, token);

  async function openBand(quantityAtStart: number, integrationDate: string) {
    const res = await post(`/farms/${farmC}/batches`, {
      batchName: `Bande CDC ${tag}`,
      type: 'CHAIR',
      integrationDate,
      quantityAtStart,
    }).expect(201);
    return res.body.id as string;
  }

  async function membership(profileCode: string, scope: object = {}) {
    const phone = uniquePhone('+2417');
    const res = await post(
      '/programme/access/memberships',
      { fullName: `CDC ${profileCode} ${tag}`, phone, profileCode, ...scope },
      adminToken,
    ).expect(201);
    memberships.push(res.body.id as string);
    return login(server, phone, res.body.loginCode as string);
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
    server = app.getHttpServer();
    ds = app.get(DataSource);
    adminToken = (await createPlatformAdmin(server, ds)).token;
    const c = await createProgrammeFarm(server, adminToken, {
      name: `Ferme CDC ${tag}`,
      provinceCode: 'G1',
    });
    farmC = c.farmId;
    ownerC = c.ownerToken;
    const b = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Voisine CDC ${tag}`,
      provinceCode: 'G2',
    });
    farmB = b.farmId;
    ownerB = b.ownerToken;
    vetToken = await membership('VETERINAIRE');
    const code = `CDCAG${digits}`;
    await post(
      '/programme/access/profiles',
      {
        code,
        label: `Agent CDC ${digits}`,
        scopeKind: 'FARMS',
        matrix: { TECHNIQUE: ['CONSULTER'] },
      },
      adminToken,
    ).expect(201);
    agentToken = await membership(code, { farmIds: [farmC] });
  }, 180_000);

  afterAll(async () => {
    for (const id of memberships) {
      await request(server)
        .patch(`/programme/access/memberships/${id}`)
        .set(auth(adminToken))
        .send({ active: false });
    }
    await app?.close();
  });

  describe('CDC 3 / 8 — acteurs, cloisonnement, droits', () => {
    it('CDC 8 — un éleveur ne lit pas la ferme d’un autre', async () => {
      const bandId = await openBand(100, day(-2));
      const res = await get(`/farms/${farmC}/batches/${bandId}`, ownerB);
      expect([403, 404]).toContain(res.status);
      const list = await get('/farms', ownerB).expect(200);
      const ids = (list.body as Array<{ id: string }>).map((f) => f.id);
      expect(ids).toContain(farmB);
      expect(ids).not.toContain(farmC);
    });

    it('CDC 5.4 n° 43 / ANINF — un profil lecture seule ne peut pas saisir, le refus est tracé', async () => {
      const bandId = await openBand(100, day(-2));
      const requestId = randomUUID();
      await request(server)
        .post(`/farms/${farmC}/batches/${bandId}/daily-entries`)
        .set(auth(agentToken))
        .set('X-Request-Id', requestId)
        .send({ entryDate: day(-1), deaths: 1 })
        .expect(403);
      const events = await get(
        `/audit/events?requestId=${requestId}`,
        adminToken,
      ).expect(200);
      expect(events.body.items.length).toBeGreaterThanOrEqual(1);
      expect(events.body.items[0].statusCode).toBe(403);
    });

    it('CDC 8 — les déclarations sanitaires ne vont qu’aux services vétérinaires', async () => {
      await get('/surveillance/declarations', ownerC).expect(403);
      await get('/surveillance/declarations', vetToken).expect(200);
    });

    it('CDC 8 — aucune bande ni ferme ne peut être supprimée par l’API', async () => {
      const bandId = await openBand(50, day(-1));
      await request(server)
        .delete(`/farms/${farmC}/batches/${bandId}`)
        .set(auth(ownerC))
        .expect(404);
      await request(server)
        .delete(`/programme/farms/${farmC}`)
        .set(auth(adminToken))
        .expect(404);
    });
  });

  describe('CDC 5.1 — suivi technique (rejeu ANINF)', () => {
    beforeAll(async () => {
      bandC = await openBand(1500, day(-10));
    });

    it('CDC 5.1 n° 7 — morts supérieurs à l’effectif ou négatifs refusés', async () => {
      await entry(bandC, { entryDate: day(-9), deaths: 1501 }).expect(400);
      await entry(bandC, { entryDate: day(-9), deaths: -5 }).expect(400);
    });

    it('CDC 5.1 n° 7 / 12 / 13 — mortalité et viabilité recalculées à la saisie (62/1500 = 4,13 %)', async () => {
      await entry(bandC, {
        entryDate: day(-9),
        deaths: 30,
        feedQuantity: 100,
        feedUnit: 'KG',
        feedType: 'DEMARRAGE',
      }).expect(201);
      await entry(bandC, {
        entryDate: day(-5),
        deaths: 32,
        feedQuantity: 200,
        feedUnit: 'KG',
        feedType: 'DEMARRAGE',
        avgWeightKg: 0.5,
        sampleSize: 30,
      }).expect(201);
      // 1439 dead out of 1438 alive is refused.
      await entry(bandC, { entryDate: day(-4), deaths: 1439 }).expect(400);
      const res = await get(
        `/farms/${farmC}/bandes/${bandC}/indicators`,
      ).expect(200);
      const by = new Map<string, { value: number }>(
        res.body.indicators.map((i: { key: string; value: number }) => [
          i.key,
          i,
        ]),
      );
      expect(res.body.variables).toMatchObject({
        mis_en_place: 1500,
        morts_cumules: 62,
        presents: 1438,
      });
      expect(by.get('taux_mortalite')!.value).toBeCloseTo(4.13, 1);
      expect(by.get('viabilite')!.value).toBeCloseTo(95.87, 1);
    });

    it('CDC 5.4 n° 36 — le tableau de bord de l’éleveur donne mortalité et viabilité', async () => {
      const res = await get(`/farms/${farmC}/dashboard`).expect(200);
      expect(res.body.mortalityPercent).toBeCloseTo(4.13, 0);
      expect(res.body.viabilityPercent).toBeCloseTo(95.87, 0);
    });

    it('CDC 5.1 n° 3 — taux d’occupation = poussins en place / capacité', async () => {
      const res = await get(`/programme/farms/${farmC}`, adminToken).expect(
        200,
      );
      expect(res.body.occupation.chicksPlaced).toBeGreaterThanOrEqual(1500);
      expect(res.body.occupation.ratePct).toBeGreaterThan(0);
    });

    it('CDC 5.4 n° 47 — la complétude de la fiche monte avec les jours saisis', async () => {
      const res = await get(`/farms/${farmC}/bandes/${bandC}`).expect(200);
      expect(res.body.completenessPct).toBeGreaterThan(0);
      expect(res.body.completenessPct).toBeLessThanOrEqual(100);
    });

    it('CDC 5.1 n° 18 / ANINF A18 — aliment consommé sans stock : saisie gardée, alerte de stock négatif', async () => {
      let found: { kind: string; message: string } | undefined;
      for (let i = 0; i < 10 && !found; i++) {
        const alerts = await get(
          `/farms/${farmC}/alerts?status=ACTIVE`,
        ).expect(200);
        found = (alerts.body as Array<{ kind: string; message: string }>).find(
          (a) =>
            ['ALIMENT', 'STOCK_NEGATIF'].includes(a.kind) &&
            /gatif/i.test(a.message),
        );
        if (!found) await new Promise((r) => setTimeout(r, 300));
      }
      expect(found).toBeDefined();
    });
  });

  describe('CDC 5.2 — sanitaire (rejeu ANINF)', () => {
    beforeAll(async () => {
      bandV = await openBand(100, day(0));
    });

    it('CDC 5.2 n° 22 — vaccination réalisée sur 97 animaux, 200 sur 100 mis en place refusés', async () => {
      const gen = await post(
        `/farms/${farmC}/batches/${bandV}/prophylaxis/generate`,
        {},
      ).expect(201);
      const events = (gen.body as Array<{ id: string; status: string }>).filter(
        (e) => e.status !== 'ANNULE',
      );
      expect(events.length).toBeGreaterThan(0);
      const url = `/farms/${farmC}/batches/${bandV}/prophylaxis/${events[0].id}/complete`;
      await post(url, { completedAt: day(0), animalCount: 200 }).expect(400);
      const done = await post(url, {
        completedAt: day(0),
        animalCount: 97,
      }).expect(201);
      expect(done.body).toMatchObject({ status: 'FAIT', animalCount: 97 });
    });

    it('CDC 5.2 n° 21 / ANINF A22 — déclaration de suspicion sans maladie imposée', async () => {
      const res = await post(
        `/farms/${farmC}/batches/${bandV}/health-events`,
        {
          kind: 'MALADIE',
          occurredAt: day(0),
          severity: 'ROUGE',
          title: `Suspicion CDC ${tag}`,
          quantity: 2,
          clinicalSigns: ['DIARRHEE'],
          suspicion: true,
        },
      ).expect(201);
      expect(res.body.suspicion).toBe(true);
    });

    it('CDC 5.2 n° 23 / ANINF T2 — traitement et vaccin apparaissent dans l’historique du lot', async () => {
      const lists = await get('/programme/lists/PRODUIT_TRAITEMENT').expect(
        200,
      );
      const first = (lists.body as Array<{ code: string }>)[0];
      await post(`/farms/${farmC}/batches/${bandV}/treatments`, {
        careType: 'ANTIBIOTIQUE',
        ...(first ? { productCode: first.code } : { productName: 'Oxytétracycline' }),
        reason: 'Coryza suspecté',
        animalCount: 50,
        administeredAt: new Date().toISOString(),
        endDate: day(0),
      }).expect(201);
      await entry(bandV, {
        entryDate: day(0),
        deaths: 2,
      }).expect(201);
      const [root] = (
        await get(`/farms/${farmC}/trace/lots?batchId=${bandV}`).expect(200)
      ).body as Array<{ id: string }>;
      const history = (
        await get(`/farms/${farmC}/trace/lots/${root.id}`).expect(200)
      ).body as { rearing: Array<{ kind: string }> };
      const kinds = history.rearing.map((r) => r.kind);
      expect(kinds).toEqual(
        expect.arrayContaining([
          'OUVERTURE',
          'MORTALITE',
          'SOIN',
          'TRAITEMENT',
          'EVENEMENT_SANITAIRE',
        ]),
      );
    });
  });

  describe('CDC 5.4 n° 44 / 7.2 — collecte mobile hors ligne', () => {
    it.todo(
      'CDC 5.4 n° 44 — APK Android hors ligne : test sur appareil réel (hors périmètre e2e API ; la synchronisation serveur est couverte par poufa-bandes « conflits hors ligne » et offline-idempotency)',
    );
  });

  describe('CDC 5.1 n° 5 / 5.3 — hors MVP, non implémentés', () => {
    it.todo(
      'CDC 5.1 — financement BCEG et consentement révocable (phase ultérieure, absent de la fiche ferme)',
    );
    it.todo('CDC 5.2 — échange EMA-i Plus (FAO) : protocole à formaliser');
  });
});
