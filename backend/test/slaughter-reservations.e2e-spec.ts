import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Live birds promised to open customer orders (delivered alive) and birds
 * already sent to the abattoir are mutually exclusive commitments.
 */
describe('Abattage / vente POS ↔ réservations de commandes (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let farmId: string;
  let batchId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  function createOrder(quantity: number, phoneSuffix: string) {
    return request(server)
      .post(`/farms/${farmId}/orders`)
      .set(auth())
      .send({
        canal: 'PRECOMMANDE',
        expectedDate: today(),
        customerPhone: `+24177${phoneSuffix}`,
        customerName: `Client ${phoneSuffix}`,
        items: [
          {
            productType: 'POULET_PIECE',
            quantity,
            unit: 'PIECE',
            unitPriceFcfa: 3500,
            batchId,
          },
        ],
      });
  }

  async function createSlaughter(birdCount: number): Promise<string> {
    const res = await request(server)
      .post(`/farms/${farmId}/slaughter-orders`)
      .set(auth())
      .send({
        batchId,
        slaughterType: 'VIVANT',
        destination: 'EXTERNE',
        plannedDate: today(),
        birdCount,
      })
      .expect(201);
    return res.body.id;
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

    const phone = `+24194${Date.now()}`;
    await request(server)
      .post('/auth/register')
      .send({ phone, fullName: 'Proprio Réserve', code: 'secret123' })
      .expect(201);
    const login = await request(server)
      .post('/auth/login')
      .send({ phone, code: 'secret123' })
      .expect(201);
    token = login.body.accessToken;

    const farm = await request(server)
      .post('/farms')
      .set(auth())
      .send({
        name: `Ferme Réserve ${Date.now()}`,
        administrativeCity: 'Libreville',
        capacityPerBuilding: 1000,
      })
      .expect(201);
    farmId = farm.body.id;

    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set(auth())
      .send({
        batchName: 'Lot réservé',
        integrationDate: today(),
        quantityAtStart: 100,
        type: 'CHAIR',
      })
      .expect(201);
    batchId = batch.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  let orderId: string;
  let slaughterId: string;

  it('envoi refusé quand l’abattage entame les oiseaux promis aux commandes', async () => {
    const order = await createOrder(60, `${Date.now()}`.slice(-7)).expect(201);
    orderId = order.body.id;

    const tooMany = await createSlaughter(50);
    const res = await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${tooMany}/send`)
      .set(auth())
      .send({})
      .expect(400);
    expect(res.body.message).toMatch(/réservés par des commandes clients/);
    expect(res.body.message).toContain(order.body.referenceNumber);
    expect(res.body.message).toMatch(/il en reste 40/);
  });

  it('envoi accepté dans la limite des oiseaux libres', async () => {
    slaughterId = await createSlaughter(40);
    await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${slaughterId}/send`)
      .set(auth())
      .send({})
      .expect(201);
  });

  it('nouvelle commande refusée : les oiseaux envoyés à l’abattoir ne sont plus disponibles', async () => {
    const res = await createOrder(1, `${Date.now()}`.slice(-7)).expect(400);
    expect(res.body.message).toMatch(/envoyé\(s\) à l’abattoir/);
  });

  it('traitement refusé si la mortalité après l’envoi entame les oiseaux promis', async () => {
    // 10 deaths after sending: 90 alive − 60 reserved = 30 < 40 sent.
    await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/daily-entries`)
      .set(auth())
      .send({ entryDate: today(), deaths: 10 })
      .expect(201);
    const res = await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${slaughterId}/process`)
      .set(auth())
      .send({})
      .expect(400);
    expect(res.body.message).toMatch(/il en reste 30/);
  });

  it('commande annulée → les oiseaux se libèrent et le traitement passe', async () => {
    await request(server)
      .delete(`/farms/${farmId}/orders/${orderId}`)
      .query({ reason: 'Test réserve' })
      .set(auth())
      .expect(200);
    const processed = await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${slaughterId}/process`)
      .set(auth())
      .send({})
      .expect(201);
    expect(processed.body.status).toBe('PROCESSED');

    const batch = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}`)
      .set(auth())
      .expect(200);
    expect(batch.body.quantityAlive).toBe(50);
  });

  it('deux ordres envoyés ne peuvent pas dépasser le cheptel', async () => {
    // 50 alive, no open order: 30 sent, then 30 more is too many.
    const first = await createSlaughter(30);
    await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${first}/send`)
      .set(auth())
      .send({})
      .expect(201);
    const second = await createSlaughter(30);
    const res = await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${second}/send`)
      .set(auth())
      .send({})
      .expect(400);
    expect(res.body.message).toMatch(/déjà envoyés à l’abattoir/);
    expect(res.body.message).toMatch(/il en reste 20/);
  });

  // ---- Vente directe au POS (même règle) ----
  // State here: 50 alive, no open order, 30 birds SENT to the abattoir.

  function posSale(item: Record<string, unknown>, amountFcfa: number) {
    return request(server)
      .post(`/farms/${farmId}/sales`)
      .set(auth())
      .send({
        items: [{ unitPriceFcfa: 3000, batchId, ...item }],
        payments: [{ method: 'CASH', amountFcfa }],
      });
  }

  it('POS : vente refusée sur les oiseaux envoyés à l’abattoir', async () => {
    await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set(auth())
      .send({ openingBalanceFcfa: 0 })
      .expect(201);
    const res = await posSale(
      { productType: 'POULET_PIECE', quantity: 21, unit: 'PIECE' },
      63000,
    ).expect(400);
    expect(res.body.message).toMatch(/30 envoyé\(s\) à l’abattoir/);
    expect(res.body.message).toMatch(/il en reste 20/);
  });

  it('POS : vente refusée sur les oiseaux promis à une commande', async () => {
    // 50 − 30 at abattoir = 20 free: an order takes 15 of them.
    const order = await createOrder(15, `${Date.now()}`.slice(-7)).expect(201);
    const res = await posSale(
      { productType: 'POULET_PIECE', quantity: 6, unit: 'PIECE' },
      18000,
    ).expect(400);
    expect(res.body.message).toContain(order.body.referenceNumber);
    expect(res.body.message).toMatch(/il en reste 5/);
  });

  it('POS : vente au kilo acceptée dans la limite des oiseaux libres', async () => {
    await posSale(
      { productType: 'POULET_KG', quantity: 10, unit: 'KG', pieceCount: 5 },
      30000,
    ).expect(201);
    const batch = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}`)
      .set(auth())
      .expect(200);
    expect(batch.body.quantityAlive).toBe(45);
  });
});
