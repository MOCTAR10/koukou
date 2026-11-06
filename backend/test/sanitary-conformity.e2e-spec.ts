import { randomBytes } from 'node:crypto';
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

function day(offset = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/**
 * POUFA lot A (sante): CDC §5.2 n° 22-23. Treatment register (end date,
 * reason, animals, product from PRODUIT_TRAITEMENT), vaccination completion
 * (animals, route) and the offline idempotency of both.
 *
 * PRODUIT_TRAITEMENT is a programme-wide list that other specs expect empty
 * (they record free-text treatments): this spec deactivates what it adds, and
 * gives back the items it found active.
 */
describe('Sanitaire conforme — traitements et vaccinations (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let ownerToken: string;
  let vetToken: string;
  let farmId: string;
  let batchId: string;
  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');
  const productCode = `E2E_AMOX_${tag}`;
  /** Active before this spec: deactivated during it, reactivated after. */
  let foundActive: string[] = [];
  let added = false;

  const post = (url: string, body: object, token = ownerToken) =>
    request(server).post(url).set(auth(token)).send(body);
  const patch = (url: string, body: object, token: string) =>
    request(server).patch(url).set(auth(token)).send(body);
  const get = (url: string, token = ownerToken) =>
    request(server).get(url).set(auth(token));
  const treatments = () => `/farms/${farmId}/batches/${batchId}/treatments`;

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
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Conforme ${tag}`,
    });
    ownerToken = farm.ownerToken;
    farmId = farm.farmId;
    const vetPhone = uniquePhone('+2417');
    const vet = await post(
      '/programme/access/memberships',
      { fullName: `Vétérinaire ${tag}`, phone: vetPhone, profileCode: 'VETERINAIRE' },
      adminToken,
    ).expect(201);
    vetToken = await login(server, vetPhone, vet.body.loginCode as string);

    const band = await post(`/farms/${farmId}/batches`, {
      batchName: `Bande conforme ${tag}`,
      type: 'CHAIR',
      integrationDate: day(0),
      quantityAtStart: 500,
    }).expect(201);
    batchId = band.body.id as string;

    const active = await get('/programme/lists/PRODUIT_TRAITEMENT').expect(200);
    foundActive = (active.body as Array<{ code: string }>).map((i) => i.code);
    for (const code of foundActive) {
      await patch(`/surveillance/lists/PRODUIT_TRAITEMENT/${code}`, { active: false }, vetToken).expect(200);
    }
  });

  afterAll(async () => {
    if (added) {
      await patch(
        `/surveillance/lists/PRODUIT_TRAITEMENT/${productCode}`,
        { active: false },
        vetToken,
      );
    }
    for (const code of foundActive) {
      await patch(`/surveillance/lists/PRODUIT_TRAITEMENT/${code}`, { active: true }, vetToken);
    }
    await app.close();
  });

  describe('registre des traitements (n° 23)', () => {
    const key = `off-treatment-${tag}`;
    let firstId: string;

    it('enregistre dates de début et fin, motif et animaux ; le délai d’attente court depuis la fin', async () => {
      const res = await post(treatments(), {
        careType: 'ANTIBIOTIQUE',
        productName: 'Oxytétracycline',
        administeredAt: day(-2),
        endDate: day(0),
        reason: 'Coryza suspecté',
        animalCount: 480,
        withdrawalDays: 5,
        idempotencyKey: key,
      }).expect(201);
      firstId = res.body.id as string;
      expect(res.body).toMatchObject({
        productCode: null,
        productName: 'Oxytétracycline',
        endDate: day(0),
        reason: 'Coryza suspecté',
        animalCount: 480,
        withdrawalEndDate: day(5),
      });
      const journal: Array<{ n: number }> = await ds.query(
        `SELECT COUNT(*)::int AS n FROM audit_row_changes WHERE table_name = 'treatment_records' AND row_id = $1`,
        [firstId],
      );
      expect(journal[0].n).toBeGreaterThanOrEqual(1);
    });

    it('un rejeu hors ligne (même clé) rend le même traitement, une seule fois', async () => {
      const again = await post(treatments(), {
        careType: 'ANTIBIOTIQUE',
        productName: 'Oxytétracycline',
        administeredAt: day(-2),
        idempotencyKey: key,
      }).expect(201);
      expect(again.body.id).toBe(firstId);
      const list = await get(treatments()).expect(200);
      expect(list.body.filter((t: { id: string }) => t.id === firstId)).toHaveLength(1);
    });

    it('refuse une fin avant le début, trop d’animaux ou un code tant que la liste est vide', async () => {
      const base = { careType: 'VITAMINE', productName: 'Vitamines' };
      const before = await post(treatments(), {
        ...base,
        administeredAt: day(0),
        endDate: day(-1),
      }).expect(400);
      expect(before.body.message).toContain('précéder');
      const tooMany = await post(treatments(), { ...base, animalCount: 501 }).expect(400);
      expect(tooMany.body.message).toContain('501');
      const coded = await post(treatments(), { careType: 'VITAMINE', productCode: 'AMOX' }).expect(400);
      expect(coded.body.message).toContain('vide');
    });

    it('dès que les vétérinaires remplissent la liste, le produit vient de la liste', async () => {
      await post(
        '/surveillance/lists/PRODUIT_TRAITEMENT',
        { code: productCode, label: `Amoxicilline ${tag}` },
        vetToken,
      ).expect(201);
      added = true;
      const free = await post(treatments(), {
        careType: 'ANTIBIOTIQUE',
        productName: 'Produit libre',
      }).expect(400);
      expect(free.body.message).toContain('PRODUIT_TRAITEMENT');
      const unknown = await post(treatments(), {
        careType: 'ANTIBIOTIQUE',
        productCode: `${productCode}_X`,
      }).expect(400);
      expect(unknown.body.message).toContain('inconnu');
      const listed = await post(treatments(), {
        careType: 'ANTIBIOTIQUE',
        productCode,
        productName: 'ignoré',
        animalCount: 500,
        reason: 'Prévention',
      }).expect(201);
      expect(listed.body).toMatchObject({ productCode, productName: `Amoxicilline ${tag}` });
      // A replay queued before the list was filled still returns its record.
      const replay = await post(treatments(), {
        careType: 'ANTIBIOTIQUE',
        productName: 'Oxytétracycline',
        idempotencyKey: key,
      }).expect(201);
      expect(replay.body.id).toBe(firstId);
      // Deactivated: the list is empty again, free text is back.
      await patch(`/surveillance/lists/PRODUIT_TRAITEMENT/${productCode}`, { active: false }, vetToken).expect(200);
      added = false;
      await post(treatments(), { careType: 'VITAMINE', productName: 'Vitamines' }).expect(201);
    });
  });

  describe('réalisation d’une vaccination (n° 22)', () => {
    let events: Array<{ id: string; careType: string; status: string }>;

    beforeAll(async () => {
      const res = await post(`/farms/${farmId}/batches/${batchId}/prophylaxis/generate`, {}).expect(201);
      events = (res.body as typeof events).filter((e) => e.status !== 'ANNULE');
      expect(events.length).toBeGreaterThanOrEqual(2);
    });

    const complete = (eventId: string, body: object) =>
      post(`/farms/${farmId}/batches/${batchId}/prophylaxis/${eventId}/complete`, body);

    it('garde le nombre d’animaux et la voie réellement utilisée, une seule fois par clé', async () => {
      const [first] = events;
      const key = `off-prophylaxis-complete-${tag}`;
      const done = await complete(first.id, {
        completedAt: day(0),
        animalCount: 495,
        route: 'Nébulisation',
        idempotencyKey: key,
      }).expect(201);
      expect(done.body).toMatchObject({ status: 'FAIT', animalCount: 495, route: 'Nébulisation' });
      const replay = await complete(first.id, { completedAt: day(0), animalCount: 495, idempotencyKey: key }).expect(201);
      expect(replay.body).toMatchObject({ id: first.id, status: 'FAIT', animalCount: 495 });
      const other = await complete(first.id, { idempotencyKey: `${key}-autre` }).expect(400);
      expect(other.body.message).toContain('déjà été réalisé');
      await complete(first.id, {}).expect(400);
    });

    it('refuse plus d’animaux que l’effectif mis en place', async () => {
      const res = await complete(events[1].id, { animalCount: 900 }).expect(400);
      expect(res.body.message).toContain('900');
    });
  });
});
