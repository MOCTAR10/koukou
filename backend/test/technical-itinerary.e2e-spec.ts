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

interface Step {
  id: string;
  species: string;
  productionType: string;
  dayFrom: number;
  dayTo: number | null;
  feedPhase: string | null;
  category: string;
  legalRef: string | null;
}

describe('Itinéraire technique et référentiel zootechnique — jury lot 1 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ownerToken: string;
  let farmId: string;

  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');

  const get = (url: string) => request(server).get(url).set(auth(ownerToken));

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
      name: `Ferme Itineraire ${tag}`,
      provinceCode: 'G3',
    });
    ownerToken = farm.ownerToken;
    farmId = farm.farmId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('sert à l’exploitant l’itinéraire du poulet de chair avec ses phases', async () => {
    const steps = (
      await get('/programme/itinerary?species=POULET&type=CHAIR').expect(200)
    ).body as Step[];
    expect(steps.length).toBeGreaterThan(0);
    for (const s of steps) {
      expect(s.species).toBe('POULET');
      expect(s.productionType).toBe('CHAIR');
    }
    const phases = steps
      .filter((s) => s.feedPhase)
      .map((s) => [s.feedPhase, s.dayFrom, s.dayTo]);
    expect(phases).toEqual([
      ['POUSSIN', 0, 10],
      ['DEMARRAGE', 11, 24],
      ['CROISSANCE', 25, 35],
      ['FINITION', 36, null],
    ]);
    // Ordered by start age.
    const froms = steps.map((s) => s.dayFrom);
    expect([...froms].sort((a, b) => a - b)).toEqual(froms);
    // The practice steps cite the decree.
    expect(steps.some((s) => s.legalRef === 'DECRET_0190_2022')).toBe(true);
  });

  it('sert aussi la pondeuse', async () => {
    const steps = (
      await get('/programme/itinerary?species=POULET&type=PONDEUSE').expect(200)
    ).body as Step[];
    expect(
      steps.filter((s) => s.feedPhase).map((s) => [s.feedPhase, s.dayTo]),
    ).toEqual([
      ['POUSSIN', 10],
      ['DEMARRAGE', 24],
      ['CROISSANCE', 112],
      ['PRE_PONTE', 126],
      ['PONTE_PHASE_1', null],
    ]);
  });

  it('refuse un type de production inconnu', async () => {
    await get('/programme/itinerary?type=INCONNU').expect(400);
  });

  it('refuse à un exploitant d’écrire l’itinéraire', async () => {
    await request(server)
      .post('/programme/itinerary')
      .set(auth(ownerToken))
      .send({
        species: 'POULET',
        productionType: 'CHAIR',
        dayFrom: 0,
        title: `Étape ${tag}`,
        instructions: 'Consigne',
        category: 'AMBIANCE',
      })
      .expect(403);
    const first = (
      await get('/programme/itinerary?species=POULET&type=CHAIR').expect(200)
    ).body[0] as Step;
    await request(server)
      .patch(`/programme/itinerary/${first.id}`)
      .set(auth(ownerToken))
      .send({ active: false })
      .expect(403);
    await get('/programme/itinerary?all=true').expect(403);
  });

  it('expose l’aliment journalier cible du référentiel d’une souche de chair', async () => {
    const breeds = (await get(`/breeds?farmId=${farmId}`).expect(200)).body as Array<{
      id: string;
      name: string;
    }>;
    const cobb = breeds.find((b) => b.name === 'Cobb 500');
    expect(cobb).toBeDefined();
    const res = await get(`/breeds/${cobb!.id}/standards?farmId=${farmId}`).expect(
      200,
    );
    const rows = res.body.standards as Array<{
      week: number;
      targetDailyFeedG: number | null;
    }>;
    expect(rows.length).toBeGreaterThan(0);
    const week1 = rows.find((r) => r.week === 1);
    // 0.18 kg x FCR 0.85 = 0.153 kg over 7 days = 21.9 g per day.
    expect(week1?.targetDailyFeedG).toBeCloseTo(21.9, 1);
    for (const r of rows) {
      expect(r).toHaveProperty('targetDailyFeedG');
    }
  });

  it('refuse à un exploitant de remplacer le référentiel zootechnique', async () => {
    const breeds = (await get(`/breeds?farmId=${farmId}`).expect(200)).body as Array<{
      id: string;
      name: string;
    }>;
    const cobb = breeds.find((b) => b.name === 'Cobb 500');
    await request(server)
      .put(`/breeds/${cobb!.id}/standards`)
      .set(auth(ownerToken))
      .send({ standards: [{ week: 1, targetAvgWeightKg: 0.2, targetFcr: 0.9 }] })
      .expect(403);
    // Nothing was replaced.
    const res = await get(`/breeds/${cobb!.id}/standards?farmId=${farmId}`).expect(
      200,
    );
    expect(res.body.standards.length).toBeGreaterThan(1);
  });
});
