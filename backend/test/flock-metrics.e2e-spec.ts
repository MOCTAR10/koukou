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

  it('mortalité : les morts déclarées en événement sanitaire comptent partout, sans doublon', async () => {
    const today = daysAgo(0);
    const b = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Bande mortalité',
        integrationDate: daysAgo(20),
        quantityAtStart: 1000,
        type: 'CHAIR',
      })
      .expect(201);
    const id = b.body.id;
    await request(server)
      .post(`/farms/${farmId}/batches/${id}/daily-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ entryDate: today, deaths: 10, feedUnit: 'KG', feedType: 'CROISSANCE', feedQuantity: 50 })
      .expect(201);
    await request(server)
      .post(`/farms/${farmId}/batches/${id}/health-events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'MORTALITE',
        occurredAt: today,
        severity: 'ROUGE',
        quantity: 30,
        title: 'Pic de mortalité',
      })
      .expect(201);

    const batch = await request(server)
      .get(`/farms/${farmId}/batches/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // Removed once from the live count, counted once in the rate.
    expect(batch.body.quantityAlive).toBe(960);
    expect(batch.body.metrics.liveCount).toBe(960);
    expect(batch.body.metrics.totalDeaths).toBe(40);
    expect(batch.body.metrics.mortalityPercent).toBeCloseTo(4, 6);
    expect(batch.body.metrics.viabilityPercent).toBeCloseTo(96, 6);

    // The alert is raised right after the event, not at the next entry.
    const alerts = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const mortalite = (alerts.body as any[]).find(
      (a) => a.batchId === id && a.kind === 'MORTALITE' && a.status === 'ACTIVE',
    );
    expect(mortalite).toBeDefined();
    expect(mortalite.level).toBe('JAUNE');

    const dash = await request(server)
      .get(`/farms/${farmId}/dashboard`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const row = (dash.body.healthOverview as any[]).find((r) => r.batchId === id);
    expect(row.mortalityPercent).toBe(4);
    expect(row.weekDeaths).toBe(40);

    const curve = await request(server)
      .get(`/farms/${farmId}/batches/${id}/curve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((curve.body.weekly as any[]).reduce((s, w) => s + w.deaths, 0)).toBe(40);

    const health = await request(server)
      .get(`/farms/${farmId}/batches/${id}/health`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(health.body.totalDeaths).toBe(40);
    expect(health.body.trends.mortality[health.body.trends.mortality.length - 1]).toBe(40);
  });

  it('IPE jugé contre la souche à l’âge de la pesée (pas un seuil absolu)', async () => {
    const breeds = await request(server)
      .get('/breeds')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const cobbId = (breeds.body as any[]).find((b) => b.name === 'Cobb 500').id;
    const standards = await request(server)
      .get(`/breeds/${cobbId}/standards`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // Weighing at 28 days → age week 5.
    const w5 = (standards.body.standards as any[]).find((s) => s.week === 5);
    const targetIpe = (w5.targetAvgWeightKg * 100 * 100) / (28 * w5.targetFcr);

    const lot = async (name: string, weightKg: number) => {
      const b = await request(server)
        .post(`/farms/${farmId}/batches`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          batchName: name,
          integrationDate: daysAgo(30),
          quantityAtStart: 1000,
          type: 'CHAIR',
          breedId: cobbId,
        })
        .expect(201);
      // Feed sized so a lot at the target weight has exactly the target FCR.
      await request(server)
        .post(`/farms/${farmId}/batches/${b.body.id}/daily-entries`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          entryDate: daysAgo(2),
          deaths: 0,
          feedUnit: 'KG',
          feedType: 'CROISSANCE',
          feedQuantity: Math.round(
            w5.targetFcr * 1000 * (w5.targetAvgWeightKg - 0.045),
          ),
          avgWeightKg: weightKg,
        })
        .expect(201);
      const batch = await request(server)
        .get(`/farms/${farmId}/batches/${b.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const alerts = await request(server)
        .get(`/farms/${farmId}/alerts`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      return {
        m: batch.body.metrics,
        ipeAlert: (alerts.body as any[]).find(
          (a) => a.batchId === b.body.id && a.kind === 'IPE' && a.status === 'ACTIVE',
        ),
      };
    };

    // On the curve: IPE ≈ 300+, far above the old absolute threshold of 90,
    // and no alert.
    const good = await lot('Bande IPE conforme', w5.targetAvgWeightKg);
    expect(good.m.ipeTarget).toBeCloseTo(targetIpe, 1);
    expect(good.m.ipe).toBeCloseTo(targetIpe, 0);
    expect(good.ipeAlert).toBeUndefined();

    // 30 % under the target weight with the same feed: IPE well behind.
    const late = await lot('Bande IPE en retard', w5.targetAvgWeightKg * 0.7);
    expect(late.m.ipe).toBeLessThan(late.m.ipeTarget * 0.9);
    expect(late.ipeAlert).toBeDefined();
    expect(late.ipeAlert.level).toBe('JAUNE');
    expect(late.ipeAlert.message).toContain('attendu pour la souche');
  });
});
