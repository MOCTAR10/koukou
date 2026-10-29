import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

function dayOffset(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

describe('Revue de bugs 2 : intrants, parcelles, tâches, dépenses (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  const stamp = Date.now();
  let token = '';
  let farmId = '';

  const phone = (n: number) => `+2417${n}${String(stamp).slice(-7)}`;
  const owner = () => ({
    get: (url: string) =>
      request(server).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) =>
      request(server).post(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) =>
      request(server).patch(url).set('Authorization', `Bearer ${token}`),
  });

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
      .send({ phone: phone(1), fullName: 'Proprio Revue 2', code: 'secret123' })
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
          name: `Ferme Revue 2 ${stamp}`,
          administrativeCity: 'Libreville',
          capacityPerBuilding: 1000,
        })
        .expect(201)
    ).body.id;
  }, 180000);

  afterAll(async () => {
    await app.close();
  });

  it('intrants : réception future ou provende à quantité nulle refusées', async () => {
    const base = {
      kind: 'ALIMENT',
      foodType: 'DEMARRAGE',
      productName: 'Provende Démarrage',
      supplier: 'CEAG',
      unit: 'SAC',
    };
    await owner()
      .post(`/farms/${farmId}/inputs`)
      .send({
        ...base,
        supplierLotNumber: `F${stamp}`,
        quantity: 10,
        receivedDate: dayOffset(5),
      })
      .expect(400);
    await owner()
      .post(`/farms/${farmId}/inputs`)
      .send({ ...base, supplierLotNumber: `Z${stamp}`, quantity: 0 })
      .expect(400);
    await owner()
      .post(`/farms/${farmId}/inputs`)
      .send({ ...base, supplierLotNumber: `OK${stamp}`, quantity: 10 })
      .expect(201);
  });

  it('parcelle : contour invalide refusé, nouveau contour → surface recalculée', async () => {
    const cultures = (
      await owner().get(`/cultures?farmId=${farmId}`).expect(200)
    ).body;
    expect(cultures.length).toBeGreaterThan(0);
    const created = await owner()
      .post(`/farms/${farmId}/parcelles`)
      .send({ name: 'Parcelle contour', cultureId: cultures[0].id, areaHa: 1 })
      .expect(201);

    await owner()
      .patch(`/farms/${farmId}/parcelles/${created.body.id}`)
      .send({
        boundaryGeoJson: {
          type: 'Polygon',
          coordinates: [
            [
              [9, 0],
              [9, 200],
              [9.1, 0.1],
              [9, 0],
            ],
          ],
        },
      })
      .expect(400);

    // ~200 m × 200 m ≈ 4 ha, sent without any areaHa.
    const updated = await owner()
      .patch(`/farms/${farmId}/parcelles/${created.body.id}`)
      .send({
        boundaryGeoJson: {
          type: 'Polygon',
          coordinates: [
            [
              [9.4, 0.4],
              [9.4, 0.401798],
              [9.401798, 0.401798],
              [9.401798, 0.4],
              [9.4, 0.4],
            ],
          ],
        },
      })
      .expect(200);
    expect(updated.body.areaHa).toBeGreaterThan(3.5);
    expect(updated.body.areaHa).toBeLessThan(4.5);
  });

  it('tâches : un membre suspendu ne peut pas être assigné', async () => {
    const member = await owner()
      .post(`/farms/${farmId}/eleveurs`)
      .send({
        phone: phone(2),
        fullName: 'Éleveur Suspendu',
        code: 'secret456',
      })
      .expect(201);
    await owner()
      .patch(`/farms/${farmId}/eleveurs/${member.body.employment.id}`)
      .send({ active: false })
      .expect(200);
    await owner()
      .post(`/farms/${farmId}/tasks`)
      .send({
        title: 'Tâche pour suspendu',
        dueDate: '2099-01-01',
        assigneeId: member.body.user.id,
      })
      .expect(400);
  });

  it('dépense : un champ vidé en modification est effacé', async () => {
    const created = await owner()
      .post(`/farms/${farmId}/expenses`)
      .send({
        category: 'TRANSPORT',
        amountFcfa: 5000,
        label: 'Transport',
        supplier: 'Taxi Owendo',
        notes: 'Aller-retour',
      })
      .expect(201);
    const updated = await owner()
      .patch(`/farms/${farmId}/expenses/${created.body.id}`)
      .send({ supplier: '', notes: '  ' })
      .expect(200);
    expect(updated.body.supplier).toBeNull();
    expect(updated.body.notes).toBeNull();
    expect(updated.body.label).toBe('Transport');
  });
});
