import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { Farm } from './../src/modules/farms/entities/farm.entity.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  type ProgrammeFarm,
} from './helpers/programme-farm.js';

/**
 * Wave 8 - performance. The Market catalogue and farm listings no longer run
 * ~10 queries per egg listing for their free stock, the accounting journal
 * can be paged, and the farm dashboard stays flat with the number of layer
 * lots.
 */
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const letters = () =>
  Array.from(randomBytes(6), (b) => String.fromCharCode(65 + (b % 26))).join(
    '',
  );

describe('Regression wave 8 - Market, journal, dashboard (e2e)', () => {
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

  const openLayerLot = async (farm: ProgrammeFarm, eggs = 300) => {
    const res = await request(server)
      .post(`/farms/${farm.farmId}/batches`)
      .set(auth(farm.ownerToken))
      .send({
        batchName: `Pondeuses w8 ${letters()}`,
        type: 'PONDEUSE',
        integrationDate: day(-60),
        quantityAtStart: 300,
      })
      .expect(201);
    await request(server)
      .post(`/farms/${farm.farmId}/batches/${res.body.id}/daily-entries`)
      .set(auth(farm.ownerToken))
      .send({ entryDate: day(-2), deaths: 1, eggsCollected: eggs })
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

  it('market : catalogue et annonces de ferme a requetes constantes (stock d oeufs groupe)', async () => {
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme market perf ${letters()}`,
      provinceCode: 'G1',
      extra: {
        gps: { latitude: 0.41, longitude: 9.45 },
        statusCode: 'OPERATIONNELLE',
      },
    });
    const city = `Ville${letters()}`;
    await request(server)
      .patch(`/farms/${farm.farmId}`)
      .set(auth(farm.ownerToken))
      .send({ administrativeCity: city })
      .expect(200);
    await ds.getRepository(Farm).update({ id: farm.farmId }, { isVerified: true });

    const publishEggs = async () => {
      const batchId = await openLayerLot(farm);
      const created = await request(server)
        .post(`/farms/${farm.farmId}/market/listings`)
        .set(auth(farm.ownerToken))
        .send({
          kind: 'NOW',
          product: 'EGGS',
          batchId,
          unitPriceFcfa: 2500,
          quantityPublished: 5,
        })
        .expect(201);
      await request(server)
        .post(`/farms/${farm.farmId}/market/listings/${created.body.id}/publish`)
        .set(auth(farm.ownerToken))
        .expect(201);
      return created.body.id as string;
    };

    const catalogue = () =>
      request(server)
        .get('/market/listings')
        .query({ city, limit: 50 })
        .expect(200);
    const farmList = () =>
      request(server)
        .get(`/farms/${farm.farmId}/market/listings`)
        .set(auth(farm.ownerToken))
        .expect(200);

    const first = await publishEggs();
    // Warm-up so one-off work (caches, lazy rows) is not counted.
    await catalogue();
    await farmList();
    const catOne = await countQueries(catalogue);
    const listOne = await countQueries(farmList);
    const ids = [first];
    for (let i = 0; i < 5; i++) ids.push(await publishEggs());
    const catSix = await countQueries(catalogue);
    const listSix = await countQueries(farmList);

    const cat = (await catalogue()).body.items as Array<{
      id: string;
      availableQuantity: number;
    }>;
    expect(cat.map((i) => i.id).sort()).toEqual([...ids].sort());
    // 300 eggs = 10 trays per lot, 5 published each.
    for (const item of cat) expect(item.availableQuantity).toBe(5);
    const mine = (await farmList()).body as Array<{
      id: string;
      availableQuantity: number;
    }>;
    expect(mine).toHaveLength(6);
    for (const item of mine) expect(item.availableQuantity).toBe(5);

    // eslint-disable-next-line no-console
    console.log(
      `[perf8] market: catalogue 1=${catOne} 6=${catSix} | fermes 1=${listOne} 6=${listSix}`,
    );
    expect(catSix - catOne).toBeLessThanOrEqual(2);
    expect(listSix - listOne).toBeLessThanOrEqual(2);
  }, 240_000);

  it('journal : limit/offset optionnels, sans parametre la reponse reste entiere', async () => {
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme journal ${letters()}`,
      provinceCode: 'G1',
    });
    for (let i = 0; i < 4; i++) {
      await request(server)
        .post(`/farms/${farm.farmId}/accounting/entries`)
        .set(auth(farm.ownerToken))
        .send({
          date: day(0),
          label: `Regul ${i}`,
          lines: [
            { account: '6011', debitFcfa: 100 + i },
            { account: '471', creditFcfa: 100 + i },
          ],
        })
        .expect(201);
    }
    const get = (query = '') =>
      request(server)
        .get(`/farms/${farm.farmId}/accounting/journal${query}`)
        .set(auth(farm.ownerToken));

    const all = (await get().expect(200)).body as {
      entries: Array<{ id: string }>;
      totals: { debit: number; credit: number };
    };
    expect(all.entries.length).toBeGreaterThanOrEqual(4);

    const page = (await get('?limit=2&offset=1').expect(200)).body as typeof all;
    expect(page.entries.map((e) => e.id)).toEqual(
      all.entries.slice(1, 3).map((e) => e.id),
    );
    // The totals describe the whole period, whatever the page.
    expect(page.totals).toEqual(all.totals);

    const tail = (await get('?offset=3').expect(200)).body as typeof all;
    expect(tail.entries.map((e) => e.id)).toEqual(
      all.entries.slice(3).map((e) => e.id),
    );
    await get('?limit=abc').expect(400);
    await get('?limit=0').expect(400);

    // Grand livre still answers (Map lookup of the balances).
    const livre = await request(server)
      .get(`/farms/${farm.farmId}/accounting/grand-livre`)
      .set(auth(farm.ownerToken))
      .expect(200);
    const compte = (livre.body as Array<{ account: string; label: string | null }>).find(
      (g) => g.account === '6011',
    );
    expect(compte).toBeDefined();
  }, 120_000);

  it('dashboard ferme : plus de requete par lot pondeuse', async () => {
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme dash perf ${letters()}`,
      provinceCode: 'G1',
    });
    const dash = () =>
      request(server)
        .get(`/farms/${farm.farmId}/dashboard`)
        .set(auth(farm.ownerToken))
        .expect(200);

    for (let i = 0; i < 6; i++) await openLayerLot(farm);
    // Two warm-ups: the first raises the "saisie manquante" alert, the second
    // rewrites it; afterwards the alert work is the same for any lot count.
    await dash();
    await dash();
    const six = await countQueries(dash);
    for (let i = 0; i < 5; i++) await openLayerLot(farm);
    await dash();
    const eleven = await countQueries(dash);

    // eslint-disable-next-line no-console
    console.log(`[perf8] dashboard: 6 lots=${six} 11 lots=${eleven}`);
    expect(eleven - six).toBeLessThanOrEqual(1);
  }, 240_000);
});
