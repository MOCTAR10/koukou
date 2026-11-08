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
  type ProgrammeFarm,
} from './helpers/programme-farm.js';

/**
 * Wave 6 - performance. The number of SQL queries behind a read endpoint must
 * not grow with the number of bands / farms: we count the queries of one call
 * on a small dataset and on a larger one and bound the difference.
 */
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const letters = () =>
  Array.from(randomBytes(6), (b) => String.fromCharCode(65 + (b % 26))).join(
    '',
  );

describe('Regression wave 6 - requetes par lot / par ferme (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let queries = 0;
  const realLogger = () => ds.logger;

  /** Number of SQL statements sent while `fn` runs. */
  async function countQueries(fn: () => Promise<unknown>): Promise<number> {
    const original = realLogger();
    queries = 0;
    (ds as unknown as { logger: unknown }).logger = {
      logQuery: () => {
        queries += 1;
      },
      logQueryError: () => undefined,
      logQuerySlow: () => undefined,
      logSchemaBuild: () => undefined,
      logMigration: () => undefined,
      log: () => undefined,
    };
    try {
      await fn();
    } finally {
      (ds as unknown as { logger: unknown }).logger = original;
    }
    return queries;
  }

  const openBand = async (farm: ProgrammeFarm, withEntry: boolean) => {
    const res = await request(server)
      .post(`/farms/${farm.farmId}/batches`)
      .set(auth(farm.ownerToken))
      .send({
        batchName: `Bande perf ${letters()}`,
        type: 'CHAIR',
        integrationDate: day(-10),
        quantityAtStart: 500,
      })
      .expect(201);
    if (withEntry) {
      await request(server)
        .post(`/farms/${farm.farmId}/batches/${res.body.id}/daily-entries`)
        .set(auth(farm.ownerToken))
        .send({
          entryDate: day(-2),
          deaths: 2,
          feedQuantity: 40,
          feedUnit: 'KG',
          avgWeightKg: 0.4,
          sampleSize: 20,
        })
        .expect(201);
    }
    return res.body.id as string;
  };

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
    ds = app.get(DataSource);
    adminToken = (await createPlatformAdmin(server, ds)).token;
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('liste des lots et dashboard ferme : le nombre de requetes ne croit pas avec le nombre de lots', async () => {
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme perf lots ${letters()}`,
      provinceCode: 'G1',
    });
    await openBand(farm, true);

    const list = () =>
      request(server)
        .get(`/farms/${farm.farmId}/batches`)
        .set(auth(farm.ownerToken))
        .expect(200);
    const dash = () =>
      request(server)
        .get(`/farms/${farm.farmId}/dashboard`)
        .set(auth(farm.ownerToken))
        .expect(200);

    const listOne = await countQueries(list);
    const dashOne = await countQueries(dash);

    for (let i = 0; i < 5; i++) await openBand(farm, true);

    const listSix = await countQueries(list);
    const dashSix = await countQueries(dash);
    const body = (await list()).body as unknown[];
    expect(body).toHaveLength(6);

    // eslint-disable-next-line no-console
    console.log(
      `[perf] lots: liste 1 lot=${listOne} 6 lots=${listSix} | dashboard 1 lot=${dashOne} 6 lots=${dashSix}`,
    );
    // Was ~15 queries per extra band (list) and ~30 (dashboard).
    expect(listSix - listOne).toBeLessThanOrEqual(5);
    expect(dashSix - dashOne).toBeLessThanOrEqual(8);
  }, 120_000);

  it('pilotage (tableau de bord, carte, objectif) : requetes constantes quand le nombre de fermes augmente', async () => {
    const farms: ProgrammeFarm[] = [];
    const addFarms = async (n: number) => {
      for (let i = 0; i < n; i++) {
        const f = await createProgrammeFarm(server, adminToken, {
          name: `Ferme perf pilotage ${letters()}`,
          provinceCode: 'G1',
          extra: { gps: { latitude: 0.4, longitude: 9.45 } },
        });
        farms.push(f);
        await openBand(f, true);
        await openBand(f, false);
        await openBand(f, false);
      }
    };
    const get = (url: string) =>
      request(server).get(url).set(auth(adminToken)).expect(200);

    await addFarms(2);
    const urls = [
      '/pilotage/dashboard',
      '/pilotage/map',
      '/pilotage/objective',
      '/pilotage/exports/farms.csv',
    ];
    const small: number[] = [];
    for (const u of urls) small.push(await countQueries(() => get(u)));

    await addFarms(8);
    const large: number[] = [];
    for (const u of urls) large.push(await countQueries(() => get(u)));

    // eslint-disable-next-line no-console
    console.log(
      `[perf] pilotage ${urls.join(' ')}: 2 fermes=${small.join('/')} 10 fermes=${large.join('/')}`,
    );
    urls.forEach((_, i) => {
      expect(large[i]! - small[i]!).toBeLessThanOrEqual(3);
    });
  }, 300_000);

  it('rapports : la liste des executions ne fait pas une requete par rapport', async () => {
    const one = await countQueries(() =>
      request(server)
        .get('/pilotage/reports/runs')
        .set(auth(adminToken))
        .expect(200),
    );
    expect(one).toBeLessThanOrEqual(30);
  });
});
