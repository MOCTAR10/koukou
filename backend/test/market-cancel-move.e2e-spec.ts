import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { Farm } from './../src/modules/farms/entities/farm.entity.js';
import {
  createPlatformAdmin,
  createProgrammeFarm,
  registerBuyer,
  uniquePhone,
} from './helpers/programme-farm.js';

function dayOffset(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

describe('Market : annulation par l’acheteur et date déplacée (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let dataSource: DataSource;
  let ownerToken: string;
  let farmId: string;
  let buyerToken: string;
  let adminToken: string;
  let seq = 0;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const owner = () => auth(ownerToken);
  const buyer = () => auth(buyerToken);

  const newListing = async (over: Record<string, unknown> = {}) => {
    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set(owner())
      .send({
        batchName: `Lot ${seq++}`,
        integrationDate: dayOffset(-45),
        quantityAtStart: 100,
        type: 'CHAIR',
      })
      .expect(201);
    const listing = await request(server)
      .post(`/farms/${farmId}/market/listings`)
      .set(owner())
      .send({
        kind: 'PRE',
        product: 'BIRDS',
        batchId: batch.body.id,
        unitPriceFcfa: 3000,
        quantityPublished: 50,
        readyDate: dayOffset(14),
        depositPct: 30,
        ...over,
      })
      .expect(201);
    await request(server)
      .post(`/farms/${farmId}/market/listings/${listing.body.id}/publish`)
      .set(owner())
      .expect(201);
    return { id: listing.body.id as string, batchId: batch.body.id as string };
  };

  const ask = async (listingId: string) => {
    const res = await request(server)
      .post('/market/orders')
      .set(buyer())
      .send({ listingId, quantity: 10, fulfilment: 'PICKUP' })
      .expect(201);
    return res.body.id as string;
  };

  const acceptedOrder = async (over: Record<string, unknown> = {}) => {
    const listing = await newListing(over);
    const id = await ask(listing.id);
    const res = await request(server)
      .post(`/farms/${farmId}/market/orders/${id}/accept`)
      .set(owner())
      .expect(201);
    return { listing, id, orderId: res.body.orderId as string };
  };

  const cancel = (id: string, token = buyerToken) =>
    request(server).post(`/market/orders/${id}/cancel`).set(auth(token));

  const buyerRead = async (id: string) =>
    (await request(server).get(`/market/orders/${id}`).set(buyer()).expect(200))
      .body;

  const available = async (listingId: string) =>
    (await request(server).get(`/market/listings/${listingId}`).expect(200))
      .body.availableQuantity as number;

  const cashBalance = async () =>
    (
      await request(server)
        .get(`/farms/${farmId}/caisse/current`)
        .set(owner())
        .expect(200)
    ).body.expectedBalanceFcfa as number;

  const farmRow = async (id: string) => {
    const list = await request(server)
      .get(`/farms/${farmId}/market/orders`)
      .set(owner())
      .expect(200);
    return list.body.find((o: { id: string }) => o.id === id);
  };

  const orderOf = async (orderId: string) =>
    (
      await request(server)
        .get(`/farms/${farmId}/orders/${orderId}`)
        .set(owner())
        .expect(200)
    ).body;

  const move = (listingId: string, readyDate: string) =>
    request(server)
      .post(`/farms/${farmId}/market/listings/${listingId}/move-date`)
      .set(owner())
      .send({ readyDate });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    // Concurrent requests need a listening server (else ECONNRESET).
    await app.listen(0);
    server = app.getHttpServer();
    dataSource = app.get(DataSource);

    adminToken = (await createPlatformAdmin(server, dataSource)).token;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Annulation ${uniquePhone('')}`,
      exploitantName: 'Proprio Annulation',
      // Market listings are only shown for OPERATIONNELLE farms (POUFA).
      extra: { statusCode: 'OPERATIONNELLE' },
    });
    ownerToken = farm.ownerToken;
    farmId = farm.farmId;
    await dataSource
      .getRepository(Farm)
      .update({ id: farmId }, { isVerified: true });
    await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set(owner())
      .send({ openingBalanceFcfa: 100000 })
      .expect(201);

    buyerToken = (await registerBuyer(server, { fullName: 'Acheteur' })).token;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  describe('annulation par l’acheteur', () => {
    it('retire simplement une demande pas encore acceptée', async () => {
      const listing = await newListing();
      const id = await ask(listing.id);
      const res = await cancel(id).expect(201);
      expect(res.body.status).toBe('WITHDRAWN');
    });

    it('sans acompte : annule tout de suite et rend les oiseaux, sans caisse', async () => {
      const { id, orderId, listing } = await acceptedOrder();
      const before = await cashBalance();
      const res = await cancel(id).expect(201);
      expect(res.body.status).toBe('CANCELLED');
      expect(await available(listing.id)).toBe(50);
      expect(await cashBalance()).toBe(before);
      const order = await orderOf(orderId);
      expect(order.status).toBe('CANCELLED');
      expect(order.sale.status).toBe('CANCELLED');
    });

    it('avec acompte : demande seulement, les oiseaux restent réservés', async () => {
      const { id, orderId, listing } = await acceptedOrder();
      await request(server)
        .post(`/farms/${farmId}/orders/${orderId}/deposit`)
        .set(owner())
        .send({ amountFcfa: 9000 })
        .expect(201);
      const before = await cashBalance();

      const res = await cancel(id).expect(201);
      expect(res.body.status).toBe('CANCEL_REQUESTED');
      expect(res.body.timeline.map((e: { type: string }) => e.type)).toContain(
        'CANCEL_REQUESTED',
      );
      expect((await orderOf(orderId)).status).toBe('CONFIRMED');
      expect(await available(listing.id)).toBe(40);
      expect(await cashBalance()).toBe(before);
      expect((await farmRow(id)).cancelRequestedAt).toBeTruthy();

      const first = res.body.cancelRequestedAt;
      const twice = await cancel(id).expect(201);
      expect(twice.body.cancelRequestedAt).toBe(first);

      // The farm refunds through its normal cancellation.
      await request(server)
        .delete(`/farms/${farmId}/orders/${orderId}`)
        .set(owner())
        .query({ reason: 'Remboursé' })
        .expect(200);
      expect((await buyerRead(id)).status).toBe('CANCELLED');
      expect(await available(listing.id)).toBe(50);
      expect(await cashBalance()).toBe(before - 9000);
    });

    it('avec acompte puis livraison : la demande n’empêche pas de livrer', async () => {
      const { id, orderId } = await acceptedOrder();
      await request(server)
        .post(`/farms/${farmId}/orders/${orderId}/deposit`)
        .set(owner())
        .send({ amountFcfa: 9000 })
        .expect(201);
      await cancel(id).expect(201);
      await request(server)
        .post(`/farms/${farmId}/orders/${orderId}/livrer`)
        .set(owner())
        .send({ payment: { amountFcfa: 21000 } })
        .expect(201);
      expect((await buyerRead(id)).status).toBe('DELIVERED');
    });

    it('refuse après livraison, et sur la commande d’un autre', async () => {
      const { id, orderId } = await acceptedOrder({ depositPct: undefined });
      const stranger = await registerBuyer(server, { fullName: 'Autre' });
      await cancel(id, stranger.token).expect(404);

      await request(server)
        .post(`/farms/${farmId}/orders/${orderId}/livrer`)
        .set(owner())
        .send({})
        .expect(201);
      await cancel(id).expect(400);
    });

    it('répond sans erreur à une seconde annulation, et ne relance rien', async () => {
      const { id, listing } = await acceptedOrder();
      await cancel(id).expect(201);
      const again = await cancel(id).expect(201);
      expect(again.body.status).toBe('CANCELLED');
      expect(await available(listing.id)).toBe(50);
    });

    it('refuse une demande déjà refusée', async () => {
      const listing = await newListing();
      const id = await ask(listing.id);
      await request(server)
        .post(`/farms/${farmId}/market/orders/${id}/reject`)
        .set(owner())
        .send({})
        .expect(201);
      await cancel(id).expect(400);
    });

    it('ne perd rien si un acompte arrive au même moment', async () => {
      for (let round = 0; round < 3; round++) {
        const { id, orderId } = await acceptedOrder();
        const before = await cashBalance();
        const [deposit, cancelled] = await Promise.all([
          request(server)
            .post(`/farms/${farmId}/orders/${orderId}/deposit`)
            .set(owner())
            .send({ amountFcfa: 9000 }),
          cancel(id),
        ]);
        expect(cancelled.status).toBe(201);
        const order = await orderOf(orderId);
        if (deposit.status === 201) {
          expect(order.status).toBe('CONFIRMED');
          expect((await buyerRead(id)).status).toBe('CANCEL_REQUESTED');
          expect(await cashBalance()).toBe(before + 9000);
          await request(server)
            .delete(`/farms/${farmId}/orders/${orderId}`)
            .set(owner())
            .expect(200);
        } else {
          expect(deposit.status).toBe(400);
          expect(order.status).toBe('CANCELLED');
          expect(await cashBalance()).toBe(before);
        }
      }
    });
  });

  describe('date déplacée', () => {
    it('déplace l’annonce et les commandes ouvertes, et prévient l’acheteur', async () => {
      const { id, orderId, listing } = await acceptedOrder();
      const original = dayOffset(14);
      const next = dayOffset(21);
      const res = await move(listing.id, next).expect(201);
      expect(res.body).toMatchObject({
        readyDate: next,
        previousReadyDate: original,
      });

      expect((await orderOf(orderId)).expectedDate).toBe(next);

      const read = await buyerRead(id);
      expect(read.readyDate).toBe(next);
      expect(read.previousReadyDate).toBe(original);
      expect(read.timeline.map((e: { type: string }) => e.type)).toContain(
        'DATE_MOVED',
      );
      // No answer from the buyer keeps the order.
      expect(read.status).toBe('AWAITING_DEPOSIT');

      const pub = await request(server)
        .get(`/market/listings/${listing.id}`)
        .expect(200);
      expect(pub.body).toMatchObject({
        readyDate: next,
        previousReadyDate: original,
      });
    });

    it('n’annonce pas de changement à qui commande après', async () => {
      const listing = await newListing();
      await move(listing.id, dayOffset(21)).expect(201);
      const id = await ask(listing.id);
      const read = await buyerRead(id);
      expect(read.previousReadyDate).toBeNull();
      expect(read.timeline.map((e: { type: string }) => e.type)).not.toContain(
        'DATE_MOVED',
      );
    });

    it('une demande acceptée après le déplacement prend la nouvelle date', async () => {
      const listing = await newListing();
      const id = await ask(listing.id);
      const next = dayOffset(21);
      await move(listing.id, next).expect(201);
      const accepted = await request(server)
        .post(`/farms/${farmId}/market/orders/${id}/accept`)
        .set(owner())
        .expect(201);
      expect((await orderOf(accepted.body.orderId)).expectedDate).toBe(next);
    });

    it('ne touche pas les commandes livrées ou annulées', async () => {
      const listing = await newListing({ depositPct: undefined });
      const [a, b] = [await ask(listing.id), await ask(listing.id)];
      const acceptOne = async (id: string) =>
        (
          await request(server)
            .post(`/farms/${farmId}/market/orders/${id}/accept`)
            .set(owner())
            .expect(201)
        ).body.orderId as string;
      const delivered = await acceptOne(a);
      const cancelled = await acceptOne(b);
      await request(server)
        .post(`/farms/${farmId}/orders/${delivered}/livrer`)
        .set(owner())
        .send({})
        .expect(201);
      await cancel(b).expect(201);

      await move(listing.id, dayOffset(21)).expect(201);
      expect((await orderOf(delivered)).expectedDate).toBe(dayOffset(14));
      expect((await orderOf(cancelled)).expectedDate).toBe(dayOffset(14));
      expect((await buyerRead(a)).previousReadyDate).toBeNull();
    });

    it('après un déplacement, l’acheteur peut annuler selon les mêmes règles', async () => {
      const { id, listing } = await acceptedOrder();
      await move(listing.id, dayOffset(21)).expect(201);
      const res = await cancel(id).expect(201);
      expect(res.body.status).toBe('CANCELLED');
    });

    it.each([
      ['aujourd’hui', 0],
      ['le passé', -3],
    ])('refuse %s', async (_label, days) => {
      const listing = await newListing();
      await move(listing.id, dayOffset(days)).expect(400);
    });

    it('refuse la même date, une vente immédiate et un brouillon', async () => {
      const pre = await newListing();
      await move(pre.id, dayOffset(14)).expect(400);

      const now = await newListing({
        kind: 'NOW',
        readyDate: undefined,
        depositPct: undefined,
      });
      await move(now.id, dayOffset(21)).expect(400);

      const draft = await request(server)
        .post(`/farms/${farmId}/market/listings`)
        .set(owner())
        .send({
          kind: 'PRE',
          product: 'BIRDS',
          batchId: pre.batchId,
          unitPriceFcfa: 3000,
          quantityPublished: 1,
          readyDate: dayOffset(14),
        })
        .expect(201);
      await move(draft.body.id, dayOffset(21)).expect(400);
    });

    it('refuse une date encore dans un délai d’attente', async () => {
      const listing = await newListing({ readyDate: dayOffset(20) });
      await request(server)
        .post(`/farms/${farmId}/batches/${listing.batchId}/treatments`)
        .set(owner())
        .send({
          careType: 'ANTIBIOTIQUE',
          productName: 'Amoxicilline',
          withdrawalDays: 10,
          reason: 'Infection respiratoire',
          animalCount: 10,
        })
        .expect(201);
      const res = await move(listing.id, dayOffset(5)).expect(400);
      expect(res.body.message).toMatch(/Délai d’attente/);
      await move(listing.id, dayOffset(25)).expect(201);
    });

    it('est réservé à qui gère les annonces de cette ferme', async () => {
      const listing = await newListing();
      await request(server)
        .post(`/farms/${farmId}/market/listings/${listing.id}/move-date`)
        .set(buyer())
        .send({ readyDate: dayOffset(21) })
        .expect(403);
      const other = await createProgrammeFarm(server, adminToken, {
        exploitantName: 'Autre',
      });
      await request(server)
        .post(`/farms/${other.farmId}/market/listings/${listing.id}/move-date`)
        .set(auth(other.ownerToken))
        .send({ readyDate: dayOffset(21) })
        .expect(404);
    });
  });
});
