import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('Module 5 — Abattage & Traçabilité (+ passeport sanitaire, e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let otherToken: string;
  let farmId: string;
  let batchId: string;
  let internalOrderId: string;
  let externalOrderId: string;

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
        fullName: 'Proprio Abattage',
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
        name: `Ferme Abattage ${Date.now()}`,
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
        batchName: 'Lot abattage',
        integrationDate: today(),
        // 120 (internal, stays SENT) + 180 + later orders: the flock must
        // cover every SENT order, so keep headroom above 300.
        quantityAtStart: 400,
        type: 'CHAIR',
        couvoirSupplier: 'Canabec',
        chickLotNumber: `CL-${Date.now()}`,
        hatchDate: today(),
      })
      .expect(201);
    batchId = batch.body.id;
  });

  it('lot inconnu dans la ferme → 400', async () => {
    await request(server)
      .post(`/farms/${farmId}/slaughter-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId: '00000000-0000-4000-8000-000000000000',
        slaughterType: 'ABATTU',
        destination: 'INTERNE',
        plannedDate: today(),
        birdCount: 100,
      })
      .expect(400);
  });

  it('ordre INTERNE : création avec référence ABT et statut DRAFT', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/slaughter-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId,
        slaughterType: 'ABATTU',
        destination: 'INTERNE',
        plannedDate: today(),
        birdCount: 120,
      })
      .expect(201);
    expect(res.body.referenceNumber).toMatch(/^ABT-\d{8}-\d{6}$/);
    expect(res.body.batchId).toBe(batchId);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.destination).toBe('INTERNE');
    expect(res.body.slaughterType).toBe('ABATTU');
    expect(res.body.birdCount).toBe(120);
    internalOrderId = res.body.id;
  });

  it('envoi INTERNE : status SENT et code de suivi interne généré', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${internalOrderId}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    expect(res.body.status).toBe('SENT');
    expect(res.body.internalBatchCode).toMatch(/^ABT-\d{8}-\d{6}-I$/);
  });

  it('liste et détail des ordres de la ferme', async () => {
    const list = await request(server)
      .get(`/farms/${farmId}/slaughter-orders`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((list.body as any[]).length).toBeGreaterThanOrEqual(1);
    const detail = await request(server)
      .get(`/farms/${farmId}/slaughter-orders/${internalOrderId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.id).toBe(internalOrderId);
  });

  it('ordre EXTERNE : bordereau PDF, saisie manuelle du code abattoir, puis PROCESSED', async () => {
    const created = await request(server)
      .post(`/farms/${farmId}/slaughter-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId,
        slaughterType: 'VIVANT',
        destination: 'EXTERNE',
        plannedDate: today(),
        birdCount: 180,
        totalWeightKg: 540,
      })
      .expect(201);
    externalOrderId = created.body.id;

    const bordereau = await request(server)
      .get(`/farms/${farmId}/slaughter-orders/${externalOrderId}/bordereau`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(bordereau.headers['content-type']).toContain('application/pdf');

    const patched = await request(server)
      .patch(`/farms/${farmId}/slaughter-orders/${externalOrderId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ abattoirLotCode: 'ABT-EXT-0001' })
      .expect(200);
    expect(patched.body.abattoirLotCode).toBe('ABT-EXT-0001');

    const sent = await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${externalOrderId}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({ abattoirLotCode: 'ABT-EXT-0001' })
      .expect(201);
    expect(sent.body.status).toBe('SENT');
    expect(sent.body.abattoirLotCode).toBe('ABT-EXT-0001');

    const processed = await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${externalOrderId}/process`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    expect(processed.body.status).toBe('PROCESSED');
    expect(processed.body.processedAt).toBeTruthy();
  });

  it('ordre déjà traité : modification et annulation refusées (400)', async () => {
    await request(server)
      .patch(`/farms/${farmId}/slaughter-orders/${externalOrderId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ birdCount: 50 })
      .expect(400);
    await request(server)
      .patch(`/farms/${farmId}/slaughter-orders/${externalOrderId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ carcassWeightKg: 100 })
      .expect(400);
    await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${externalOrderId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
  });

  it('rendement : poids carcasse renseigné au process → rendement % calculé', async () => {
    const created = await request(server)
      .post(`/farms/${farmId}/slaughter-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId,
        slaughterType: 'ABATTU',
        destination: 'EXTERNE',
        plannedDate: today(),
        birdCount: 60,
        totalWeightKg: 210,
      })
      .expect(201);
    expect(created.body.carcassWeightKg).toBeNull();

    const sent = await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${created.body.id}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    expect(sent.body.status).toBe('SENT');

    const processed = await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${created.body.id}/process`)
      .set('Authorization', `Bearer ${token}`)
      .send({ carcassWeightKg: 168 })
      .expect(201);
    expect(processed.body.status).toBe('PROCESSED');
    expect(processed.body.carcassWeightKg).toBe(168);
    expect(processed.body.rendementPercent).toBe(80);
    expect(processed.body.processedAt).toBeTruthy();

    const bordereau = await request(server)
      .get(`/farms/${farmId}/slaughter-orders/${created.body.id}/bordereau`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(bordereau.headers['content-type']).toContain('application/pdf');
  });

  it('rendement : poids carcasse supérieur au poids vif → 400', async () => {
    const created = await request(server)
      .post(`/farms/${farmId}/slaughter-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId,
        slaughterType: 'ABATTU',
        destination: 'EXTERNE',
        plannedDate: today(),
        birdCount: 1,
        totalWeightKg: 100,
      })
      .expect(201);
    await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${created.body.id}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    const res = await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${created.body.id}/process`)
      .set('Authorization', `Bearer ${token}`)
      .send({ carcassWeightKg: 150 })
      .expect(400);
    expect(res.body.message).toMatch(/dépasse le poids vif/);
  });

  it('annulation d’un ordre DRAFT', async () => {
    const created = await request(server)
      .post(`/farms/${farmId}/slaughter-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId,
        slaughterType: 'ABATTU',
        destination: 'EXTERNE',
        plannedDate: today(),
        birdCount: 10,
      })
      .expect(201);
    const cancelled = await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Banded delayed' })
      .expect(201);
    expect(cancelled.body.status).toBe('CANCELLED');
  });

  it('passeport sanitaire du lot : PDF avec conformité', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}/passeport`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it('autre ferme → 403 (création d’ordre d’abattage refusée)', async () => {
    await request(server)
      .post(`/farms/${farmId}/slaughter-orders`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        batchId,
        slaughterType: 'ABATTU',
        destination: 'INTERNE',
        plannedDate: today(),
        birdCount: 1,
      })
      .expect(403);
  });
});
