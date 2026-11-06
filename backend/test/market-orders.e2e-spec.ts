import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { Farm } from './../src/modules/farms/entities/farm.entity.js';
import { MarketOrder } from './../src/modules/market/entities/market-order.entity.js';
import { MarketSweepService } from './../src/modules/market/market-sweep.service.js';
import {
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  uniquePhone,
} from './helpers/programme-farm.js';

function dayOffset(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}
const HOUR = 60 * 60 * 1000;

describe('Market : demandes, acceptation et délai d’acompte (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let dataSource: DataSource;
  let sweep: MarketSweepService;
  let ownerToken: string;
  let farmId: string;
  let buyerToken: string;
  let buyerPhone: string;
  let adminToken: string;
  let seq = 0;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const farmOrders = () => `/farms/${farmId}/market/orders`;

  // Not `registerBuyer`: these buyers carry a type, organisation and city.
  const newBuyer = async (over: Record<string, unknown> = {}) => {
    const number = uniquePhone();
    const res = await request(server)
      .post('/auth/register-buyer')
      .send({ phone: number, fullName: 'Acheteur', code: 'secret123', ...over })
      .expect(201);
    return { token: res.body.accessToken as string, phone: number };
  };

  /** A new lot of 100 birds with a published listing on it. */
  const newListing = async (over: Record<string, unknown> = {}) => {
    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set(auth(ownerToken))
      .send({
        batchName: `Lot ${seq++}`,
        integrationDate: dayOffset(-45),
        quantityAtStart: 100,
        type: 'CHAIR',
      })
      .expect(201);
    const listing = await request(server)
      .post(`/farms/${farmId}/market/listings`)
      .set(auth(ownerToken))
      .send({
        kind: 'PRE',
        product: 'BIRDS',
        batchId: batch.body.id,
        unitPriceFcfa: 3000,
        quantityPublished: 50,
        readyDate: dayOffset(14),
        depositPct: 30,
        deliveryAvailable: true,
        deliveryFeeFcfa: 2000,
        ...over,
      })
      .expect(201);
    await request(server)
      .post(`/farms/${farmId}/market/listings/${listing.body.id}/publish`)
      .set(auth(ownerToken))
      .expect(201);
    return { id: listing.body.id as string, batchId: batch.body.id as string };
  };

  const ask = (
    listingId: string,
    over: Record<string, unknown> = {},
    token = buyerToken,
  ) =>
    request(server)
      .post('/market/orders')
      .set(auth(token))
      .send({ listingId, quantity: 10, fulfilment: 'PICKUP', ...over });

  const accept = (id: string) =>
    request(server).post(`${farmOrders()}/${id}/accept`).set(auth(ownerToken));

  const acceptedOrder = async (over: Record<string, unknown> = {}) => {
    const listing = await newListing(over);
    const asked = await ask(listing.id).expect(201);
    const accepted = await accept(asked.body.id).expect(201);
    return {
      listing,
      id: asked.body.id as string,
      orderId: accepted.body.orderId as string,
    };
  };

  const buyerRead = async (id: string, token = buyerToken) =>
    (
      await request(server)
        .get(`/market/orders/${id}`)
        .set(auth(token))
        .expect(200)
    ).body;

  const available = async (listingId: string) =>
    (await request(server).get(`/market/listings/${listingId}`).expect(200))
      .body.availableQuantity as number;

  const pastDeadline = (id: string) =>
    dataSource
      .getRepository(MarketOrder)
      .update({ id }, { depositDueAt: new Date(Date.now() - HOUR) });

  const recordDeposit = (orderId: string, amountFcfa: number) =>
    request(server)
      .post(`/farms/${farmId}/orders/${orderId}/deposit`)
      .set(auth(ownerToken))
      .send({ amountFcfa });

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
    dataSource = app.get(DataSource);
    sweep = app.get(MarketSweepService);

    adminToken = (await createPlatformAdmin(server, dataSource)).token;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Demandes ${uniquePhone('')}`,
      exploitantName: 'Proprio Demandes',
    });
    ownerToken = farm.ownerToken;
    farmId = farm.farmId;
    await dataSource
      .getRepository(Farm)
      .update({ id: farmId }, { isVerified: true });
    await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set(auth(ownerToken))
      .send({ openingBalanceFcfa: 100000 })
      .expect(201);

    const buyer = await newBuyer({
      type: 'HOTEL',
      organizationName: 'Hôtel du Port',
      city: 'Port-Gentil',
    });
    buyerToken = buyer.token;
    buyerPhone = buyer.phone;
    // App boot + admin, programme farm, activation and logins (bcrypt each):
    // over the default 10 s hook timeout when the machine is loaded.
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  describe('demande', () => {
    it('fige le prix, ne réserve rien et cache le téléphone de la ferme', async () => {
      const listing = await newListing();
      const res = await ask(listing.id, {
        fulfilment: 'DELIVERY',
        address: 'Akanda',
      }).expect(201);
      expect(res.body).toMatchObject({
        status: 'PENDING',
        quantity: 10,
        unitPriceFcfa: 3000,
        deliveryFeeFcfa: 2000,
        totalFcfa: 32000,
        depositRequiredFcfa: 9000,
        contactPhone: buyerPhone,
      });
      expect(res.body.farm.phone).toBeNull();
      expect(await available(listing.id)).toBe(50);

      await request(server)
        .patch(`/farms/${farmId}/market/listings/${listing.id}`)
        .set(auth(ownerToken))
        .send({ unitPriceFcfa: 9999 })
        .expect(200);
      const accepted = await accept(res.body.id).expect(201);
      expect(accepted.body.totalFcfa).toBe(32000);
    });

    it('rejoue une même clé sans doublon, même en concurrence', async () => {
      const listing = await newListing();
      const key = `k-${Date.now()}`;
      const [a, b] = await Promise.all([
        ask(listing.id, { idempotencyKey: key }),
        ask(listing.id, { idempotencyKey: key }),
      ]);
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(a.body.id).toBe(b.body.id);
    });

    it.each([
      ['sous le minimum', { minOrderQty: 5 }, { quantity: 4 }],
      ['au-dessus du disponible', {}, { quantity: 51 }],
      [
        'livraison non proposée',
        { deliveryAvailable: false, deliveryFeeFcfa: 0 },
        { fulfilment: 'DELIVERY', address: 'A' },
      ],
      ['livraison sans adresse', {}, { fulfilment: 'DELIVERY' }],
      ['retrait non proposé', { pickupAvailable: false }, {}],
      ['date choisie sur une précommande', {}, { desiredDate: dayOffset(3) }],
    ])('refuse : %s', async (_label, listingOver, askOver) => {
      const listing = await newListing(listingOver);
      await ask(listing.id, askOver).expect(400);
    });

    it('refuse une annonce cachée comme si elle n’existait pas', async () => {
      const listing = await newListing();
      await request(server)
        .post(`/farms/${farmId}/market/listings/${listing.id}/pause`)
        .set(auth(ownerToken))
        .expect(201);
      await ask(listing.id).expect(404);
    });

    it('n’accepte pas de commander à sa propre ferme, ni comme employé', async () => {
      const listing = await newListing();
      const own = await ask(listing.id, {}, ownerToken).expect(400);
      expect(own.body.message).toMatch(/propre ferme/);

      const staffPhone = uniquePhone();
      await request(server)
        .post(`/farms/${farmId}/eleveurs`)
        .set(auth(ownerToken))
        .send({ phone: staffPhone, fullName: 'Employé', code: 'secret123' })
        .expect(201);
      const staffToken = await login(server, staffPhone, 'secret123');
      await ask(listing.id, {}, staffToken).expect(400);
    });

    it('laisse un autre propriétaire commander', async () => {
      const listing = await newListing();
      const other = await createProgrammeFarm(server, adminToken, {
        exploitantName: 'Autre Éleveur',
      });
      await ask(listing.id, {}, other.ownerToken).expect(201);
    });

    it('limite les demandes ouvertes par acheteur', async () => {
      const buyer = await newBuyer();
      const listing = await newListing();
      for (let i = 0; i < 10; i++) {
        await ask(listing.id, { quantity: 1 }, buyer.token).expect(201);
      }
      const refused = await ask(
        listing.id,
        { quantity: 1 },
        buyer.token,
      ).expect(400);
      expect(refused.body.message).toMatch(/demandes en attente/);
    });

    it('exige une connexion', async () => {
      const listing = await newListing();
      await request(server)
        .post('/market/orders')
        .send({ listingId: listing.id, quantity: 1, fulfilment: 'PICKUP' })
        .expect(401);
    });

    it('permet de retirer une demande, une seule fois', async () => {
      const listing = await newListing();
      const asked = await ask(listing.id).expect(201);
      const res = await request(server)
        .post(`/market/orders/${asked.body.id}/withdraw`)
        .set(auth(buyerToken))
        .expect(201);
      expect(res.body.status).toBe('WITHDRAWN');
      await request(server)
        .post(`/market/orders/${asked.body.id}/withdraw`)
        .set(auth(buyerToken))
        .expect(400);
      await accept(asked.body.id).expect(400);
    });
  });

  describe('confidentialité', () => {
    it('cache la commande d’un autre acheteur', async () => {
      const listing = await newListing();
      const asked = await ask(listing.id).expect(201);
      const stranger = await newBuyer();
      await request(server)
        .get(`/market/orders/${asked.body.id}`)
        .set(auth(stranger.token))
        .expect(404);
      await request(server)
        .post(`/market/orders/${asked.body.id}/withdraw`)
        .set(auth(stranger.token))
        .expect(404);
      const mine = await request(server)
        .get('/market/orders')
        .set(auth(stranger.token))
        .expect(200);
      expect(mine.body).toEqual([]);
    });

    it('ne montre pas à l’acheteur le motif interne ni les données de la ferme', async () => {
      const { id, orderId } = await acceptedOrder();
      await request(server)
        .delete(`/farms/${farmId}/orders/${orderId}`)
        .set(auth(ownerToken))
        .query({ reason: 'client pénible' })
        .expect(200);
      const read = await buyerRead(id);
      expect(read.status).toBe('CANCELLED');
      const body = JSON.stringify(read);
      for (const secret of [
        'client pénible',
        'cancelledReason',
        'passport',
        'batchId',
        'batchName',
        'customerId',
        'saleId',
      ]) {
        expect(body).not.toContain(secret);
      }
    });

    it('refuse la gestion des demandes aux acheteurs, aux autres fermes et aux éleveurs', async () => {
      const listing = await newListing();
      const asked = await ask(listing.id).expect(201);
      await request(server)
        .post(`${farmOrders()}/${asked.body.id}/accept`)
        .set(auth(buyerToken))
        .expect(403);

      const other = await createProgrammeFarm(server, adminToken, {
        exploitantName: 'Autre',
      });
      await request(server)
        .post(`${farmOrders()}/${asked.body.id}/accept`)
        .set(auth(other.ownerToken))
        .expect(403);
      await request(server)
        .post(`/farms/${other.farmId}/market/orders/${asked.body.id}/accept`)
        .set(auth(other.ownerToken))
        .expect(404);

      const staffPhone = uniquePhone();
      await request(server)
        .post(`/farms/${farmId}/eleveurs`)
        .set(auth(ownerToken))
        .send({ phone: staffPhone, fullName: 'Éleveur', code: 'secret123' })
        .expect(201);
      const staffToken = await login(server, staffPhone, 'secret123');
      await request(server)
        .post(`${farmOrders()}/${asked.body.id}/accept`)
        .set(auth(staffToken))
        .expect(403);
    });
  });

  describe('acceptation', () => {
    it('crée la commande, réserve le stock et donne le téléphone de la ferme', async () => {
      const listing = await newListing();
      const asked = await ask(listing.id, {
        fulfilment: 'DELIVERY',
        address: 'Akanda',
      }).expect(201);
      const res = await accept(asked.body.id).expect(201);
      expect(res.body.state).toBe('ACCEPTED');
      expect(res.body.status).toBe('AWAITING_DEPOSIT');
      expect(res.body.buyer).toMatchObject({
        type: 'HOTEL',
        organizationName: 'Hôtel du Port',
      });

      const order = await request(server)
        .get(`/farms/${farmId}/orders/${res.body.orderId}`)
        .set(auth(ownerToken))
        .expect(200);
      expect(order.body).toMatchObject({
        source: 'MARKET',
        canal: 'PRECOMMANDE',
        status: 'PENDING',
        address: 'Akanda',
        totalAmountFcfa: 32000,
        depositFcfa: 0,
        expectedDate: dayOffset(14),
      });
      expect(order.body.customer.fullName).toBe('Hôtel du Port');
      expect(order.body.customer.type).toBe('HOTEL');

      expect(await available(listing.id)).toBe(40);

      const read = await buyerRead(asked.body.id);
      expect(read.status).toBe('AWAITING_DEPOSIT');
      expect(read.farm.phone).toBeTruthy();
      expect(new Date(read.depositDueAt).getTime()).toBeGreaterThan(
        Date.now() + 23 * HOUR,
      );
      expect(read.timeline.map((e: { type: string }) => e.type)).toEqual([
        'REQUESTED',
        'ACCEPTED',
      ]);
    });

    it('n’attend pas d’acompte quand l’annonce n’en demande pas', async () => {
      const { id } = await acceptedOrder({ depositPct: undefined });
      const read = await buyerRead(id);
      expect(read.status).toBe('CONFIRMED');
      expect(read.depositDueAt).toBeNull();
    });

    it('un second clic renvoie la même commande', async () => {
      const listing = await newListing();
      const asked = await ask(listing.id).expect(201);
      const first = await accept(asked.body.id).expect(201);
      const second = await accept(asked.body.id).expect(201);
      expect(second.body.orderId).toBe(first.body.orderId);
      expect(await available(listing.id)).toBe(40);
    });

    it('ne survend pas sur deux acceptations simultanées', async () => {
      const listing = await newListing();
      const a = await ask(listing.id, { quantity: 30 }).expect(201);
      const b = await ask(listing.id, { quantity: 30 }).expect(201);
      const answers = await Promise.all([accept(a.body.id), accept(b.body.id)]);
      expect(answers.map((r) => r.status).sort()).toEqual([201, 400]);
      expect(await available(listing.id)).toBe(20);
    });

    it('ne compte pas au-delà du stock réel même si l’annonce le permet', async () => {
      const listing = await newListing();
      const asked = await ask(listing.id, { quantity: 50 }).expect(201);
      await request(server)
        .post(`/farms/${farmId}/orders`)
        .set(auth(ownerToken))
        .send({
          canal: 'FERME',
          items: [
            {
              productType: 'POULET_PIECE',
              quantity: 60,
              unitPriceFcfa: 3000,
              batchId: listing.batchId,
            },
          ],
        })
        .expect(201);
      const res = await accept(asked.body.id).expect(400);
      expect(res.body.message).toMatch(/Réserve insuffisante/);
      const read = await buyerRead(asked.body.id);
      expect(read.status).toBe('PENDING');
    });

    it('refuse pendant un délai d’attente qui touche la date', async () => {
      const listing = await newListing({ readyDate: dayOffset(5) });
      const asked = await ask(listing.id).expect(201);
      await request(server)
        .post(`/farms/${farmId}/batches/${listing.batchId}/treatments`)
        .set(auth(ownerToken))
        .send({
          careType: 'ANTIBIOTIQUE',
          productName: 'Amoxicilline',
          withdrawalDays: 10,
        })
        .expect(201);
      const res = await accept(asked.body.id).expect(400);
      expect(res.body.message).toMatch(/délai d’attente/);
    });

    it('refuse une demande expirée, même avant le passage du balayage', async () => {
      const listing = await newListing();
      const asked = await ask(listing.id).expect(201);
      await dataSource
        .getRepository(MarketOrder)
        .update(
          { id: asked.body.id },
          { requestExpiresAt: new Date(Date.now() - 1000) },
        );
      await accept(asked.body.id).expect(400);
    });

    it('réutilise la fiche client de l’acheteur, sans toucher celle d’un tiers au même numéro', async () => {
      const victim = await request(server)
        .post(`/farms/${farmId}/customers`)
        .set(auth(ownerToken))
        .send({ fullName: 'Vrai Client', phone: buyerPhone })
        .expect(201);

      const first = await acceptedOrder();
      const second = await acceptedOrder();
      const [a, b] = await Promise.all(
        [first.orderId, second.orderId].map((orderId) =>
          request(server)
            .get(`/farms/${farmId}/orders/${orderId}`)
            .set(auth(ownerToken))
            .expect(200),
        ),
      );
      expect(a.body.customerId).toBe(b.body.customerId);
      expect(a.body.customerId).not.toBe(victim.body.id);
    });

    it('refuse sur une ferme suspendue', async () => {
      const listing = await newListing();
      const asked = await ask(listing.id).expect(201);
      await dataSource
        .getRepository(Farm)
        .update({ id: farmId }, { active: false });
      try {
        await accept(asked.body.id).expect(400);
      } finally {
        await dataSource
          .getRepository(Farm)
          .update({ id: farmId }, { active: true });
      }
    });
  });

  describe('refus', () => {
    it('donne le motif de la ferme à l’acheteur et ne réserve rien', async () => {
      const listing = await newListing();
      const asked = await ask(listing.id).expect(201);
      await request(server)
        .post(`${farmOrders()}/${asked.body.id}/reject`)
        .set(auth(ownerToken))
        .send({ reason: 'Pas de livraison ce mois-ci' })
        .expect(201);
      const read = await buyerRead(asked.body.id);
      expect(read.status).toBe('REJECTED');
      expect(read.rejectReason).toBe('Pas de livraison ce mois-ci');
      expect(await available(listing.id)).toBe(50);
      await accept(asked.body.id).expect(400);
    });
  });

  describe('après acceptation', () => {
    it('suit les étapes de la commande dans les écrans habituels', async () => {
      const { id, orderId, listing } = await acceptedOrder();
      await recordDeposit(orderId, 9000).expect(201);
      expect((await buyerRead(id)).status).toBe('CONFIRMED');
      expect((await buyerRead(id)).depositPaidFcfa).toBe(9000);

      await request(server)
        .post(`/farms/${farmId}/orders/${orderId}/livrer`)
        .set(auth(ownerToken))
        .send({ payment: { amountFcfa: 21000 } })
        .expect(201);
      const read = await buyerRead(id);
      expect(read.status).toBe('DELIVERED');
      expect(read.timeline.map((e: { type: string }) => e.type)).toContain(
        'DELIVERED',
      );
      expect(await available(listing.id)).toBe(40);
    });

    it('rend les oiseaux à l’annonce si la ferme annule', async () => {
      const { id, orderId, listing } = await acceptedOrder();
      expect(await available(listing.id)).toBe(40);
      await request(server)
        .delete(`/farms/${farmId}/orders/${orderId}`)
        .set(auth(ownerToken))
        .expect(200);
      expect((await buyerRead(id)).status).toBe('CANCELLED');
      expect(await available(listing.id)).toBe(50);
    });

    it('signale à la ferme un stock passé sous les réservations', async () => {
      const { id, listing } = await acceptedOrder();
      await dataSource.query(
        'UPDATE production_batches SET quantity_alive = 5 WHERE id = $1',
        [listing.batchId],
      );
      const list = await request(server)
        .get(farmOrders())
        .set(auth(ownerToken))
        .expect(200);
      expect(list.body.find((o: { id: string }) => o.id === id).oversold).toBe(
        true,
      );
    });

    it('refuse de livrer une commande Market pendant un délai d’attente, pas une commande de la ferme', async () => {
      const { orderId, listing } = await acceptedOrder();
      const farmOrder = await request(server)
        .post(`/farms/${farmId}/orders`)
        .set(auth(ownerToken))
        .send({
          canal: 'FERME',
          items: [
            {
              productType: 'POULET_PIECE',
              quantity: 1,
              unitPriceFcfa: 3000,
              batchId: listing.batchId,
            },
          ],
        })
        .expect(201);
      await request(server)
        .post(`/farms/${farmId}/batches/${listing.batchId}/treatments`)
        .set(auth(ownerToken))
        .send({
          careType: 'ANTIBIOTIQUE',
          productName: 'Amoxicilline',
          withdrawalDays: 3,
        })
        .expect(201);
      const refused = await request(server)
        .post(`/farms/${farmId}/orders/${orderId}/livrer`)
        .set(auth(ownerToken))
        .send({})
        .expect(400);
      expect(refused.body.message).toMatch(/délai d’attente/);
      await request(server)
        .post(`/farms/${farmId}/orders/${farmOrder.body.id}/livrer`)
        .set(auth(ownerToken))
        .send({})
        .expect(201);
    });
  });

  describe('délai de 48 heures sans réponse', () => {
    it('expire la demande et l’indique à l’acheteur', async () => {
      const listing = await newListing();
      const asked = await ask(listing.id).expect(201);
      expect((await sweep.sweep()).requests).toBeGreaterThanOrEqual(0);
      expect((await buyerRead(asked.body.id)).status).toBe('PENDING');

      await dataSource
        .getRepository(MarketOrder)
        .update(
          { id: asked.body.id },
          { requestExpiresAt: new Date(Date.now() - 1000) },
        );
      await sweep.sweep();
      const read = await buyerRead(asked.body.id);
      expect(read.status).toBe('REQUEST_EXPIRED');
      expect(read.timeline.map((e: { type: string }) => e.type)).toContain(
        'REQUEST_EXPIRED',
      );
    });
  });

  describe('délai de 24 heures pour l’acompte', () => {
    it('ne touche à rien avant l’échéance', async () => {
      const { id } = await acceptedOrder();
      await sweep.sweep();
      expect((await buyerRead(id)).status).toBe('AWAITING_DEPOSIT');
    });

    it('annule à l’échéance et rend les oiseaux, une seule fois', async () => {
      const { id, orderId, listing } = await acceptedOrder();
      expect(await available(listing.id)).toBe(40);
      await pastDeadline(id);

      const caisse = await request(server)
        .get(`/farms/${farmId}/caisse/current`)
        .set(auth(ownerToken))
        .expect(200);

      await sweep.sweep();
      const read = await buyerRead(id);
      expect(read.status).toBe('DEPOSIT_EXPIRED');
      expect(read.timeline.map((e: { type: string }) => e.type)).toContain(
        'DEPOSIT_EXPIRED',
      );
      expect(await available(listing.id)).toBe(50);

      const order = await request(server)
        .get(`/farms/${farmId}/orders/${orderId}`)
        .set(auth(ownerToken))
        .expect(200);
      expect(order.body.status).toBe('CANCELLED');
      expect(order.body.sale.status).toBe('CANCELLED');

      const after = await request(server)
        .get(`/farms/${farmId}/caisse/current`)
        .set(auth(ownerToken))
        .expect(200);
      expect(after.body.expectedBalanceFcfa).toBe(
        caisse.body.expectedBalanceFcfa,
      );

      const again = await sweep.sweep();
      expect(again.deposits).toBe(0);
    });

    it('garde une commande dont l’acompte a été enregistré, même partiel', async () => {
      const { id, orderId } = await acceptedOrder();
      await recordDeposit(orderId, 100).expect(201);
      await pastDeadline(id);
      await sweep.sweep();
      const read = await buyerRead(id);
      expect(read.status).toBe('CONFIRMED');

      const list = await request(server)
        .get(farmOrders())
        .set(auth(ownerToken))
        .expect(200);
      const row = list.body.find((o: { id: string }) => o.id === id);
      expect(row.depositPaidFcfa).toBe(100);
      expect(row.depositShortFcfa).toBe(8900);
    });

    it('ne perd pas un acompte enregistré au même moment que le balayage', async () => {
      for (let round = 0; round < 3; round++) {
        const { id, orderId } = await acceptedOrder();
        await pastDeadline(id);
        const [deposit] = await Promise.all([
          recordDeposit(orderId, 9000),
          sweep.sweep(),
        ]);
        const read = await buyerRead(id);
        if (deposit.status === 201) {
          expect(read.status).toBe('CONFIRMED');
          expect(read.depositPaidFcfa).toBe(9000);
        } else {
          expect(deposit.status).toBe(400);
          expect(read.status).toBe('DEPOSIT_EXPIRED');
          expect(read.depositPaidFcfa).toBe(0);
        }
        await request(server)
          .delete(`/farms/${farmId}/orders/${orderId}`)
          .set(auth(ownerToken));
      }
    });

    it('ne touche pas une commande sans acompte demandé', async () => {
      const { id } = await acceptedOrder({ depositPct: undefined });
      await dataSource
        .getRepository(MarketOrder)
        .update({ id }, { requestExpiresAt: new Date(Date.now() - HOUR) });
      await sweep.sweep();
      expect((await buyerRead(id)).status).toBe('CONFIRMED');
    });

    it('la ferme peut prolonger une seule fois de 24 heures', async () => {
      const { id } = await acceptedOrder();
      const before = (await buyerRead(id)).depositDueAt;
      await request(server)
        .post(`${farmOrders()}/${id}/extend-deposit`)
        .set(auth(ownerToken))
        .expect(201);
      const read = await buyerRead(id);
      expect(
        new Date(read.depositDueAt).getTime() - new Date(before).getTime(),
      ).toBe(24 * HOUR);
      expect(read.timeline.map((e: { type: string }) => e.type)).toContain(
        'DEPOSIT_EXTENDED',
      );

      const again = await request(server)
        .post(`${farmOrders()}/${id}/extend-deposit`)
        .set(auth(ownerToken))
        .expect(400);
      expect(again.body.message).toMatch(/déjà été prolongé/);
    });

    it('ne prolonge pas une commande déjà payée ni sans acompte', async () => {
      const paid = await acceptedOrder();
      await recordDeposit(paid.orderId, 9000).expect(201);
      await request(server)
        .post(`${farmOrders()}/${paid.id}/extend-deposit`)
        .set(auth(ownerToken))
        .expect(400);
      const none = await acceptedOrder({ depositPct: undefined });
      await request(server)
        .post(`${farmOrders()}/${none.id}/extend-deposit`)
        .set(auth(ownerToken))
        .expect(400);
    });
  });

  describe('vente immédiate et œufs', () => {
    it('crée une commande à la ferme, ou en livraison avec ses frais', async () => {
      const pickup = await newListing({
        kind: 'NOW',
        readyDate: undefined,
        depositPct: undefined,
      });
      const a = await ask(pickup.id, { desiredDate: dayOffset(2) }).expect(201);
      const accepted = await accept(a.body.id).expect(201);
      const order = await request(server)
        .get(`/farms/${farmId}/orders/${accepted.body.orderId}`)
        .set(auth(ownerToken))
        .expect(200);
      expect(order.body).toMatchObject({
        canal: 'FERME',
        expectedDate: dayOffset(2),
        totalAmountFcfa: 30000,
      });

      const b = await ask(pickup.id, {
        fulfilment: 'DELIVERY',
        address: 'Owendo',
      }).expect(201);
      const delivered = await accept(b.body.id).expect(201);
      const orderB = await request(server)
        .get(`/farms/${farmId}/orders/${delivered.body.orderId}`)
        .set(auth(ownerToken))
        .expect(200);
      expect(orderB.body).toMatchObject({
        canal: 'LIVRAISON',
        address: 'Owendo',
        totalAmountFcfa: 32000,
      });
    });

    it('vend des œufs par alvéole et les réserve', async () => {
      const lot = await request(server)
        .post(`/farms/${farmId}/batches`)
        .set(auth(ownerToken))
        .send({
          batchName: `Pondeuses ${seq++}`,
          integrationDate: dayOffset(-200),
          quantityAtStart: 100,
          type: 'PONDEUSE',
        })
        .expect(201);
      await request(server)
        .post(`/farms/${farmId}/batches/${lot.body.id}/daily-entries`)
        .set(auth(ownerToken))
        .send({
          entryDate: dayOffset(0),
          eggsCollected: 300,
          deaths: 0,
          feedKg: 10,
          waterLiters: 20,
        })
        .expect((r) => expect(r.status).toBeLessThan(300));
      const listing = await request(server)
        .post(`/farms/${farmId}/market/listings`)
        .set(auth(ownerToken))
        .send({
          kind: 'NOW',
          product: 'EGGS',
          batchId: lot.body.id,
          unitPriceFcfa: 2500,
          quantityPublished: 10,
        })
        .expect(201);
      await request(server)
        .post(`/farms/${farmId}/market/listings/${listing.body.id}/publish`)
        .set(auth(ownerToken))
        .expect(201);
      const asked = await ask(listing.body.id, { quantity: 4 }).expect(201);
      const accepted = await accept(asked.body.id).expect(201);
      const order = await request(server)
        .get(`/farms/${farmId}/orders/${accepted.body.orderId}`)
        .set(auth(ownerToken))
        .expect(200);
      expect(order.body.items[0]).toMatchObject({
        productType: 'OEUFS',
        quantity: 4,
        unit: 'ALVEOLES',
      });
      expect(order.body.totalAmountFcfa).toBe(10000);
      expect(await available(listing.body.id)).toBe(6);
    });
  });

  describe('quantité publiée', () => {
    it('ne descend pas sous ce qui est déjà accepté', async () => {
      const { listing } = await acceptedOrder();
      await request(server)
        .patch(`/farms/${farmId}/market/listings/${listing.id}`)
        .set(auth(ownerToken))
        .send({ quantityPublished: 9 })
        .expect(400);
      await request(server)
        .patch(`/farms/${farmId}/market/listings/${listing.id}`)
        .set(auth(ownerToken))
        .send({ quantityPublished: 10, minOrderQty: 1 })
        .expect(200);
      await request(server).get(`/market/listings/${listing.id}`).expect(404);
    });
  });
});
