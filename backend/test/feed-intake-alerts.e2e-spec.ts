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

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

interface AlertRow {
  batchId: string | null;
  kind: string;
  level: string;
  status: string;
  message: string;
}

/**
 * Feed intake alerts (jury lot 2): a drop of the day's feed per bird versus
 * the previous 3 days raises CONSOMMATION_ALIMENT (ROUGE past 25 %), a normal
 * next day clears it. The band has no breed, so no standard is compared.
 */
describe('Alertes de consommation d’aliment (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ownerToken: string;
  let farmId: string;
  let batchId: string;

  const entry = (entryDate: string, feedQuantity: number) =>
    request(server)
      .post(`/farms/${farmId}/batches/${batchId}/daily-entries`)
      .set(auth(ownerToken))
      .send({
        entryDate,
        deaths: 0,
        feedQuantity,
        feedUnit: 'KG',
        feedType: 'CROISSANCE',
        waterL: 200,
      })
      .expect(201);

  async function feedAlerts(): Promise<AlertRow[]> {
    const res = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set(auth(ownerToken))
      .expect(200);
    return (res.body as AlertRow[]).filter(
      (a) =>
        a.batchId === batchId &&
        a.kind === 'CONSOMMATION_ALIMENT' &&
        a.status === 'ACTIVE',
    );
  }

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

    const admin = await createPlatformAdmin(server, app.get(DataSource));
    const farm = await createProgrammeFarm(server, admin.token, {
      name: `Ferme Aliment ${Date.now()}`,
    });
    ownerToken = farm.ownerToken;
    farmId = farm.farmId;
    const band = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set(auth(ownerToken))
      .send({
        batchName: `Bande aliment ${Date.now()}`,
        integrationDate: daysAgo(30),
        quantityAtStart: 1000,
        type: 'CHAIR',
      })
      .expect(201);
    batchId = band.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('expose les nouveaux seuils proposés dans les constantes de référence', async () => {
    const res = await request(server)
      .get('/reference-constants')
      .set(auth(ownerToken))
      .expect(200);
    const byKey = new Map(
      (res.body as Array<{ key: string; value: number }>).map((c) => [
        c.key,
        c.value,
      ]),
    );
    expect(byKey.get('feed_drop_critical_pct')).toBeDefined();
    expect(byKey.get('feed_standard_deviation_warn_pct')).toBeDefined();
    expect(byKey.get('thi_prudence')).toBeDefined();
    expect(byKey.get('thi_danger')).toBeDefined();
  });

  it('trois jours normaux : aucune alerte ; −30 % d’aliment : alerte ROUGE ; jour normal : résolue', async () => {
    await entry(daysAgo(6), 400);
    await entry(daysAgo(5), 400);
    await entry(daysAgo(4), 400);
    expect(await feedAlerts()).toEqual([]);

    // 280 kg for 1000 birds = −30 % vs the 400 kg of the 3 previous days.
    await entry(daysAgo(3), 280);
    const raised = await feedAlerts();
    expect(raised).toHaveLength(1);
    expect(raised[0]!.level).toBe('ROUGE');
    expect(raised[0]!.message).toMatch(/aliment/i);

    await entry(daysAgo(2), 400);
    expect(await feedAlerts()).toEqual([]);
  });
});
