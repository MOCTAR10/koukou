import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
} from './helpers/programme-farm.js';

function day(offset = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

describe('Suivi de l’alimentation — courbe du lot (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ownerToken: string;
  let farmId: string;
  let batchId: string;

  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();

    const adminToken = (await createPlatformAdmin(server, app.get(DataSource)))
      .token;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Aliment ${tag}`,
      provinceCode: 'G3',
    });
    ownerToken = farm.ownerToken;
    farmId = farm.farmId;

    const breeds = (
      await request(server)
        .get(`/breeds?farmId=${farmId}`)
        .set(auth(ownerToken))
        .expect(200)
    ).body as Array<{ id: string; name: string }>;
    const cobb = breeds.find((b) => b.name === 'Cobb 500');
    expect(cobb).toBeDefined();

    const band = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set(auth(ownerToken))
      .send({
        batchName: `Bande aliment ${tag}`,
        type: 'CHAIR',
        breedId: cobb!.id,
        integrationDate: day(-4),
        quantityAtStart: 500,
      })
      .expect(201);
    batchId = band.body.id;

    const post = (body: object) =>
      request(server)
        .post(`/farms/${farmId}/batches/${batchId}/daily-entries`)
        .set(auth(ownerToken))
        .send({ feedUnit: 'KG', skipStockDeduction: true, ...body })
        .expect(201);
    await post({ entryDate: day(-3), feedQuantity: 11, waterL: 25 });
    await post({ entryDate: day(-2), feedQuantity: 12, waterL: 0, deaths: 10 });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rend l’aliment par oiseau, le standard de la souche et le ratio eau/aliment', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}/curve`)
      .set(auth(ownerToken))
      .expect(200);
    const daily = res.body.dailyFeed as Array<{
      date: string;
      birds: number;
      feedPerBirdG: number;
      targetDailyFeedG: number | null;
      waterFeedRatio: number | null;
    }>;
    expect(daily).toHaveLength(2);
    expect(daily[0]).toMatchObject({
      date: day(-3),
      birds: 500,
      feedPerBirdG: 22,
      waterFeedRatio: 2.27,
    });
    expect(daily[0].targetDailyFeedG).not.toBeNull();
    expect(daily[1]).toMatchObject({
      date: day(-2),
      birds: 490,
      feedPerBirdG: 24.5,
      waterFeedRatio: null,
    });
    expect(daily[1].targetDailyFeedG).not.toBeNull();
    expect(res.body.hasFeedStandard).toBe(true);
    expect(res.body.feedTotals).toMatchObject({
      totalFeedKg: 23,
      countedDays: 2,
      feedPerBirdToDateG: 46.5,
    });
    expect(res.body.feedTotals.standardToDateG).not.toBeNull();
  });

  it('sert la plage eau/aliment avec les seuils du tableau de bord', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/dashboard`)
      .set(auth(ownerToken))
      .expect(200);
    expect(res.body.thresholds.waterFeedRatioMin).toBeLessThan(
      res.body.thresholds.waterFeedRatioMax,
    );
  });
});
