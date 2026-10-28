import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('Module 1 — Gestion des Lots (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let farmId: string;
  let batchId: string;

  const ownerPhone = `+24170${Date.now()}`;

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
  });

  beforeAll(async () => {
    // Inscription + connexion Propriétaire
    await request(server)
      .post('/auth/register')
      .send({
        phone: ownerPhone,
        fullName: 'Proprio E2E',
        code: 'secret123',
      })
      .expect(201);
    const login = await request(server)
      .post('/auth/login')
      .send({ phone: ownerPhone, code: 'secret123' })
      .expect(201);
    token = login.body.accessToken;
  });

  it('crée une ferme', async () => {
    const res = await request(server)
      .post('/farms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Ferme E2E ${Date.now()}`,
        administrativeCity: 'Libreville',
        capacityPerBuilding: 1500,
      })
      .expect(201);
    farmId = res.body.id;
    expect(farmId).toBeTruthy();
  });

  it('crée un lot surdensitaire (2400 poussins / 40 m²) et expose densité + moduleRatioVsCapacity', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Lot E2E A',
        integrationDate: daysAgo(30),
        quantityAtStart: 2400,
        type: 'CHAIR',
        buildingAreaM2: 40,
      })
      .expect(201);
    batchId = res.body.id;
    expect(res.body.metrics.densityPerM2).toBeCloseTo(2400 / 40, 1); // 60
    expect(res.body.metrics.moduleFraction).toBeCloseTo(2400 / 3000, 3); // 0.8 (module 3000)
    expect(res.body.metrics.moduleRatioVsCapacity).toBeCloseTo(2400 / 1500, 3); // 1.6
    expect(res.body.metrics.status).toBe('ROUGE');
  });

  it('remonte une alerte SURDENSITÉ (ROUGE)', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const surd = res.body.find((a: any) => a.kind === 'SURDENSITE');
    expect(surd).toBeTruthy();
    expect(surd.level).toBe('ROUGE');
    expect(surd.message).toContain('oiseaux/m²');
  });

  it('saisit 2 journées : mortalité + indicateur eau (génère alerte EAU)', async () => {
    // Jour 1 : 20 morts, eau 400 L
    await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/daily-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        entryDate: daysAgo(29),
        deaths: 20,
        feedBags: 10,
        feedUnit: 'SAC',
        feedType: 'DEMARRAGE',
        waterL: 400,
      })
      .expect(201);
    // Jour 2 : 30 morts, chute d'eau drastique 400 -> 200 (50%, indicateur n°1), poids moyen 1.2 kg
    await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/daily-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        entryDate: daysAgo(28),
        deaths: 30,
        feedBags: 10,
        feedUnit: 'SAC',
        feedType: 'DEMARRAGE',
        waterL: 200,
        avgWeightKg: 1.2,
      })
      .expect(201);

    const batch = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const m = batch.body.metrics;
    expect(m.liveCount).toBe(2400 - 50); // 2350
    expect(m.totalDeaths).toBe(50);
    expect(m.mortalityPercent).toBeCloseTo((50 / 2400) * 100, 2); // 2.08%
    expect(m.totalFeedKg).toBe(1000); // 10 sacs x 50 kg x 2 jours
    // FCR at the weighing (age 2) over all the birds the feed went into:
    // 2350 present at 1.2 kg + 30 dead on the weighing day + 20 dead the day
    // before at the interpolated weight (0.045 → 1.2 over 2 days).
    const gain = 1.2 - 0.045;
    const expectedFcr = 1000 / (2350 * gain + 30 * gain + 20 * (gain / 2));
    expect(m.fcr).toBeCloseTo(expectedFcr, 4);
    // GMQ = (1.2 - 0.045) * 1000 / age at the weighing, not today's age.
    expect(m.lastWeighingDate).toBe(daysAgo(28));
    expect(m.lastWeighingAgeDays).toBe(2);
    expect(m.gmqGramsPerDay).toBeCloseTo((gain * 1000) / 2, 2);

    const alerts = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const eau = alerts.body.find((a: any) => a.kind === 'EAU');
    expect(eau).toBeTruthy();
    expect(eau.level).toBe('ROUGE');
  });

  it('accepte la VENTE sans traçabilité mais lève une alerte TRACABILITÉ (ROUGE)', async () => {
    const sale = await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/vente`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(sale.body.status).toBe('EN_VENTE');
    const alerts = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const trac = alerts.body.find((a: any) => a.kind === 'TRACABILITE');
    expect(trac).toBeTruthy();
    expect(trac.level).toBe('ROUGE');
  });

  it('comble la traçabilité HACCP puis l’alerte TRACABILITÉ se résout', async () => {
    await request(server)
      .patch(`/farms/${farmId}/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        couvoirSupplier: 'Couvoir E2E',
        chickLotNumber: 'CH-2026-E2E',
        hatchDate: daysAgo(28),
      })
      .expect(200);
    await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/vente`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const alerts = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      alerts.body.some(
        (a: any) => a.kind === 'TRACABILITE' && a.status === 'ACTIVE',
      ),
    ).toBe(false);
  });

  it('restreint l’accès d’un Éleveur aux fermes auxquelles il est rattaché', async () => {
    // Un Éleveur sans lien doit recevoir 403 sur cette ferme
    const empPhone = `+24171${Date.now()}`;
    await request(server)
      .post(`/farms/${farmId}/eleveurs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        phone: empPhone,
        fullName: 'Ouvrier E2E',
        code: 'secret123',
      })
      .expect(201);
    const empLogin = await request(server)
      .post('/auth/login')
      .send({ phone: empPhone, code: 'secret123' })
      .expect(201);
    const empToken = empLogin.body.accessToken;

    // ferme sans lien (autre ferme) -> 403
    const otherFarm = await request(server)
      .post('/farms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Autre Ferme ${Date.now()}`,
        administrativeCity: 'Oyem',
        capacityPerBuilding: 1000,
      })
      .expect(201);
    await request(server)
      .get(`/farms/${otherFarm.body.id}/batches`)
      .set('Authorization', `Bearer ${empToken}`)
      .expect(403);
  });

  afterAll(async () => {
    await app.close();
  });
});
