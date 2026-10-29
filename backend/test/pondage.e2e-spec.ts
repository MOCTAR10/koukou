import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

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

function mondayOfCurrentWeek(): Date {
  const now = new Date();
  const dow = (now.getUTCDay() + 6) % 7;
  const ws = new Date(now);
  ws.setUTCHours(12, 0, 0, 0);
  ws.setUTCDate(ws.getUTCDate() - dow);
  return ws;
}

describe('Pondage — indicateurs de ponte par lot (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let otherToken: string;
  let farmId: string;
  let batchId: string;

  let dayPrev1: string;
  let dayPrev2: string;
  let dayCurr1: string;
  let dayCurr2: string;

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

    const ws = mondayOfCurrentWeek();
    dayPrev1 = dateStr(addDays(ws, -7));
    dayPrev2 = dateStr(addDays(ws, -6));
    dayCurr1 = dateStr(ws);
    dayCurr2 = dateStr(addDays(ws, 1));

    const phone = `+24162${Date.now()}`;
    await request(server)
      .post('/auth/register')
      .send({
        phone,
        fullName: 'Proprio Ponte',
        code: 'secret123',
      })
      .expect(201);
    const login = await request(server)
      .post('/auth/login')
      .send({ phone, code: 'secret123' })
      .expect(201);
    token = login.body.accessToken;

    const farm = await request(server)
      .post('/farms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Ferme Ponte ${Date.now()}`,
        administrativeCity: 'Libreville',
        capacityPerBuilding: 1000,
      })
      .expect(201);
    farmId = farm.body.id;

    const otherPhone = `+24163${Date.now()}`;
    await request(server)
      .post('/auth/register')
      .send({
        phone: otherPhone,
        fullName: 'Autre Proprio',
        code: 'secret123',
      })
      .expect(201);
    const otherLogin = await request(server)
      .post('/auth/login')
      .send({ phone: otherPhone, code: 'secret123' })
      .expect(201);
    otherToken = otherLogin.body.accessToken;

    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Bande pondeuses',
        integrationDate: today(),
        quantityAtStart: 100,
        type: 'PONDEUSE',
      })
      .expect(201);
    batchId = batch.body.id;
  });

  const postEntry = (entryDate: string, eggs: Record<string, number>) =>
    request(server)
      .post(`/farms/${farmId}/batches/${batchId}/daily-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        entryDate,
        deaths: 1,
        ...eggs,
      })
      .expect(201);

  it('saisies de ponte sur deux semaines (jour + classe d’œufs)', async () => {
    await postEntry(dayPrev1, {
      eggsCollected: 80,
      eggsSellable: 60,
      eggsCracked: 5,
      eggsSmall: 5,
    });
    await postEntry(dayPrev2, {
      eggsCollected: 75,
      eggsSellable: 55,
      eggsCracked: 4,
      eggsSmall: 4,
    });
    await postEntry(dayCurr1, {
      eggsCollected: 60,
      eggsSellable: 45,
      eggsCracked: 4,
      eggsSmall: 3,
    });
    await postEntry(dayCurr2, {
      eggsCollected: 65,
      eggsSellable: 50,
      eggsCracked: 5,
      eggsSmall: 3,
    });
  });

  it('pondage : totaux par classe, œufs/poule, taux global', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}/pondage`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = res.body;
    expect(body.batchId).toBe(batchId);
    expect(body.type).toBe('PONDEUSE');
    expect(body.quantityAtStart).toBe(100);
    expect(body.quantityAlive).toBe(96);
    expect(body.totals).toEqual({
      collected: 280,
      sellable: 210,
      cracked: 18,
      small: 15,
    });
    expect(body.sellableRatioPercent).toBe(75);
    expect(body.eggsPerHen).toBe(2.8);
    // Average daily rate over the last 7 days with eggs (like the metrics),
    // never the lifetime total over today's hens (was 291.67 %).
    const since = new Date(Date.now() - 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const recent = [
      [dayPrev1, 80],
      [dayPrev2, 75],
      [dayCurr1, 60],
      [dayCurr2, 65],
    ].filter(([d]) => (d as string) >= since);
    const eggs = recent.reduce((s, [, n]) => s + (n as number), 0);
    const expected = Math.round(
      Math.min(100, (eggs / (96 * recent.length)) * 100) * 100,
    ) / 100;
    expect(body.layRatePercent).toBe(recent.length > 0 ? expected : null);
    expect(body.layRatePercent ?? 0).toBeLessThanOrEqual(100);
    expect(body.weekly).toHaveLength(2);
  });

  it('pondage : série hebdo chart-ready (taux de ponte par semaine)', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}/pondage`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const weekly = res.body.weekly as any[];

    const weekA = weekly.find((w) => w.weekStart === dayPrev1);
    const weekB = weekly.find((w) => w.weekStart === dayCurr1);

    expect(weekA).toBeTruthy();
    expect(weekA.collected).toBe(155);
    expect(weekA.sellable).toBe(115);
    expect(weekA.daysRecorded).toBe(2);
    expect(weekA.layRatePercent).toBe(77.5);

    expect(weekB).toBeTruthy();
    expect(weekB.collected).toBe(125);
    expect(weekB.sellable).toBe(95);
    expect(weekB.daysRecorded).toBe(2);
    expect(weekB.layRatePercent).toBe(63.78);
  });

  it('lot introuvable → 404 ; autre ferme → 403', async () => {
    await request(server)
      .get(
        `/farms/${farmId}/batches/00000000-0000-4000-8000-000000000000/pondage`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    await request(server)
      .get(`/farms/${farmId}/batches/${batchId}/pondage`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });
});
