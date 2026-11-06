import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { WeighingsService } from './../src/modules/bandes/weighings.service.js';
import { NotifyService } from './../src/modules/notify/notify.service.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  uniquePhone,
} from './helpers/programme-farm.js';

/** `YYYY-MM-DD`, `n` days from today (UTC). */
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * POUFA lot A « saisies de bande »: CDC n° 6 to 9 (weighing reminder to the
 * team, recipient required, ABATTOIR birds leaving at the sortie), §6.1 T2
 * (inputs in the lot history) and A4 F4 (cessions from Fermia sales).
 */
describe('Programme POUFA — saisies de bande, sorties et cessions (lot A, e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let ownerToken: string;
  let farmId: string;
  let buyerOperator: { id: string; code: string };

  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');

  const get = (url: string, token = ownerToken) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token = ownerToken) =>
    request(server).post(url).set(auth(token)).send(body);
  const patch = (url: string, body: object, token = ownerToken) =>
    request(server).patch(url).set(auth(token)).send(body);

  async function openBand(quantityAtStart: number, integrationDate = day(-10)) {
    const res = await post(`/farms/${farmId}/batches`, {
      batchName: `Bande saisies ${tag}`,
      type: 'CHAIR',
      integrationDate,
      quantityAtStart,
    }).expect(201);
    return res.body as { id: string; code: string };
  }
  const sortie = (batchId: string, body: object) =>
    post(`/farms/${farmId}/bandes/${batchId}/sorties`, {
      sortieDate: day(0),
      ...body,
    });
  const alive = async (batchId: string) =>
    (await get(`/farms/${farmId}/batches/${batchId}`).expect(200)).body
      .quantityAlive as number;
  const status = async (batchId: string) =>
    (await get(`/farms/${farmId}/batches/${batchId}`).expect(200)).body
      .status as string;
  const sortiesOf = async (batchId: string) =>
    (await get(`/farms/${farmId}/bandes/${batchId}/sorties`).expect(200))
      .body as Array<Record<string, any>>;
  const subLotsOf = async (batchId: string) =>
    (
      (await get(`/farms/${farmId}/trace/lots?batchId=${batchId}`).expect(200))
        .body as Array<Record<string, any>>
    ).filter((l) => l.kind === 'SOUS_LOT');

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
      name: `Ferme Saisies ${tag}`,
      exploitantName: 'Éleveur Saisies',
    });
    farmId = farm.farmId;
    ownerToken = farm.ownerToken;
    buyerOperator = (
      await post(
        '/trace/operators',
        { typeCode: 'ACHETEUR', name: `Acheteur saisies ${tag}` },
        adminToken,
      ).expect(201)
    ).body;
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  describe('pesées (n° 8)', () => {
    it('le rappel de pesée en retard va à toute l’équipe, membres ELEVEUR compris', async () => {
      const rules = (
        await get('/programme/notification-rules', adminToken).expect(200)
      ).body as Array<{ code: string; audience: string }>;
      expect(rules.find((r) => r.code === 'FERME_PESEE_RETARD')?.audience).toBe(
        'FARM_TEAM',
      );

      const phone = uniquePhone('+2418');
      await post(`/farms/${farmId}/eleveurs`, {
        phone,
        fullName: `Éleveur pesée ${tag}`,
        code: 'secret456',
        role: 'ELEVEUR',
      }).expect(201);
      const eleveurToken = await login(server, phone, 'secret456');

      // Opened 20 days ago, never weighed: past the weighing frequency.
      const band = await openBand(200, day(-20));
      const late = await app.get(WeighingsService).sweepLate();
      expect(late.map((e) => e.batchId)).toContain(band.id);
      const notify = app.get(NotifyService);
      for (let i = 0; i < 3; i++) await notify.flush();
      const inbox = (
        await get('/notifications?limit=200', eleveurToken).expect(200)
      ).body as { items: Array<{ event: string; subjectId: string | null }> };
      expect(
        inbox.items.some((n) => n.event === 'WEIGHING_LATE'),
      ).toBe(true);
    });

    it('le nombre pesé est enregistré avec le poids et comparé au paramètre', async () => {
      const band = await openBand(100);
      await post(`/farms/${farmId}/batches/${band.id}/daily-entries`, {
        entryDate: day(-1),
        deaths: 0,
        avgWeightKg: 0.4,
        sampleSize: 5,
      }).expect(201);
      const sheet = (await get(`/farms/${farmId}/bandes/${band.id}`).expect(200))
        .body;
      expect(sheet.weighing).toMatchObject({
        lastWeighingDate: day(-1),
        lastSampleSize: 5,
      });
      expect(sheet.weighing.lastSampleBelowExpected).toBe(
        5 < sheet.weighing.expectedSampleSize,
      );
    });
  });

  describe('sorties (n° 7 et 9)', () => {
    it('le destinataire est obligatoire : un nom ou un opérateur', async () => {
      const band = await openBand(50);
      const refused = await sortie(band.id, {
        count: 2,
        reasonCode: 'DON',
      }).expect(400);
      expect(refused.body.message).toBe(
        'Le destinataire est obligatoire : un nom ou un opérateur du registre.',
      );
      await sortie(band.id, {
        count: 2,
        reasonCode: 'DON',
        recipientName: '   ',
      }).expect(400);
      await sortie(band.id, {
        count: 2,
        reasonCode: 'DON',
        recipientName: 'École du quartier',
      }).expect(201);
      await sortie(band.id, {
        count: 2,
        reasonCode: 'REFORME',
        operatorId: buyerOperator.id,
      }).expect(201);
      expect(await alive(band.id)).toBe(46);
    });

    it('une sortie abattoir retire les sujets de l’effectif dès la sortie, l’ordre suit sans double compte', async () => {
      const band = await openBand(100);
      const first = await sortie(band.id, {
        count: 60,
        reasonCode: 'ABATTOIR',
        recipientName: 'Abattoir de Ntoum',
      }).expect(201);
      expect(first.body.slaughterStatus).toBe('DRAFT');
      expect(await alive(band.id)).toBe(40);
      // Two draft sorties can no longer exceed the headcount together.
      const over = await sortie(band.id, {
        count: 50,
        reasonCode: 'ABATTOIR',
        recipientName: 'Abattoir de Ntoum',
      }).expect(400);
      expect(over.body.message).toContain('Sortie impossible');

      const orderUrl = `/farms/${farmId}/slaughter-orders/${first.body.slaughterOrderId}`;
      await patch(orderUrl, { birdCount: 70 }).expect(400);
      await post(`${orderUrl}/send`, {}).expect(201);
      expect(await alive(band.id)).toBe(40);
      await post(`${orderUrl}/process`, { carcassWeightKg: 90 }).expect(201);
      expect(await alive(band.id)).toBe(40);
      const rows = (
        await get(`/farms/${farmId}/bandes/${band.id}/daily-stats`).expect(200)
      ).body as Array<{ day: string; removals: number; present: number }>;
      expect(rows[rows.length - 1]).toMatchObject({
        day: day(0),
        removals: 60,
        present: 40,
      });

      // Cancelling a sortie's order gives the birds back.
      const second = await sortie(band.id, {
        count: 10,
        reasonCode: 'ABATTOIR',
        recipientName: 'Abattoir de Ntoum',
      }).expect(201);
      expect(await alive(band.id)).toBe(30);
      await post(
        `/farms/${farmId}/slaughter-orders/${second.body.slaughterOrderId}/cancel`,
        { reason: 'Abattoir fermé' },
      ).expect(201);
      expect(await alive(band.id)).toBe(40);

      // The last birds leave by sortie: the band closes, its order still
      // goes to the abattoir and is processed.
      const last = await sortie(band.id, {
        count: 40,
        reasonCode: 'ABATTOIR',
        recipientName: 'Abattoir de Ntoum',
        weightKg: 70,
      }).expect(201);
      expect(await status(band.id)).toBe('CLOTURE');
      const lastUrl = `/farms/${farmId}/slaughter-orders/${last.body.slaughterOrderId}`;
      await post(`${lastUrl}/send`, {}).expect(201);
      await post(`${lastUrl}/process`, {}).expect(201);
      const indicators = (
        await get(`/farms/${farmId}/bandes/${band.id}/indicators`).expect(200)
      ).body;
      expect(indicators.variables).toMatchObject({
        sortis_tetes: 100,
        presents: 0,
      });
      // The weighed sortie counts its 70 kg (the 60 unweighed heads add their
      // estimated weight on top), and only once.
      expect(indicators.variables.poids_sortis_kg).toBeGreaterThanOrEqual(70);
      expect(indicators.variables.poids_sortis_kg).toBeLessThan(80);
    });
  });

  describe('cessions depuis les ventes (F4)', () => {
    let band: { id: string; code: string };
    let customerId: string;

    beforeAll(async () => {
      band = await openBand(300);
      const customer = await post(`/farms/${farmId}/customers`, {
        fullName: `Client opérateur ${tag}`,
      }).expect(201);
      customerId = customer.body.id;
      await patch(`/farms/${farmId}/customers/${customerId}`, {
        operatorId: buyerOperator.id,
      }).expect(200);
    });

    it('une vente en caisse à un client lié à un opérateur crée la cession, sans double compte', async () => {
      const sale = await post(`/farms/${farmId}/sales`, {
        customerId,
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 12,
            unit: 'PIECE',
            unitPriceFcfa: 3000,
            batchId: band.id,
          },
        ],
      }).expect(201);
      const saleId = sale.body.sale?.id ?? sale.body.id;
      expect(await alive(band.id)).toBe(288);
      const sorties = await sortiesOf(band.id);
      expect(sorties).toHaveLength(1);
      expect(sorties[0]).toMatchObject({
        reasonFamily: 'VENTE',
        count: 12,
        saleId,
        operatorId: buyerOperator.id,
        recipientName: `Client opérateur ${tag}`,
      });
      const subs = await subLotsOf(band.id);
      expect(subs).toHaveLength(1);
      expect(subs[0]).toMatchObject({
        status: 'CEDE',
        quantity: 12,
        sortieId: sorties[0].id,
        operator: { id: buyerOperator.id },
      });
      expect(subs[0].qrUrl).toEqual(expect.any(String));
    });

    it('une sortie VENTE vers un opérateur crée une seule vente et une seule cession', async () => {
      await sortie(band.id, {
        count: 8,
        reasonCode: 'VENTE_VIF',
        operatorId: buyerOperator.id,
        recipientName: `Client opérateur ${tag}`,
        unitPriceFcfa: 2800,
      }).expect(201);
      expect(await alive(band.id)).toBe(280);
      expect(await sortiesOf(band.id)).toHaveLength(2);
      expect(await subLotsOf(band.id)).toHaveLength(2);
    });

    it('une commande livrée à ce client crée la cession à la livraison', async () => {
      const order = await post(`/farms/${farmId}/orders`, {
        canal: 'FERME',
        expectedDate: day(0),
        customerId,
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 5,
            unit: 'PIECE',
            unitPriceFcfa: 3000,
            batchId: band.id,
          },
        ],
      }).expect(201);
      // Ordered, not delivered: no cession yet.
      expect(await subLotsOf(band.id)).toHaveLength(2);
      await post(`/farms/${farmId}/orders/${order.body.id}/livrer`, {}).expect(
        201,
      );
      expect(await alive(band.id)).toBe(275);
      const subs = await subLotsOf(band.id);
      expect(subs).toHaveLength(3);
      expect(subs.map((s) => s.quantity)).toEqual(
        expect.arrayContaining([12, 8, 5]),
      );
    });

    it('une vente à un client sans opérateur n’est pas une cession', async () => {
      await post(`/farms/${farmId}/sales`, {
        customerName: `Client libre ${tag}`,
        customerPhone: uniquePhone('+2416'),
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 3,
            unit: 'PIECE',
            unitPriceFcfa: 3000,
            batchId: band.id,
          },
        ],
      }).expect(201);
      expect(await alive(band.id)).toBe(272);
      expect(await sortiesOf(band.id)).toHaveLength(3);
      expect(await subLotsOf(band.id)).toHaveLength(3);
    });
  });

  describe('historique du lot (T2)', () => {
    it('réunit les livraisons d’intrants reçues et l’aliment consommé par lot', async () => {
      const band = await openBand(400);
      const delivery = await post(
        '/programme/input-deliveries',
        {
          farmId,
          source: 'ETAT_SMAG',
          shippedAt: day(-2),
          lines: [
            {
              intrantCode: 'ALIMENT_DEMARRAGE',
              unitCode: 'SAC',
              quantity: 10,
              bagSizeKg: 50,
              feedPhase: 'DEMARRAGE',
              subsidized: true,
              subsidyRate: 70,
              unitValueFcfa: 15_000,
            },
          ],
        },
        adminToken,
      ).expect(201);
      await post(
        `/farms/${farmId}/input-deliveries/${delivery.body.id}/confirm`,
        {},
      ).expect(201);
      await post(`/farms/${farmId}/batches/${band.id}/daily-entries`, {
        entryDate: day(0),
        deaths: 1,
        feedQuantity: 40,
        feedUnit: 'KG',
        feedPhase: 'DEMARRAGE',
      }).expect(201);

      const [root] = (
        await get(`/farms/${farmId}/trace/lots?batchId=${band.id}`).expect(200)
      ).body as Array<{ id: string }>;
      const history = (
        await get(`/farms/${farmId}/trace/lots/${root.id}`).expect(200)
      ).body as { rearing: Array<{ kind: string; label: string; details: any }> };
      const intrant = history.rearing.find(
        (r) => r.kind === 'INTRANT' && r.details.code === delivery.body.code,
      );
      expect(intrant?.label).toContain(`Livraison ${delivery.body.code} reçue`);
      const feed = history.rearing.filter((r) => r.kind === 'ALIMENT');
      expect(feed).toHaveLength(1);
      expect(feed[0].label).toContain('Aliment consommé : 40 kg');
      expect(feed[0].details.inputLotId).toEqual(expect.any(String));
    });
  });
});
