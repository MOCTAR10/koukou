import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Batch indicators after birds leave the lot: FCR counts every bird the feed
 * went into, GMQ/FCR are frozen at the last weighing, and water per bird
 * follows the real headcount (no false EAU alert after a cull/sale).
 */
describe('Indicateurs de lot : IC / GMQ / eau après sorties (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let farmId: string;
  let batchId: string;

  const entry = (body: Record<string, unknown>) =>
    request(server)
      .post(`/farms/${farmId}/batches/${batchId}/daily-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ deaths: 0, feedUnit: 'KG', feedType: 'CROISSANCE', ...body })
      .expect(201);

  const metrics = async () =>
    (
      await request(server)
        .get(`/farms/${farmId}/batches/${batchId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
    ).body.metrics;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();

    const phone = `+24166${Date.now()}`;
    await request(server)
      .post('/auth/register')
      .send({ phone, fullName: 'Proprio Indicateurs', code: 'secret123' })
      .expect(201);
    const login = await request(server)
      .post('/auth/login')
      .send({ phone, code: 'secret123' })
      .expect(201);
    token = login.body.accessToken;

    const farm = await request(server)
      .post('/farms')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Ferme Indicateurs ${Date.now()}`, administrativeCity: 'Libreville' })
      .expect(201);
    farmId = farm.body.id;

    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Bande indicateurs',
        integrationDate: daysAgo(30),
        quantityAtStart: 1000,
        type: 'CHAIR',
      })
      .expect(201);
    batchId = batch.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('réforme de 400 oiseaux : eau/oiseau stable → pas d’alerte EAU ; IC sur 1000 oiseaux', async () => {
    await entry({ entryDate: daysAgo(16), feedQuantity: 400, waterL: 200 });
    await entry({ entryDate: daysAgo(15), feedQuantity: 400, waterL: 200 });
    await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/health-events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'REFORME',
        occurredAt: daysAgo(14),
        severity: 'JAUNE',
        quantity: 400,
        title: 'Réforme de 400 oiseaux',
      })
      .expect(201);
    // 120 L for 600 birds = 0.2 L/bird, same as before the cull.
    await entry({
      entryDate: daysAgo(14),
      feedQuantity: 400,
      waterL: 120,
      avgWeightKg: 0.845,
    });

    const alerts = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const eau = (alerts.body as any[]).filter(
      (a) => a.batchId === batchId && ['EAU', 'MALADIE'].includes(a.kind) && a.status === 'ACTIVE',
    );
    expect(eau).toEqual([]);

    const m = await metrics();
    expect(m.liveCount).toBe(600);
    expect(m.lastWeighingDate).toBe(daysAgo(14));
    expect(m.lastWeighingAgeDays).toBe(16);
    // 1200 kg for 1000 birds × 0.8 kg (the 400 culled were fed too).
    expect(m.totalWeightGainKg).toBeCloseTo(800, 4);
    expect(m.fcr).toBeCloseTo(1.5, 4);
    expect(m.gmqGramsPerDay).toBeCloseTo(50, 4);
  });

  it('jours sans pesée : IC et GMQ restent ceux de la dernière pesée ; eau en L/oiseau/j', async () => {
    await entry({ entryDate: daysAgo(1), feedQuantity: 300, waterL: 150 });
    const m = await metrics();
    expect(m.totalFeedKg).toBe(1500);
    expect(m.fcr).toBeCloseTo(1.5, 4);
    expect(m.gmqGramsPerDay).toBeCloseTo(50, 4);
    // Last 7 days: one reading, 150 L for 600 birds.
    expect(m.waterLPerBird).toBeCloseTo(0.25, 4);
  });
});
