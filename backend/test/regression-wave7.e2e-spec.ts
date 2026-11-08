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
 * Wave 7 - performance. Layer (PONDEUSE) lots no longer cost 3 queries each
 * for their egg stock, the supply summaries of the pilotage dashboard no
 * longer cost ~8 queries per farm with confirmed deliveries, and the
 * dashboard / registry stay fast with 150 farms.
 */
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const letters = () =>
  Array.from(randomBytes(6), (b) => String.fromCharCode(65 + (b % 26))).join(
    '',
  );

describe('Regression wave 7 - pondeuses, intrants, temps de reponse (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let queries = 0;

  /** Number of SQL statements sent while `fn` runs. */
  async function countQueries(fn: () => Promise<unknown>): Promise<number> {
    const original = ds.logger;
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

  const openLayerLot = async (farm: ProgrammeFarm) => {
    const res = await request(server)
      .post(`/farms/${farm.farmId}/batches`)
      .set(auth(farm.ownerToken))
      .send({
        batchName: `Pondeuses perf ${letters()}`,
        type: 'PONDEUSE',
        integrationDate: day(-60),
        quantityAtStart: 300,
      })
      .expect(201);
    await request(server)
      .post(`/farms/${farm.farmId}/batches/${res.body.id}/daily-entries`)
      .set(auth(farm.ownerToken))
      .send({ entryDate: day(-2), deaths: 1, eggsCollected: 200 })
      .expect(201);
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

  it('lots pondeuses : liste et dashboard ferme a requetes constantes (stock d oeufs groupe)', async () => {
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme perf pondeuses ${letters()}`,
      provinceCode: 'G1',
    });
    await openLayerLot(farm);

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
    for (let i = 0; i < 5; i++) await openLayerLot(farm);
    const listSix = await countQueries(list);
    const dashSix = await countQueries(dash);

    const body = (await list()).body as Array<{
      metrics?: { eggStockAvailableEggs?: number };
    }>;
    expect(body).toHaveLength(6);

    // eslint-disable-next-line no-console
    console.log(
      `[perf7] pondeuses: liste 1 lot=${listOne} 6 lots=${listSix} | dashboard 1 lot=${dashOne} 6 lots=${dashSix}`,
    );
    expect(listSix - listOne).toBeLessThanOrEqual(5);
    expect(dashSix - dashOne).toBeLessThanOrEqual(8);
  }, 180_000);

  it('pilotage : les resumes d intrants ne coutent pas ~8 requetes par ferme livree', async () => {
    const addFarmWithDelivery = async () => {
      const f = await createProgrammeFarm(server, adminToken, {
        name: `Ferme perf intrants ${letters()}`,
        provinceCode: 'G1',
      });
      const created = await request(server)
        .post('/programme/input-deliveries')
        .set(auth(adminToken))
        .send({
          farmId: f.farmId,
          source: 'ETAT_SMAG',
          shippedAt: day(-6),
          lines: [
            {
              intrantCode: 'ALIMENT_DEMARRAGE',
              unitCode: 'SAC',
              quantity: 10,
              bagSizeKg: 50,
              feedPhase: 'DEMARRAGE',
              unitValueFcfa: 15_000,
            },
            {
              intrantCode: 'POUSSINS',
              unitCode: 'TETE',
              quantity: 500,
              unitValueFcfa: 600,
            },
          ],
        })
        .expect(201);
      await request(server)
        .post(
          `/farms/${f.farmId}/input-deliveries/${created.body.id as string}/confirm`,
        )
        .set(auth(f.ownerToken))
        .send({ receivedDate: day(-5), lines: [] })
        .expect(201);
    };
    const dash = () =>
      request(server)
        .get('/pilotage/dashboard')
        .set(auth(adminToken))
        .expect(200);

    for (let i = 0; i < 2; i++) await addFarmWithDelivery();
    const small = await countQueries(dash);
    for (let i = 0; i < 8; i++) await addFarmWithDelivery();
    const large = await countQueries(dash);

    // eslint-disable-next-line no-console
    console.log(
      `[perf7] pilotage intrants: 2 fermes livrees=${small} 10 fermes livrees=${large}`,
    );
    // Was ~8 queries per farm: +64 for 8 more farms.
    expect(large - small).toBeLessThanOrEqual(3);
  }, 300_000);

  it('150 fermes : tableau de bord de pilotage et registre repondent sous 3 s', async () => {
    const template = await createProgrammeFarm(server, adminToken, {
      name: `Ferme gabarit ${letters()}`,
      provinceCode: 'G1',
    });
    const cols: Array<{ column_name: string }> = await ds.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'farms' AND table_schema = current_schema()
          AND is_generated = 'NEVER'`,
    );
    const names = cols.map((c) => c.column_name);
    const override: Record<string, string> = {
      id: 'gen_random_uuid()',
      code: `'W7' || substr(md5(random()::text), 1, 10) || g::text`,
      name: `'Ferme masse ' || substr(md5(random()::text), 1, 8) || ' ' || g::text`,
      ami_ref: 'NULL',
    };
    const select = names
      .map((c) => override[c] ?? `f."${c}"`)
      .join(', ');
    await ds.query(
      `INSERT INTO farms (${names.map((c) => `"${c}"`).join(', ')})
       SELECT ${select} FROM farms f, generate_series(1, 150) g
        WHERE f.id = $1`,
      [template.farmId],
    );

    const timed = async (url: string) => {
      await request(server).get(url).set(auth(adminToken)).expect(200); // warm-up
      const t0 = Date.now();
      await request(server).get(url).set(auth(adminToken)).expect(200);
      return Date.now() - t0;
    };
    const dashMs = await timed('/pilotage/dashboard');
    const registryMs = await timed('/programme/farms?pageSize=200');
    const mapMs = await timed('/pilotage/map');

    // eslint-disable-next-line no-console
    console.log(
      `[perf7] 150+ fermes: dashboard=${dashMs}ms registre=${registryMs}ms carte=${mapMs}ms`,
    );
    expect(dashMs).toBeLessThan(3000);
    expect(registryMs).toBeLessThan(3000);
    expect(mapMs).toBeLessThan(3000);
  }, 120_000);
});
