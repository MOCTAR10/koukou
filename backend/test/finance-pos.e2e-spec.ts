import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  uniquePhone,
} from './helpers/programme-farm.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('Module 4 — POS ferme (régression & gardes manquantes, e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let farmId: string;
  let batchId: string;
  let feedLotId: string;
  let salePartialId: string;
  let saleRefundId: string;

  function post(url: string, body: object, auth = token) {
    return request(server)
      .post(url)
      .set('Authorization', `Bearer ${auth}`)
      .send(body);
  }

  function get(url: string, auth = token) {
    return request(server).get(url).set('Authorization', `Bearer ${auth}`);
  }

  function del(url: string, auth = token) {
    return request(server).delete(url).set('Authorization', `Bearer ${auth}`);
  }

  function openCaisse(balance = 0) {
    return post('/farms/' + farmId + '/caisse/open', {
      openingBalanceFcfa: balance,
    });
  }

  async function closeCaisse() {
    const current = await get('/farms/' + farmId + '/caisse/current');
    const declared = current.body?.expectedBalanceFcfa ?? 0;
    return post('/farms/' + farmId + '/caisse/close', {
      declaredBalanceFcfa: declared,
    });
  }

  async function createPoultrySale(
    quantity: number,
    unitPriceFcfa: number,
    payments: any[],
  ) {
    return post('/farms/' + farmId + '/sales', {
      customerName: 'Client comptoir test',
      items: [
        {
          productType: 'POULET_PIECE',
          quantity,
          unit: 'PIECE',
          unitPriceFcfa,
          batchId,
        },
      ],
      payments,
    });
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

    const admin = await createPlatformAdmin(server, app.get(DataSource));
    const farm = await createProgrammeFarm(server, admin.token, {
      name: `Ferme POS ${uniquePhone('')}`,
      exploitantName: 'Proprio POS',
    });
    token = farm.ownerToken;
    farmId = farm.farmId;

    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Lot POS',
        integrationDate: today(),
        quantityAtStart: 300,
        type: 'CHAIR',
        couvoirSupplier: 'Canabec',
        chickLotNumber: `CP-${Date.now()}`,
        hatchDate: today(),
      })
      .expect(201);
    batchId = batch.body.id;

    const feed = await request(server)
      .post(`/farms/${farmId}/inputs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'ALIMENT',
        foodType: 'DEMARRAGE',
        productName: 'Provende POS',
        supplier: 'FeedCo',
        supplierLotNumber: `FP-${Date.now()}`,
        quantity: 10,
        unit: 'SAC',
      })
      .expect(201);
    feedLotId = feed.body.id;

    await openCaisse().expect(201);
  }, 60_000);

  it('méthodes désactivées : MOBILE_MONEY et QR_CODE refusés (400 « arrive bientôt »)', async () => {
    for (const method of ['MOBILE_MONEY', 'QR_CODE']) {
      const res = await createPoultrySale(1, 5000, [
        { method, amountFcfa: 5000 },
      ]);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('arrive bientôt');
    }
  });

  it('sur-paiement à la création de vente → 400', async () => {
    const res = await createPoultrySale(1, 3000, [
      { method: 'CASH', amountFcfa: 5000 },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('dépasse le solde');
  });

  it('sur-paiement sur encaissement complémentaire → 400', async () => {
    const created = await createPoultrySale(1, 10000, [
      { method: 'CASH', amountFcfa: 4000 },
    ]);
    expect(created.status).toBe(201);
    expect(created.body.sale.status).toBe('OUTSTANDING');
    salePartialId = created.body.sale.id;

    const res = await post(`/farms/${farmId}/sales/${salePartialId}/payments`, {
      method: 'CASH',
      amountFcfa: 7000,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('dépasse le solde');
  });

  it('vente de provende sans lot d’intrant → 400 (traçabilité HACCP)', async () => {
    const res = await post('/farms/' + farmId + '/sales', {
      items: [
        {
          productType: 'PROVENDE',
          quantity: 1,
          unit: 'SAC',
          unitPriceFcfa: 15000,
        },
      ],
      payments: [{ method: 'CASH', amountFcfa: 15000 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('inputLotId');
    expect(feedLotId.length).toBeGreaterThan(0);
  });

  it('poulet à la pièce : quantité fractionnaire → 400 (cohérence prix/stock)', async () => {
    const res = await createPoultrySale(1.5, 5000, [
      { method: 'CASH', amountFcfa: 5000 },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('entier');
  });

  it('annulation d’une vente encaissée sans session de caisse ouverte → 400 (remboursement traçable)', async () => {
    const closed = await closeCaisse();
    expect(closed.status).toBe(201);

    const res = await del(`/farms/${farmId}/sales/${salePartialId}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('session de caisse');
  });

  it('annulation d’une vente encaissée avec solde de caisse insuffisant → 400 (jamais négative)', async () => {
    await openCaisse().expect(201);

    const res = await del(`/farms/${farmId}/sales/${salePartialId}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('disponible');
  });

  it('annulation réussie : remboursement tracé en caisse (REFUND) + cheptel réintégré', async () => {
    const aliveBefore = await get(`/farms/${farmId}/batches/${batchId}`);
    const aliveBeforeCount = aliveBefore.body.quantityAlive;

    const created = await createPoultrySale(1, 5000, [
      { method: 'CASH', amountFcfa: 5000 },
    ]);
    expect(created.status).toBe(201);
    saleRefundId = created.body.sale.id;

    const cancelled = await del(`/farms/${farmId}/sales/${saleRefundId}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('CANCELLED');

    const payments = await get(
      `/farms/${farmId}/payments?saleId=${saleRefundId}`,
    );
    expect(payments.body).toHaveLength(1);
    expect(payments.body[0].status).toBe('REFUNDED');

    const current = await get('/farms/' + farmId + '/caisse/current');
    const sources = current.body.movements.map((m: any) => m.source);
    const inSum = current.body.movements
      .filter((m: any) => m.type === 'IN')
      .reduce((a: number, b: any) => a + b.amountFcfa, 0);
    const outSum = current.body.movements
      .filter((m: any) => m.type === 'OUT')
      .reduce((a: number, b: any) => a + b.amountFcfa, 0);
    expect(sources).toContain('SALE_PAYMENT');
    expect(sources).toContain('REFUND');
    expect(inSum).toBe(5000);
    expect(outSum).toBe(5000);
    expect(current.body.expectedBalanceFcfa).toBe(0);

    const after = await get(`/farms/${farmId}/batches/${batchId}`);
    expect(after.body.quantityAlive).toBe(aliveBeforeCount);
  });

  it('annulation d’une vente sans encaissement : autorisée même session close', async () => {
    const created = await createPoultrySale(1, 2000, []);
    expect(created.status).toBe(201);
    expect(created.body.sale.status).toBe('OUTSTANDING');

    const closed = await closeCaisse();
    expect(closed.status).toBe(201);

    const res = await del(`/farms/${farmId}/sales/${created.body.sale.id}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('double ouverture de caisse → 400', async () => {
    await openCaisse().expect(201);
    const res = await openCaisse();
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('déjà ouverte');
  });

  it('un Éleveur ne peut pas ouvrir la caisse (403), mais consulte la session ouverte (200)', async () => {
    const empPhone = uniquePhone();
    await post('/farms/' + farmId + '/eleveurs', {
      phone: empPhone,
      fullName: 'Éleveur POS',
      code: 'secret123',
    }).expect(201);
    const empToken = await login(server, empPhone, 'secret123');

    const res403 = await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({ openingBalanceFcfa: 0 });
    expect(res403.status).toBe(403);

    const current = await get('/farms/' + farmId + '/caisse/current', empToken);
    expect(current.status).toBe(200);
  });

  it('encaissement sur une vente annulée → 400', async () => {
    const res = await post(`/farms/${farmId}/sales/${saleRefundId}/payments`, {
      method: 'CASH',
      amountFcfa: 5000,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('annulée');
  });

  it('reçu d’une vente non réglée (OUTSTANDING) → PDF ; reçu d’une vente annulée → 400', async () => {
    const outstanding = await get(
      `/farms/${farmId}/sales/${salePartialId}/receipt`,
    );
    expect(outstanding.status).toBe(200);
    expect(outstanding.headers['content-type']).toContain('application/pdf');
    expect(outstanding.body.length).toBeGreaterThan(1000);

    const cancelled = await get(
      `/farms/${farmId}/sales/${saleRefundId}/receipt`,
    );
    expect(cancelled.status).toBe(400);
    expect(cancelled.body.message).toContain('annulée');
  });

  it('historique des paiements : filtres saleId et période', async () => {
    const bySale = await get(
      `/farms/${farmId}/payments?saleId=${salePartialId}`,
    );
    expect(bySale.status).toBe(200);
    expect(bySale.body).toHaveLength(1);
    expect(bySale.body[0].amountFcfa).toBe(4000);

    const byPeriod = await get(
      `/farms/${farmId}/payments?from=${today()}&to=${today()}`,
    );
    expect(byPeriod.status).toBe(200);
    expect(byPeriod.body.length).toBeGreaterThanOrEqual(2);
  });

  afterAll(async () => {
    await app.close();
  });
});
