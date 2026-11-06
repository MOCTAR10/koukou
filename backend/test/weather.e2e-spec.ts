import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DataSource } from 'typeorm';
import {
  addProgrammeFarm,
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
} from './helpers/programme-farm.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function dailyCard(tempC: number, humidityPct: number) {
  const time = Array.from({ length: 7 }, (_, i) =>
    dateStr(addDays(new Date(), i)),
  );
  return json({
    daily: {
      time,
      temperature_2m_max: Array(7).fill(tempC),
      relative_humidity_2m_max: Array(7).fill(humidityPct),
    },
  });
}

const installWeatherMock = () => {
  const mock = async (input: RequestInfo | URL): Promise<Response> => {
    const u = String(input);
    if (u.includes('geocoding-api.open-meteo.com')) {
      return json({
        results: [{ latitude: 0.39, longitude: 9.45, name: 'Libreville' }],
      });
    }
    if (u.includes('api.open-meteo.com')) {
      const lat = new URL(u).searchParams.get('latitude');
      if (lat === '1') return dailyCard(28, 80); // THI ~79.7 → MODERE (JAUNE)
      if (lat === '2') return dailyCard(25, 60); // THI ~72.8 → CONFORT
      return dailyCard(36, 90); // THI ~94.7 → DANGER (ROUGE)
    }
    return new Response('{}', { status: 404 });
  };
  globalThis.fetch = mock as typeof fetch;
};

describe('Météo & heat-stress (THI) (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let otherToken: string;
  let farmNoCoords: string;
  let farmModerate: string;
  let farmConfort: string;

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
    const owner = await createProgrammeFarm(server, admin.token, {
      name: `Ferme Météo A ${Date.now()}`,
    });
    token = owner.ownerToken;
    farmNoCoords = owner.farmId;
    // No GPS: the forecast geocodes the farm's city.
    await request(server)
      .patch(`/farms/${farmNoCoords}`)
      .set(auth(token))
      .send({ administrativeCity: 'Libreville' })
      .expect(200);

    otherToken = (await createProgrammeFarm(server, admin.token)).ownerToken;

    const create = async (name: string, latitude: number) =>
      (
        await addProgrammeFarm(server, admin.token, owner.ownerPhone, {
          name: `${name} ${Date.now()}`,
          extra: { gps: { latitude, longitude: 9.7 } },
        })
      ).farmId;
    farmModerate = await create('Ferme Météo B', 1);
    farmConfort = await create('Ferme Météo C', 2);

    installWeatherMock();
  });

  it('ferme sans coordonnées → géocodage + prévision DANGER → alerte HEAT ROUGE', async () => {
    const res = await request(server)
      .get(`/farms/${farmNoCoords}/weather`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.available).toBe(true);
    expect(res.body.source).toBe('PREVISION');
    expect(res.body.latitude).toBe(0.39);
    expect(res.body.longitude).toBe(9.45);
    expect(res.body.forecast).toHaveLength(7);
    expect(res.body.today.tempC).toBe(36);
    expect(res.body.today.humidityPct).toBe(90);
    expect(res.body.today.thi).toBeGreaterThan(88);
    expect(res.body.today.zone).toBe('DANGER');
    expect(res.body.today.level).toBe('ROUGE');

    const alerts = await request(server)
      .get(`/farms/${farmNoCoords}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const heat = alerts.body.find(
      (a: { kind: string; status: string }) =>
        a.kind === 'HEAT' && a.status === 'ACTIVE',
    );
    expect(heat).toBeTruthy();
    expect(heat.level).toBe('ROUGE');
    expect(heat.batchId).toBeNull();
  });

  it('dashboard : bloc météo présent (zone DANGER), le score reste exploitable', async () => {
    await request(server)
      .post(`/farms/${farmNoCoords}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Bande météo',
        integrationDate: today(),
        quantityAtStart: 100,
        type: 'CHAIR',
      })
      .expect(201);
    const dash = await request(server)
      .get(`/farms/${farmNoCoords}/dashboard`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(dash.body.weather).toBeTruthy();
    expect(dash.body.weather.today.zone).toBe('DANGER');
    expect(typeof dash.body.health.score).toBe('number');
  });

  it('cache quotidien : 2ᵉ lecture sans re-fetch (source CACHE)', async () => {
    const res = await request(server)
      .get(`/farms/${farmNoCoords}/weather`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.source).toBe('CACHE');
    expect(res.body.today.zone).toBe('DANGER');
  });

  it('ferme B (coordonnées) → THI MODERE → alerte HEAT JAUNE', async () => {
    const res = await request(server)
      .get(`/farms/${farmModerate}/weather`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.available).toBe(true);
    expect(res.body.today.zone).toBe('MODERE');
    expect(res.body.today.level).toBe('JAUNE');

    const alerts = await request(server)
      .get(`/farms/${farmModerate}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const heat = alerts.body.find(
      (a: { kind: string; status: string }) =>
        a.kind === 'HEAT' && a.status === 'ACTIVE',
    );
    expect(heat).toBeTruthy();
    expect(heat.level).toBe('JAUNE');
  });

  it('ferme C → THI CONFORT → aucune alerte heat-stress active', async () => {
    const res = await request(server)
      .get(`/farms/${farmConfort}/weather`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.available).toBe(true);
    expect(res.body.today.zone).toBe('CONFORT');
    expect(res.body.today.level).toBeNull();

    const alerts = await request(server)
      .get(`/farms/${farmConfort}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      alerts.body.find(
        (a: { kind: string; status: string }) =>
          a.kind === 'HEAT' && a.status === 'ACTIVE',
      ),
    ).toBeFalsy();
  });

  it('accès : autre ferme → 403', async () => {
    await request(server)
      .get(`/farms/${farmNoCoords}/weather`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });

  afterAll(() => {
    globalThis.fetch = (
      globalThis as never as {
        __E2E_WEATHER_MOCK__: typeof fetch;
      }
    ).__E2E_WEATHER_MOCK__;
  });
});
