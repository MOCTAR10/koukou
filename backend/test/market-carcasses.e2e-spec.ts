import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { UserRole } from './../src/common/enums/role.enum.js';
import { Farm } from './../src/modules/farms/entities/farm.entity.js';
import { RentabiliteService } from './../src/modules/finance/rentabilite.service.js';
import { OrdersService } from './../src/modules/orders/orders.service.js';
import { CreateOrderDto } from './../src/modules/orders/dto/order.dto.js';

function dayOffset(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

describe('Market : carcasses (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let dataSource: DataSource;
  let ownerToken: string;
  let ownerId: string;
  let farmId: string;
  let buyerToken: string;
  let seq = 0;

  const phone = () => `+24170${String(Date.now()).slice(-6)}${seq++}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const owner = () => auth(ownerToken);
  const buyer = () => auth(buyerToken);

  /** A lot of 100 birds, 40 of them slaughtered and processed. */
  const slaughtered = async () => {
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
    const batchId = batch.body.id as string;
    const order = await request(server)
      .post(`/farms/${farmId}/slaughter-orders`)
      .set(owner())
      .send({
        batchId,
        slaughterType: 'ABATTU',
        destination: 'INTERNE',
        plannedDate: dayOffset(0),
        birdCount: 40,
      })
      .expect(201);
    const slaughterId = order.body.id as string;
    await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${slaughterId}/send`)
      .set(owner())
      .send({})
      .expect(201);
    await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${slaughterId}/process`)
      .set(owner())
      .send({})
      .expect(201);
    return { batchId, slaughterId };
  };

  const carcassesLeft = async (slaughterId: string) =>
    (
      await request(server)
        .get(`/farms/${farmId}/slaughter-orders/${slaughterId}`)
        .set(owner())
        .expect(200)
    ).body.carcassesAvailable as number;

  const liveBirds = async (batchId: string) =>
    (
      await request(server)
        .get(`/farms/${farmId}/batches/${batchId}`)
        .set(owner())
        .expect(200)
    ).body.quantityAlive as number;

  const publish = async (slaughterId: string, quantityPublished = 30) => {
    const listing = await request(server)
      .post(`/farms/${farmId}/market/listings`)
      .set(owner())
      .send({
        kind: 'NOW',
        product: 'CARCASS',
        slaughterOrderId: slaughterId,
        unitPriceFcfa: 4000,
        quantityPublished,
      })
      .expect(201);
    await request(server)
      .post(`/farms/${farmId}/market/listings/${listing.body.id}/publish`)
      .set(owner())
      .expect(201);
    return listing.body.id as string;
  };

  const orderAndAccept = async (listingId: string, quantity = 10) => {
    const asked = await request(server)
      .post('/market/orders')
      .set(buyer())
      .send({ listingId, quantity, fulfilment: 'PICKUP' })
      .expect(201);
    const accepted = await request(server)
      .post(`/farms/${farmId}/market/orders/${asked.body.id}/accept`)
      .set(owner())
      .expect(201);
    return { id: asked.body.id as string, orderId: accepted.body.orderId as string };
  };

  const orderOf = async (orderId: string) =>
    (
      await request(server)
        .get(`/farms/${farmId}/orders/${orderId}`)
        .set(owner())
        .expect(200)
    ).body;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    dataSource = app.get(DataSource);

    const reg = await request(server)
      .post('/auth/register')
      .send({ phone: phone(), fullName: 'Proprio Carcasses', code: 'secret123' })
      .expect(201);
    ownerToken = reg.body.accessToken;
    ownerId = reg.body.user.id;
    const farm = await request(server)
      .post('/farms')
      .set(owner())
      .send({ name: `Ferme Carcasses ${Date.now()}`, administrativeCity: 'Mouila' })
      .expect(201);
    farmId = farm.body.id;
    await dataSource.getRepository(Farm).update({ id: farmId }, { isVerified: true });
    await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set(owner())
      .send({ openingBalanceFcfa: 100000 })
      .expect(201);

    const b = await request(server)
      .post('/auth/register-buyer')
      .send({ phone: phone(), fullName: 'Restaurant', code: 'secret123', type: 'RESTAURANT' })
      .expect(201);
    buyerToken = b.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('annonce', () => {
    it('prend son lot dans l’abattage et montre sa fraîcheur', async () => {
      const { slaughterId, batchId } = await slaughtered();
      const id = await publish(slaughterId);
      const read = await request(server)
        .get(`/farms/${farmId}/market/listings/${id}`)
        .set(owner())
        .expect(200);
      expect(read.body.batchId).toBe(batchId);

      const pub = await request(server).get(`/market/listings/${id}`).expect(200);
      expect(pub.body).toMatchObject({ product: 'CARCASS', availableQuantity: 30 });
      expect(pub.body.slaughteredAt).toBeTruthy();
      expect(JSON.stringify(pub.body)).not.toContain(slaughterId);
    });

    it('refuse plus que les carcasses disponibles', async () => {
      const { slaughterId } = await slaughtered();
      const listing = await request(server)
        .post(`/farms/${farmId}/market/listings`)
        .set(owner())
        .send({
          kind: 'NOW',
          product: 'CARCASS',
          slaughterOrderId: slaughterId,
          unitPriceFcfa: 4000,
          quantityPublished: 41,
        })
        .expect(201);
      const res = await request(server)
        .post(`/farms/${farmId}/market/listings/${listing.body.id}/publish`)
        .set(owner())
        .expect(400);
      expect(res.body.message).toMatch(/40 carcasse/);
    });

    it('refuse une précommande, un abattage non traité ou d’une autre ferme', async () => {
      const { slaughterId, batchId } = await slaughtered();
      const body = { product: 'CARCASS', unitPriceFcfa: 4000, quantityPublished: 1 };
      await request(server)
        .post(`/farms/${farmId}/market/listings`)
        .set(owner())
        .send({ ...body, kind: 'PRE', slaughterOrderId: slaughterId, readyDate: dayOffset(5) })
        .expect(400);

      const draft = await request(server)
        .post(`/farms/${farmId}/slaughter-orders`)
        .set(owner())
        .send({
          batchId,
          slaughterType: 'ABATTU',
          destination: 'INTERNE',
          plannedDate: dayOffset(0),
          birdCount: 1,
        })
        .expect(201);
      await request(server)
        .post(`/farms/${farmId}/market/listings`)
        .set(owner())
        .send({ ...body, kind: 'NOW', slaughterOrderId: draft.body.id })
        .expect(400);

      await request(server)
        .post(`/farms/${farmId}/market/listings`)
        .set(owner())
        .send({ ...body, kind: 'NOW', slaughterOrderId: '00000000-0000-4000-8000-000000000000' })
        .expect(404);
      await request(server)
        .post(`/farms/${farmId}/market/listings`)
        .set(owner())
        .send({ ...body, kind: 'NOW' })
        .expect(400);
    });

    it('reste en vente quand le lot se termine et pendant un traitement du lot', async () => {
      const { slaughterId, batchId } = await slaughtered();
      const id = await publish(slaughterId);
      await request(server)
        .post(`/farms/${farmId}/batches/${batchId}/treatments`)
        .set(owner())
        .send({ careType: 'ANTIBIOTIQUE', productName: 'Amoxicilline', withdrawalDays: 10 })
        .expect(201);
      await dataSource.query(
        `UPDATE production_batches SET status = 'FINI', quantity_alive = 0 WHERE id = $1`,
        [batchId],
      );
      await request(server).get(`/market/listings/${id}`).expect(200);
    });
  });

  describe('commande', () => {
    it('prend les carcasses à l’acceptation, sans toucher aux oiseaux vivants', async () => {
      const { slaughterId, batchId } = await slaughtered();
      const id = await publish(slaughterId);
      const alive = await liveBirds(batchId);
      expect(await carcassesLeft(slaughterId)).toBe(40);

      const asked = await request(server)
        .post('/market/orders')
        .set(buyer())
        .send({ listingId: id, quantity: 10, fulfilment: 'PICKUP' })
        .expect(201);
      expect(await carcassesLeft(slaughterId)).toBe(40);

      const accepted = await request(server)
        .post(`/farms/${farmId}/market/orders/${asked.body.id}/accept`)
        .set(owner())
        .expect(201);
      expect(await carcassesLeft(slaughterId)).toBe(30);
      expect(await liveBirds(batchId)).toBe(alive);

      const order = await orderOf(accepted.body.orderId);
      expect(order.items[0]).toMatchObject({
        productType: 'ABATTU_PIECE',
        quantity: 10,
        sourceSlaughterOrderId: slaughterId,
      });

      // Its 60 live birds stay fully free for another order.
      await request(server)
        .post(`/farms/${farmId}/orders`)
        .set(owner())
        .send({
          canal: 'FERME',
          items: [{ productType: 'POULET_PIECE', quantity: alive, unitPriceFcfa: 3000, batchId }],
        })
        .expect(201);
    });

    it('à la livraison : stock inchangé, oiseaux intacts, revenu du lot compté une fois', async () => {
      const { slaughterId, batchId } = await slaughtered();
      const id = await publish(slaughterId);
      const alive = await liveBirds(batchId);
      const pnl = app.get(RentabiliteService);
      const before = await pnl.computeBatchPnl(farmId, batchId);

      const { orderId, id: marketId } = await orderAndAccept(id);
      await request(server)
        .post(`/farms/${farmId}/orders/${orderId}/livrer`)
        .set(owner())
        .send({ payment: { amountFcfa: 40000 } })
        .expect(201);

      expect(await carcassesLeft(slaughterId)).toBe(30);
      expect(await liveBirds(batchId)).toBe(alive);
      const after = await pnl.computeBatchPnl(farmId, batchId);
      expect(after.revenueFcfa - before.revenueFcfa).toBe(40000);

      const read = await request(server)
        .get(`/market/orders/${marketId}`)
        .set(buyer())
        .expect(200);
      expect(read.body.status).toBe('DELIVERED');
    });

    it('livrer moins rend la différence, livrer plus la prend', async () => {
      const { slaughterId } = await slaughtered();
      const id = await publish(slaughterId);

      const less = await orderAndAccept(id);
      const lessLine = (await orderOf(less.orderId)).items[0];
      await request(server)
        .post(`/farms/${farmId}/orders/${less.orderId}/livrer`)
        .set(owner())
        .send({ items: [{ saleItemId: lessLine.saleItemId, quantity: 7 }] })
        .expect(201);
      expect(await carcassesLeft(slaughterId)).toBe(33);

      const more = await orderAndAccept(id);
      const moreLine = (await orderOf(more.orderId)).items[0];
      await request(server)
        .post(`/farms/${farmId}/orders/${more.orderId}/livrer`)
        .set(owner())
        .send({ items: [{ saleItemId: moreLine.saleItemId, quantity: 12 }] })
        .expect(201);
      expect(await carcassesLeft(slaughterId)).toBe(21);
    });

    it('livrer plus que le stock est refusé et ne change rien', async () => {
      const { slaughterId } = await slaughtered();
      const id = await publish(slaughterId);
      const { orderId } = await orderAndAccept(id);
      const line = (await orderOf(orderId)).items[0];
      const res = await request(server)
        .post(`/farms/${farmId}/orders/${orderId}/livrer`)
        .set(owner())
        .send({ items: [{ saleItemId: line.saleItemId, quantity: 41 }] })
        .expect(400);
      expect(res.body.message).toMatch(/Carcasses insuffisantes/);
      expect(await carcassesLeft(slaughterId)).toBe(30);
      expect((await orderOf(orderId)).status).toBe('PENDING');
    });

    it('rend les carcasses si la ferme annule, une seule fois', async () => {
      const { slaughterId } = await slaughtered();
      const id = await publish(slaughterId);
      const { orderId } = await orderAndAccept(id);
      await request(server)
        .delete(`/farms/${farmId}/orders/${orderId}`)
        .set(owner())
        .expect(200);
      expect(await carcassesLeft(slaughterId)).toBe(40);
      await request(server)
        .delete(`/farms/${farmId}/orders/${orderId}`)
        .set(owner())
        .expect(400);
      expect(await carcassesLeft(slaughterId)).toBe(40);
    });

    it('rend les carcasses si l’acheteur annule, une seule fois', async () => {
      const { slaughterId } = await slaughtered();
      const id = await publish(slaughterId);
      const { id: marketId } = await orderAndAccept(id);
      await request(server)
        .post(`/market/orders/${marketId}/cancel`)
        .set(buyer())
        .expect(201);
      expect(await carcassesLeft(slaughterId)).toBe(40);
      await request(server)
        .post(`/market/orders/${marketId}/cancel`)
        .set(buyer())
        .expect(201);
      expect(await carcassesLeft(slaughterId)).toBe(40);
    });

    it('ne survend pas sur deux acceptations simultanées', async () => {
      const { slaughterId } = await slaughtered();
      const id = await publish(slaughterId, 40);
      const ask = () =>
        request(server)
          .post('/market/orders')
          .set(buyer())
          .send({ listingId: id, quantity: 25, fulfilment: 'PICKUP' })
          .expect(201);
      const [a, b] = [await ask(), await ask()];
      const answers = await Promise.all(
        [a, b].map((r) =>
          request(server)
            .post(`/farms/${farmId}/market/orders/${r.body.id}/accept`)
            .set(owner()),
        ),
      );
      expect(answers.map((r) => r.status).sort()).toEqual([201, 400]);
      expect(await carcassesLeft(slaughterId)).toBe(15);
    });

    it('livre malgré un traitement du lot : la carcasse est déjà abattue', async () => {
      const { slaughterId, batchId } = await slaughtered();
      const id = await publish(slaughterId);
      const { orderId } = await orderAndAccept(id);
      await request(server)
        .post(`/farms/${farmId}/batches/${batchId}/treatments`)
        .set(owner())
        .send({ careType: 'ANTIBIOTIQUE', productName: 'Amoxicilline', withdrawalDays: 10 })
        .expect(201);
      await request(server)
        .post(`/farms/${farmId}/orders/${orderId}/livrer`)
        .set(owner())
        .send({})
        .expect(201);
    });

    it('la quantité affichée suit le stock de carcasses', async () => {
      const { slaughterId } = await slaughtered();
      const id = await publish(slaughterId, 40);
      await dataSource.query(
        'UPDATE slaughter_orders SET carcasses_available = 5 WHERE id = $1',
        [slaughterId],
      );
      const pub = await request(server).get(`/market/listings/${id}`).expect(200);
      expect(pub.body.availableQuantity).toBe(5);
    });
  });

  describe('garde-fous de l’API des commandes', () => {
    it('une source envoyée par l’API ne dispense pas de réserver des oiseaux', async () => {
      const { slaughterId, batchId } = await slaughtered();
      const alive = await liveBirds(batchId);
      const res = await request(server)
        .post(`/farms/${farmId}/orders`)
        .set(owner())
        .send({
          canal: 'FERME',
          items: [
            {
              productType: 'POULET_PIECE',
              quantity: alive + 1,
              unitPriceFcfa: 3000,
              batchId,
              sourceSlaughterOrderId: slaughterId,
            },
          ],
        })
        .expect(400);
      expect(res.body.message).toMatch(/Réserve insuffisante/);
      expect(await carcassesLeft(slaughterId)).toBe(40);
    });

    it('refuse toujours une ligne de carcasses par l’API', async () => {
      const { slaughterId, batchId } = await slaughtered();
      await request(server)
        .post(`/farms/${farmId}/orders`)
        .set(owner())
        .send({
          canal: 'FERME',
          items: [
            {
              productType: 'ABATTU_PIECE',
              quantity: 1,
              unitPriceFcfa: 4000,
              batchId,
              sourceSlaughterOrderId: slaughterId,
            },
          ],
        })
        .expect(400);
    });

    it('sans l’option interne, une source est ignorée même en interne', async () => {
      const { slaughterId, batchId } = await slaughtered();
      const farm = await dataSource.getRepository(Farm).findOneByOrFail({ id: farmId });
      const dto = {
        canal: 'FERME',
        items: [
          {
            productType: 'ABATTU_PIECE',
            quantity: 1,
            unitPriceFcfa: 4000,
            batchId,
            sourceSlaughterOrderId: slaughterId,
          },
        ],
      } as CreateOrderDto;
      await expect(
        dataSource.transaction((em) =>
          app
            .get(OrdersService)
            .createWithin(em, { id: ownerId, role: UserRole.PROPRIETAIRE }, farm, dto),
        ),
      ).rejects.toThrow(/volaille sur pied/);
    });
  });
});
