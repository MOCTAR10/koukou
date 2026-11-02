import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

function dayOffset(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

describe('Revue de bugs 3 : saisies, abattage, commandes, sanitaire, comptes (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  const stamp = Date.now();
  let token = '';
  let farmId = '';

  const digits = String(stamp).slice(-7);
  const phone = (n: number) => `+2416${n}${digits}`;
  const owner = () => ({
    get: (url: string) =>
      request(server).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) =>
      request(server).post(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) =>
      request(server).patch(url).set('Authorization', `Bearer ${token}`),
  });
  async function createBatch(extra: Record<string, unknown> = {}) {
    const res = await owner()
      .post(`/farms/${farmId}/batches`)
      .send({
        batchName: `Lot ${Math.random().toString(36).slice(2, 7)}`,
        integrationDate: dayOffset(-10),
        quantityAtStart: 100,
        type: 'CHAIR',
        ...extra,
      })
      .expect(201);
    return res.body as { id: string };
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

    await request(server)
      .post('/auth/register')
      .send({ phone: phone(1), fullName: 'Proprio Revue 3', code: 'secret123' })
      .expect(201);
    token = (
      await request(server)
        .post('/auth/login')
        .send({ phone: phone(1), code: 'secret123' })
        .expect(201)
    ).body.accessToken;
    farmId = (
      await owner()
        .post('/farms')
        .send({
          name: `Ferme Revue 3 ${stamp}`,
          administrativeCity: 'Libreville',
          capacityPerBuilding: 1000,
        })
        .expect(201)
    ).body.id;
  }, 180000);

  afterAll(async () => {
    await app.close();
  });

  it('saisie du jour : date future, avant la mise en place ou trop de morts refusées', async () => {
    const lot = await createBatch();
    const url = `/farms/${farmId}/batches/${lot.id}/daily-entries`;
    await owner()
      .post(url)
      .send({ entryDate: dayOffset(5), waterL: 10 })
      .expect(400);
    await owner()
      .post(url)
      .send({ entryDate: dayOffset(-20), waterL: 10 })
      .expect(400);
    await owner()
      .post(url)
      .send({ entryDate: dayOffset(-1), deaths: 150 })
      .expect(400);
    // An empty lot id means "none", not a 500.
    await owner()
      .post(url)
      .send({ entryDate: dayOffset(-1), deaths: 2, inputLotId: '' })
      .expect(201);
  });

  it('abattage : après envoi, le nombre d’oiseaux n’est plus modifiable', async () => {
    const lot = await createBatch();
    const order = await owner()
      .post(`/farms/${farmId}/slaughter-orders`)
      .send({
        batchId: lot.id,
        slaughterType: 'VIVANT',
        destination: 'EXTERNE',
        plannedDate: dayOffset(0),
        birdCount: 10,
      })
      .expect(201);
    const url = `/farms/${farmId}/slaughter-orders/${order.body.id}`;
    await owner().post(`${url}/send`).send({}).expect(201);
    await owner().patch(url).send({ birdCount: 60 }).expect(400);
    const notes = await owner()
      .patch(url)
      .send({ abattoirNotes: 'Camion 2' })
      .expect(200);
    expect(notes.body.status).toBe('SENT');
  });

  it('commande d’œufs : plusieurs lignes vérifiées ensemble contre le stock', async () => {
    const lot = await createBatch({ type: 'PONDEUSE' });
    // 450 eggs = 15 alvéoles.
    await owner()
      .post(`/farms/${farmId}/batches/${lot.id}/daily-entries`)
      .send({ entryDate: dayOffset(-1), eggsCollected: 450, eggsSellable: 450 })
      .expect(201);
    const line = {
      productType: 'OEUFS',
      quantity: 10,
      unit: 'ALVEOLES',
      unitPriceFcfa: 3000,
      batchId: lot.id,
    };
    await owner()
      .post(`/farms/${farmId}/orders`)
      .send({ canal: 'FERME', items: [line, line] })
      .expect(400);
    const ok = await owner()
      .post(`/farms/${farmId}/orders`)
      .send({ canal: 'FERME', items: [line] })
      .expect(201);
    // The egg line keeps its batch.
    expect(ok.body.items[0].batchId).toBe(lot.id);
  });

  it('sanitaire : un soin annulé ne peut être ni complété ni reporté', async () => {
    const lot = await createBatch();
    const name = `Vaccin annulé ${stamp}`;
    await owner()
      .post(`/farms/${farmId}/vaccine-schedules/manual`)
      .send({
        lotIds: [lot.id],
        careType: 'VACCIN',
        name,
        scheduledDate: dayOffset(1),
      })
      .expect(201);
    const base = `/farms/${farmId}/batches/${lot.id}/prophylaxis`;
    const events = (await owner().get(base).expect(200)).body;
    const event = events.find((e: any) => e.name === name);
    expect(event).toBeDefined();
    await owner().post(`${base}/${event.id}/cancel`).send({}).expect(201);
    await owner().post(`${base}/${event.id}/complete`).send({}).expect(400);
    await owner()
      .patch(`${base}/${event.id}`)
      .send({ scheduledDate: dayOffset(2) })
      .expect(400);
  });

  it('alertes : un statut inconnu est refusé (400, pas 500)', async () => {
    await owner().get(`/farms/${farmId}/alerts?status=NIMPORTE`).expect(400);
  });

  it('comptes : le numéro est normalisé (espaces, tirets)', async () => {
    const spaced = `+241 6 9-${digits.slice(0, 3)} ${digits.slice(3)}`;
    const compact = `+24169${digits}`;
    await request(server)
      .post('/auth/register')
      .send({ phone: spaced, fullName: 'Client Espacé', code: 'secret123' })
      .expect(201);
    await request(server)
      .post('/auth/login')
      .send({ phone: compact, code: 'secret123' })
      .expect(201);
    await request(server)
      .post('/auth/register')
      .send({ phone: compact, fullName: 'Doublon', code: 'secret123' })
      .expect(409);
  });
});
