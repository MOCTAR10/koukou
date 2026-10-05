import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

describe('Module précommandes & bons de commande (orders, e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let otherToken: string;
  let farmId: string;
  let batchId: string;
  let orderId: string;
  let secondOrderId: string;
  let customerId: string;

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

    const phone = `+24192${Date.now()}`;
    await request(server)
      .post('/auth/register')
      .send({
        phone,
        fullName: 'Proprio Commandes',
        code: 'secret123',
      })
      .expect(201);
    const login = await request(server)
      .post('/auth/login')
      .send({ phone, code: 'secret123' })
      .expect(201);
    token = login.body.accessToken;

    const farm = await request(server)
      .post('/farms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Ferme Commandes ${Date.now()}`,
        administrativeCity: 'Libreville',
        capacityPerBuilding: 1000,
      })
      .expect(201);
    farmId = farm.body.id;

    const otherPhone = `+24193${Date.now()}`;
    await request(server)
      .post('/auth/register')
      .send({
        phone: otherPhone,
        fullName: 'Autre Proprio',
        code: 'secret123',
      })
      .expect(201);
    const otherLogin = await request(server)
      .post('/auth/login')
      .send({ phone: otherPhone, code: 'secret123' })
      .expect(201);
    otherToken = otherLogin.body.accessToken;

    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Lot prêt à vendre',
        integrationDate: daysAgo(45),
        quantityAtStart: 300,
        type: 'CHAIR',
        couvoirSupplier: 'Canabec',
        chickLotNumber: `CL-${Date.now()}`,
        hatchDate: today(),
      })
      .expect(201);
    batchId = batch.body.id;

    await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set('Authorization', `Bearer ${token}`)
      .send({ openingBalanceFcfa: 10000 })
      .expect(201);

    const cust = await request(server)
      .post(`/farms/${farmId}/customers`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Mme Test',
        phone: '+241710012345',
      })
      .expect(201);
    customerId = cust.body.id;
  });

  it('lot jeune : la précommande est acceptée (conseil non bloquant) avec passeport TOO_YOUNG', async () => {
    const jeune = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Lot trop jeune',
        integrationDate: today(),
        quantityAtStart: 100,
        type: 'CHAIR',
      })
      .expect(201);

    const res = await request(server)
      .post(`/farms/${farmId}/orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        canal: 'PRECOMMANDE',
        expectedDate: today(),
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 5,
            unit: 'PIECE',
            unitPriceFcfa: 3500,
            batchId: jeune.body.id,
          },
        ],
      })
      .expect(201);

    // L'éleveur est libre de vendre : pas de blocage, mais le passeport
    // figé au bon de commande expose l'auto-signal (conseil).
    expect(res.body.status).toBe('PENDING');
    expect(res.body.passport).toBeDefined();
    expect(res.body.passport.batchId).toBe(jeune.body.id);
    expect(res.body.passport.readiness.readyForSale).toBe(false);
    expect(res.body.passport.readiness.readyReason).toBe('TOO_YOUNG');
    expect(res.body.passport.metrics.length).toBeGreaterThan(0);
    expect(res.body.passport.generatedAt).toBe(today());
  });

  it('création : bon CMD, vente enveloppée OUTSTANDING, cheptel non décrémenté', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        canal: 'FERME',
        expectedDate: today(),
        customerId,
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 10,
            unit: 'PIECE',
            unitPriceFcfa: 3500,
            batchId,
          },
        ],
      })
      .expect(201);
    expect(res.body.referenceNumber).toMatch(/^CMD-\d{8}-\d{6}$/);
    expect(res.body.canal).toBe('FERME');
    expect(res.body.status).toBe('PENDING');
    expect(res.body.totalAmountFcfa).toBe(35000);
    expect(res.body.depositFcfa).toBe(0);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].batchId).toBe(batchId);
    expect(res.body.passport).toBeDefined();
    expect(res.body.passport.batchId).toBe(batchId);
    expect(res.body.passport.readiness.readyReason).toBe('READY');
    expect(res.body.passport.readiness.readyForSale).toBe(true);
    expect(res.body.sale).toBeDefined();
    expect(res.body.sale.status).toBe('OUTSTANDING');
    expect(res.body.sale.totalAmountFcfa).toBe(35000);
    orderId = res.body.id;

    const batch = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(batch.body.quantityAlive).toBe(300);
  });

  it('acompte sans caisse ouverte → 400', async () => {
    await request(server)
      .post(`/farms/${farmId}/caisse/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ declaredBalanceFcfa: 10000 })
      .expect(201);
    await request(server)
      .post(`/farms/${farmId}/orders/${orderId}/deposit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'CASH', amountFcfa: 10000 })
      .expect(400);
    await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set('Authorization', `Bearer ${token}`)
      .send({ openingBalanceFcfa: 10000 })
      .expect(201);
  });

  it('acompte : commande CONFIRMED, acompte tracé, vente reste OUTSTANDING', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/orders/${orderId}/deposit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'CASH', amountFcfa: 10000 })
      .expect(201);
    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body.depositFcfa).toBe(10000);
  });

  it('réservation : deux commandes ouvertes plafonnent le cheptel', async () => {
    const ok = await request(server)
      .post(`/farms/${farmId}/orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        canal: 'PRECOMMANDE',
        expectedDate: today(),
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 40,
            unit: 'PIECE',
            unitPriceFcfa: 3200,
            batchId,
          },
        ],
      })
      .expect(201);
    secondOrderId = ok.body.id;

    await request(server)
      .post(`/farms/${farmId}/orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        canal: 'PRECOMMANDE',
        expectedDate: today(),
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 260,
            unit: 'PIECE',
            unitPriceFcfa: 3200,
            batchId,
          },
        ],
      })
      .expect(400);
  });

  it('livraison : décrémente le cheptel et facture', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/orders/${orderId}/livrer`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    expect(res.body.status).toBe('LIVRE');
    expect(res.body.livredAt).toBeDefined();

    const batch = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(batch.body.quantityAlive).toBe(290);
  });

  it('bon de commande PDF', async () => {
    await request(server)
      .get(`/farms/${farmId}/orders/${orderId}/bon-de-commande`)
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/pdf/)
      .expect(200);
  });

  it('annulation : ne réintègre pas le cheptel', async () => {
    const res = await request(server)
      .delete(`/farms/${farmId}/orders/${secondOrderId}`)
      .query({ reason: 'Client annule' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancelledReason).toBe('Client annule');

    const batch = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(batch.body.quantityAlive).toBe(290);
  });

  it('commande d’œufs sans production → 400 (stock insuffisant)', async () => {
    await request(server)
      .post(`/farms/${farmId}/orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        canal: 'FERME',
        items: [
          {
            productType: 'OEUFS',
            quantity: 5,
            unit: 'ALVEOLES',
            unitPriceFcfa: 3000,
          },
        ],
      })
      .expect(400);
  });

  it('comptoir multi-lots refusé : un seul lot par commande', async () => {
    const autreLot = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Lot prêt aussi',
        integrationDate: daysAgo(45),
        quantityAtStart: 100,
        type: 'CHAIR',
      })
      .expect(201);

    await request(server)
      .post(`/farms/${farmId}/orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        canal: 'FERME',
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 5,
            unit: 'PIECE',
            unitPriceFcfa: 3500,
            batchId,
          },
          {
            productType: 'POULET_PIECE',
            quantity: 5,
            unit: 'PIECE',
            unitPriceFcfa: 3500,
            batchId: autreLot.body.id,
          },
        ],
      })
      .expect(400);
  });

  it('autre ferme : accès refusé (403)', async () => {
    await request(server)
      .post(`/farms/${farmId}/orders`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        canal: 'FERME',
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 1,
            unit: 'PIECE',
            unitPriceFcfa: 3500,
            batchId,
          },
        ],
      })
      .expect(403);
  });
});