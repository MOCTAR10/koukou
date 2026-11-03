import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { CustomerType } from './../src/common/enums/customer-type.enum.js';
import { OrderCanal } from './../src/common/enums/order-canal.enum.js';
import { OrderSource } from './../src/common/enums/order-source.enum.js';
import { SaleItemProductType } from './../src/common/enums/sale-item-type.enum.js';
import { UserRole } from './../src/common/enums/role.enum.js';
import { AccountingService } from './../src/modules/accounting/accounting.service.js';
import { Farm } from './../src/modules/farms/entities/farm.entity.js';
import { RentabiliteService } from './../src/modules/finance/rentabilite.service.js';
import { CreateOrderDto } from './../src/modules/orders/dto/order.dto.js';
import { Order } from './../src/modules/orders/entities/order.entity.js';
import {
  BuyerCancelOutcome,
  OrderCreationExtras,
  OrdersService,
} from './../src/modules/orders/orders.service.js';

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

/** What the Market needs from orders: internal paths with no route of their own. */
describe('Commandes : socle du Market (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let orders: OrdersService;
  let dataSource: DataSource;
  let token: string;
  let ownerId: string;
  let farm: Farm;
  let batchId: string;
  let phoneSeq = 0;

  const nextPhone = () => `+24174${String(Date.now()).slice(-6)}${phoneSeq++}`;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  const birdsDto = (quantity: number, over: Partial<CreateOrderDto> = {}) =>
    ({
      canal: OrderCanal.PRECOMMANDE,
      customerPhone: nextPhone(),
      customerName: 'Hôtel du Port',
      items: [
        {
          productType: SaleItemProductType.POULET_PIECE,
          quantity,
          unitPriceFcfa: 3000,
          batchId,
        },
      ],
      ...over,
    }) as CreateOrderDto;

  const createMarketOrder = (
    dto: CreateOrderDto,
    extras: OrderCreationExtras = { source: OrderSource.MARKET },
  ) =>
    dataSource.transaction((em) =>
      orders.createWithin(em, { id: ownerId, role: UserRole.PROPRIETAIRE }, farm, dto, extras),
    );

  const cashBalance = async () => {
    const res = await request(server)
      .get(`/farms/${farm.id}/caisse/current`)
      .set(auth())
      .expect(200);
    return res.body.expectedBalanceFcfa as number;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    orders = app.get(OrdersService);
    dataSource = app.get(DataSource);

    const phone = `+24175${Date.now()}`;
    const reg = await request(server)
      .post('/auth/register')
      .send({ phone, fullName: 'Proprio Socle', code: 'secret123' })
      .expect(201);
    const login = await request(server)
      .post('/auth/login')
      .send({ phone, code: 'secret123' })
      .expect(201);
    token = login.body.accessToken;
    ownerId = reg.body.user?.id ?? login.body.user.id;

    const created = await request(server)
      .post('/farms')
      .set(auth())
      .send({
        name: `Ferme Socle ${Date.now()}`,
        administrativeCity: 'Libreville',
        capacityPerBuilding: 1000,
      })
      .expect(201);
    farm = await dataSource.getRepository(Farm).findOneByOrFail({ id: created.body.id });

    const batch = await request(server)
      .post(`/farms/${farm.id}/batches`)
      .set(auth())
      .send({
        batchName: 'Lot Socle',
        integrationDate: daysAgo(45),
        quantityAtStart: 100,
        type: 'CHAIR',
      })
      .expect(201);
    batchId = batch.body.id;

    await request(server)
      .post(`/farms/${farm.id}/caisse/open`)
      .set(auth())
      .send({ openingBalanceFcfa: 10000 })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('createWithin', () => {
    it('crée une commande sans acompte, réservée, marquée Market', async () => {
      const order = await createMarketOrder(birdsDto(5), {
        source: OrderSource.MARKET,
        customerType: CustomerType.HOTEL,
      });
      expect(order.status).toBe('PENDING');
      expect(order.source).toBe('MARKET');
      expect(order.depositFcfa).toBe(0);

      const customer = await request(server)
        .get(`/farms/${farm.id}/customers/${order.customerId}`)
        .set(auth())
        .expect(200);
      expect(customer.body.type).toBe('HOTEL');

      // The reservation counts against what a later order can take.
      await request(server)
        .post(`/farms/${farm.id}/orders`)
        .set(auth())
        .send({
          canal: 'FERME',
          items: [
            {
              productType: 'POULET_PIECE',
              quantity: 96,
              unitPriceFcfa: 3000,
              batchId,
            },
          ],
        })
        .expect(400);

      expect(
        await orders.cancelForBuyer(farm.id, order.id, 'nettoyage'),
      ).toBe(BuyerCancelOutcome.CANCELLED);
    });

    it('ne change pas le type d’un client qui existe déjà', async () => {
      const phone = nextPhone();
      const customer = await request(server)
        .post(`/farms/${farm.id}/customers`)
        .set(auth())
        .send({ fullName: 'Client Existant', phone })
        .expect(201);
      const order = await createMarketOrder(birdsDto(1, { customerPhone: phone }), {
        customerType: CustomerType.HOTEL,
      });
      expect(order.customerId).toBe(customer.body.id);
      const after = await request(server)
        .get(`/farms/${farm.id}/customers/${customer.body.id}`)
        .set(auth())
        .expect(200);
      expect(after.body.type).toBe('PARTICULIER');
      await orders.cancelForBuyer(farm.id, order.id, 'nettoyage');
    });

    it('ne laisse rien si la transaction appelante échoue', async () => {
      const key = `rollback-${Date.now()}`;
      await expect(
        dataSource.transaction(async (em) => {
          await orders.createWithin(
            em,
            { id: ownerId, role: UserRole.PROPRIETAIRE },
            farm,
            birdsDto(1, { idempotencyKey: key }),
          );
          throw new Error('échec après création');
        }),
      ).rejects.toThrow('échec après création');
      const left = await dataSource
        .getRepository(Order)
        .findOneBy({ farmId: farm.id, idempotencyKey: key });
      expect(left).toBeNull();
    });

    it('refuse une ferme suspendue et une liste vide', async () => {
      await expect(
        dataSource.transaction((em) =>
          orders.createWithin(
            em,
            { id: ownerId, role: UserRole.PROPRIETAIRE },
            { ...farm, active: false } as Farm,
            birdsDto(1),
          ),
        ),
      ).rejects.toThrow(/suspendue/);
      await expect(
        createMarketOrder(birdsDto(1, { items: [] })),
      ).rejects.toThrow(/article/);
    });

    it('refuse des frais de livraison invalides', async () => {
      await expect(
        createMarketOrder(birdsDto(1), { deliveryFeeFcfa: -100 }),
      ).rejects.toThrow(/livraison/);
      await expect(
        createMarketOrder(birdsDto(1), { deliveryFeeFcfa: 10.5 }),
      ).rejects.toThrow(/livraison/);
    });
  });

  describe('frais de livraison', () => {
    it('comptent au total et en comptabilité, jamais au revenu du lot', async () => {
      const before = await app
        .get(RentabiliteService)
        .computeBatchPnl(farm.id, batchId);

      const order = await createMarketOrder(
        birdsDto(2, { address: 'Quartier Louis, Libreville' }),
        { source: OrderSource.MARKET, deliveryFeeFcfa: 2000 },
      );
      expect(order.totalAmountFcfa).toBe(8000);
      const fee = order.items.find((i) => i.productType === 'AUTRE');
      expect(fee).toMatchObject({
        label: 'Frais de livraison',
        amountFcfa: 2000,
        batchId: null,
      });
      expect(order.address).toBe('Quartier Louis, Libreville');

      // Delivering fewer birds keeps the fee and recomputes the total.
      const read = await request(server)
        .get(`/farms/${farm.id}/orders/${order.id}`)
        .set(auth())
        .expect(200);
      const birdLine = read.body.items.find(
        (i: { productType: string }) => i.productType === 'POULET_PIECE',
      );
      const delivered = await request(server)
        .post(`/farms/${farm.id}/orders/${order.id}/livrer`)
        .set(auth())
        .send({
          items: [{ saleItemId: birdLine.saleItemId, quantity: 1 }],
          payment: { amountFcfa: 5000 },
        });
      expect(delivered.status).toBe(201);
      expect(delivered.body.status).toBe('LIVRE');
      expect(delivered.body.totalAmountFcfa).toBe(5000);
      expect(delivered.body.sale.status).toBe('SETTLED');

      const revenue = await dataSource.transaction((em) =>
        app.get(AccountingService).netSaleRevenue(em, farm.id, order.saleId),
      );
      expect(revenue).toBe(5000);

      const after = await app
        .get(RentabiliteService)
        .computeBatchPnl(farm.id, batchId);
      expect(after.revenueFcfa - before.revenueFcfa).toBe(3000);
    });
  });

  describe('adresse', () => {
    it('garde l’adresse d’une précommande livrée, via l’API aussi', async () => {
      const res = await request(server)
        .post(`/farms/${farm.id}/orders`)
        .set(auth())
        .send({
          canal: 'PRECOMMANDE',
          address: 'Akanda',
          province: 'Estuaire',
          latitude: 0.5,
          longitude: 9.4,
          items: [
            { productType: 'POULET_PIECE', quantity: 1, unitPriceFcfa: 3000, batchId },
          ],
        })
        .expect(201);
      expect(res.body).toMatchObject({
        address: 'Akanda',
        deliveryProvince: 'Estuaire',
        latitude: 0.5,
        longitude: 9.4,
      });
      await orders.cancelForBuyer(farm.id, res.body.id, 'nettoyage');
    });

    it('ignore des coordonnées sans adresse (retrait) et une adresse à la ferme', async () => {
      const pickup = await request(server)
        .post(`/farms/${farm.id}/orders`)
        .set(auth())
        .send({
          canal: 'PRECOMMANDE',
          latitude: 0.5,
          longitude: 9.4,
          items: [
            { productType: 'POULET_PIECE', quantity: 1, unitPriceFcfa: 3000, batchId },
          ],
        })
        .expect(201);
      expect(pickup.body.latitude).toBeNull();

      const atFarm = await request(server)
        .post(`/farms/${farm.id}/orders`)
        .set(auth())
        .send({
          canal: 'FERME',
          address: 'Akanda',
          items: [
            { productType: 'POULET_PIECE', quantity: 1, unitPriceFcfa: 3000, batchId },
          ],
        })
        .expect(201);
      expect(atFarm.body.address).toBeNull();

      await orders.cancelForBuyer(farm.id, pickup.body.id, 'nettoyage');
      await orders.cancelForBuyer(farm.id, atFarm.body.id, 'nettoyage');
    });
  });

  describe('API publique', () => {
    it('ne peut ni marquer une commande Market ni ajouter des frais', async () => {
      const res = await request(server)
        .post(`/farms/${farm.id}/orders`)
        .set(auth())
        .send({
          canal: 'FERME',
          source: 'MARKET',
          deliveryFeeFcfa: 5000,
          items: [
            { productType: 'POULET_PIECE', quantity: 1, unitPriceFcfa: 3000, batchId },
          ],
        })
        .expect(201);
      expect(res.body.source).toBeNull();
      expect(res.body.totalAmountFcfa).toBe(3000);
      await orders.cancelForBuyer(farm.id, res.body.id, 'nettoyage');
    });

    it('refuse toujours une ligne AUTRE', async () => {
      await request(server)
        .post(`/farms/${farm.id}/orders`)
        .set(auth())
        .send({
          canal: 'FERME',
          items: [{ productType: 'AUTRE', quantity: 1, unitPriceFcfa: 3000 }],
        })
        .expect(400);
    });
  });

  describe('cancelForBuyer', () => {
    it('annule une commande impayée sans toucher la caisse et libère les oiseaux', async () => {
      const balance = await cashBalance();
      const order = await createMarketOrder(birdsDto(90));
      await expect(
        createMarketOrder(birdsDto(90)),
      ).rejects.toThrow();

      expect(
        await orders.cancelForBuyer(farm.id, order.id, 'Annulée par l’acheteur'),
      ).toBe(BuyerCancelOutcome.CANCELLED);

      const read = await request(server)
        .get(`/farms/${farm.id}/orders/${order.id}`)
        .set(auth())
        .expect(200);
      expect(read.body.status).toBe('CANCELLED');
      expect(read.body.cancelledReason).toBe('Annulée par l’acheteur');
      expect(read.body.sale.status).toBe('CANCELLED');
      expect(await cashBalance()).toBe(balance);

      const again = await createMarketOrder(birdsDto(90));
      await orders.cancelForBuyer(farm.id, again.id, 'nettoyage');
    });

    it('fonctionne sans caisse ouverte quand rien n’a été payé', async () => {
      const order = await createMarketOrder(birdsDto(1));
      await request(server)
        .post(`/farms/${farm.id}/caisse/close`)
        .set(auth())
        .send({ declaredBalanceFcfa: await cashBalance() })
        .expect((r) => expect(r.status).toBeLessThan(300));
      expect(await orders.cancelForBuyer(farm.id, order.id, 'délai dépassé')).toBe(
        BuyerCancelOutcome.CANCELLED,
      );
      await request(server)
        .post(`/farms/${farm.id}/caisse/open`)
        .set(auth())
        .send({ openingBalanceFcfa: 10000 })
        .expect(201);
    });

    it('laisse à la ferme une commande avec acompte', async () => {
      const order = await createMarketOrder(birdsDto(1));
      await request(server)
        .post(`/farms/${farm.id}/orders/${order.id}/deposit`)
        .set(auth())
        .send({ amountFcfa: 1000 })
        .expect(201);
      const balance = await cashBalance();

      expect(await orders.cancelForBuyer(farm.id, order.id, 'x')).toBe(
        BuyerCancelOutcome.HAS_PAYMENT,
      );
      const read = await request(server)
        .get(`/farms/${farm.id}/orders/${order.id}`)
        .set(auth())
        .expect(200);
      expect(read.body.status).toBe('CONFIRMED');
      expect(read.body.depositFcfa).toBe(1000);
      expect(await cashBalance()).toBe(balance);

      await request(server)
        .delete(`/farms/${farm.id}/orders/${order.id}`)
        .set(auth())
        .query({ reason: 'remboursé' })
        .expect(200);
      expect(await cashBalance()).toBe(balance - 1000);
    });

    it('un acompte enregistré au même moment n’est jamais annulé en silence', async () => {
      for (let round = 0; round < 3; round++) {
        const order = await createMarketOrder(birdsDto(1));
        const [deposit, outcome] = await Promise.all([
          request(server)
            .post(`/farms/${farm.id}/orders/${order.id}/deposit`)
            .set(auth())
            .send({ amountFcfa: 1000 }),
          orders.cancelForBuyer(farm.id, order.id, 'délai dépassé'),
        ]);
        const read = await request(server)
          .get(`/farms/${farm.id}/orders/${order.id}`)
          .set(auth())
          .expect(200);
        if (outcome === BuyerCancelOutcome.CANCELLED) {
          expect(deposit.status).toBe(400);
          expect(read.body.status).toBe('CANCELLED');
          expect(read.body.depositFcfa).toBe(0);
        } else {
          expect(outcome).toBe(BuyerCancelOutcome.HAS_PAYMENT);
          expect(deposit.status).toBe(201);
          expect(read.body.status).toBe('CONFIRMED');
          await request(server)
            .delete(`/farms/${farm.id}/orders/${order.id}`)
            .set(auth())
            .expect(200);
        }
      }
    });

    it('répond sans erreur si la commande est annulée, livrée ou inconnue', async () => {
      const cancelled = await createMarketOrder(birdsDto(1));
      await orders.cancelForBuyer(farm.id, cancelled.id, 'x');
      expect(await orders.cancelForBuyer(farm.id, cancelled.id, 'x')).toBe(
        BuyerCancelOutcome.ALREADY_CANCELLED,
      );

      const delivered = await createMarketOrder(birdsDto(1));
      await request(server)
        .post(`/farms/${farm.id}/orders/${delivered.id}/livrer`)
        .set(auth())
        .send({})
        .expect(201);
      expect(await orders.cancelForBuyer(farm.id, delivered.id, 'x')).toBe(
        BuyerCancelOutcome.DELIVERED,
      );

      expect(
        await orders.cancelForBuyer(
          '00000000-0000-4000-8000-000000000000',
          cancelled.id,
          'x',
        ),
      ).toBe(BuyerCancelOutcome.NOT_FOUND);
    });
  });
});
