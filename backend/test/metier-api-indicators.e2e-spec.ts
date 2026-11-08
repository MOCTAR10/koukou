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

/** `YYYY-MM-DD`, `n` days from today (UTC). */
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The server is the single source of truth of the farm indicators (laying
 * rate per species, feed per bird-day, official production cost per kg,
 * display thresholds): the clients no longer recompute them.
 *
 * Hand-computed expectations (10 days of entries, the lay/feed window covers
 * the last 8 recorded days, no death):
 *   layer A 100 hens, 60 eggs/day, 12 kg feed/day  => 480 eggs, 800 hen-days
 *   layer B 300 hens, 120 eggs/day, 36 kg feed/day => 960 eggs, 2400 hen-days
 *   broiler C 200 birds, 20 kg feed/day            => 160 kg, 1600 bird-days
 *   POULET laying rate = (480 + 960) / (800 + 2400) = 45 %
 *     (the mean of the two lot rates, 60 % and 40 %, would say 50 %).
 *   Feed per bird-day = (96 + 288 + 160) / (800 + 2400 + 1600) = 0.1133 kg.
 */
describe('Indicateurs métier côté serveur (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let token: string;
  let farmId: string;
  let layerA: string;
  let layerB: string;
  let broilerC: string;

  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');
  const get = (url: string, t: string) =>
    request(server).get(url).set(auth(t));
  const post = (url: string, body: object, t: string) =>
    request(server).post(url).set(auth(t)).send(body);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    adminToken = (await createPlatformAdmin(server, ds)).token;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Indicateurs ${tag}`,
    });
    farmId = farm.farmId;
    token = farm.ownerToken;
    const breeds = (await get('/breeds', token).expect(200)).body;
    const isaId = breeds.find((b: { name: string }) => b.name === 'ISA Brown').id;
    const rossId = breeds.find((b: { name: string }) => b.name === 'Ross 308').id;

    const open = async (body: object) =>
      (await post(`/farms/${farmId}/batches`, body, token).expect(201)).body
        .id as string;
    layerA = await open({
      batchName: `Pondeuses A ${tag}`,
      type: 'PONDEUSE',
      integrationDate: day(-10),
      initialAgeDays: 126,
      quantityAtStart: 100,
      breedId: isaId,
    });
    layerB = await open({
      batchName: `Pondeuses B ${tag}`,
      type: 'PONDEUSE',
      integrationDate: day(-10),
      initialAgeDays: 126,
      quantityAtStart: 300,
      breedId: isaId,
    });
    broilerC = await open({
      batchName: `Chair C ${tag}`,
      type: 'CHAIR',
      integrationDate: day(-10),
      quantityAtStart: 200,
      breedId: rossId,
      chickUnitPriceFcfa: 500,
    });
    await post(
      `/farms/${farmId}/inputs`,
      {
        kind: 'ALIMENT',
        foodType: 'DEMARRAGE',
        productName: 'Provende',
        supplier: 'CEAG',
        supplierLotNumber: `PR-${tag}`,
        numberOfBags: 200,
        bagSizeKg: 50,
        unitPriceFcfa: 20_000,
        batchId: layerA,
      },
      token,
    ).expect(201);
    const enter = async (id: string, eggs: number, feed: number) => {
      for (let o = 1; o <= 10; o++) {
        await post(
          `/farms/${farmId}/batches/${id}/daily-entries`,
          {
            entryDate: day(o - 10),
            deaths: 0,
            feedQuantity: feed,
            feedUnit: 'KG',
            feedType: 'DEMARRAGE',
            ...(eggs > 0
              ? { eggsCollected: eggs, eggsSellable: eggs }
              : {}),
          },
          token,
        ).expect(201);
      }
    };
    await enter(layerA, 60, 12);
    await enter(layerB, 120, 36);
    await enter(broilerC, 0, 20);
  }, 300_000);

  afterAll(async () => {
    await app.close();
  });

  it('taux de ponte de la ferme par espèce = œufs / poules-jours, pas la moyenne des taux de lots', async () => {
    const dash = (await get(`/farms/${farmId}/dashboard`, token).expect(200)).body;
    const poulet = dash.farmIndicators.layingBySpecies.find(
      (g: { species: string }) => g.species === 'POULET',
    );
    expect(poulet).toMatchObject({ eggs: 1440, henDays: 3200, lots: 2 });
    expect(poulet.layRatePercent).toBe(45);
    // Lot sheets keep their own rate (60 % and 40 %).
    const a = (await get(`/farms/${farmId}/batches/${layerA}`, token).expect(200)).body;
    const b = (await get(`/farms/${farmId}/batches/${layerB}`, token).expect(200)).body;
    expect(a.metrics.layRatePercent).toBeCloseTo(60, 6);
    expect(b.metrics.layRatePercent).toBeCloseTo(40, 6);
    expect(a.metrics.layWindowEggs + b.metrics.layWindowEggs).toBe(1440);
    expect(a.metrics.layWindowHenDays + b.metrics.layWindowHenDays).toBe(3200);
  });

  it('aliment par oiseau et par jour = kg distribués / oiseaux-jours présents', async () => {
    const dash = (await get(`/farms/${farmId}/dashboard`, token).expect(200)).body;
    expect(dash.farmIndicators.feedPerBirdDayKg).toBeCloseTo(544 / 4800, 4);
    expect(dash.farmIndicators.feedPerBirdDayKg).toBe(0.1133);
  });

  it('coût de production officiel : même valeur que l’indicateur du bilan, motif quand il n’est pas calculable', async () => {
    const lot = (await get(`/farms/${farmId}/batches/${broilerC}`, token).expect(200)).body;
    const official = (
      await get(`/farms/${farmId}/bandes/${broilerC}/indicators`, token).expect(200)
    ).body;
    const kg = official.indicators.find(
      (i: { key: string }) => i.key === 'cout_production_kg',
    ).value as number | null;
    expect(lot.coutProductionSource).toBe('EN_COURS');
    if (kg != null) {
      expect(lot.coutProductionKg).toBeCloseTo(kg, 2);
      expect(lot.coutProductionReason).toBeNull();
    } else {
      expect(lot.coutProductionKg).toBeNull();
      expect(['NO_CHARGES', 'NO_WEIGHT_PRODUCED']).toContain(
        lot.coutProductionReason,
      );
    }
    const list = (await get(`/farms/${farmId}/batches?withCost=true`, token).expect(200)).body;
    const row = list.find((r: { id: string }) => r.id === broilerC);
    expect(row.coutProductionKg).toBe(lot.coutProductionKg);
    // A layer with no weight produced: never a made-up number.
    const layer = list.find((r: { id: string }) => r.id === layerB);
    expect(layer).toHaveProperty('coutProductionKg');
    if (layer.coutProductionKg == null) {
      expect(layer.coutProductionReason).not.toBeNull();
    }
  });

  it('seuils d’affichage : valeurs du paramétrage, répercutées quand l’administrateur les change', async () => {
    const read = async () =>
      (await get(`/farms/${farmId}/dashboard`, token).expect(200)).body.thresholds;
    const before = await read();
    expect(before).toMatchObject({ fcrAbsoluteWarn: 2.2, fcrDeviationWarnPct: 10 });
    await request(server)
      .patch('/reference-constants/fcr_absolute_warn')
      .set(auth(adminToken))
      .send({ value: 2.6 })
      .expect(200);
    try {
      expect((await read()).fcrAbsoluteWarn).toBe(2.6);
    } finally {
      await request(server)
        .patch('/reference-constants/fcr_absolute_warn')
        .set(auth(adminToken))
        .send({ value: before.fcrAbsoluteWarn })
        .expect(200);
    }
    expect((await read()).fcrAbsoluteWarn).toBe(before.fcrAbsoluteWarn);
  });
});
