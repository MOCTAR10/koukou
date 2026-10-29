import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('Revue de bugs : élevage, caisse, droits (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  const stamp = Date.now();
  let token = '';
  let farmId = '';
  let adminToken = '';
  let eleveurToken = '';

  const phone = (n: number) => `+2416${n}${String(stamp).slice(-7)}`;
  const login = async (p: string, code: string) =>
    (
      await request(server)
        .post('/auth/login')
        .send({ phone: p, code })
        .expect(201)
    ).body.accessToken as string;
  const as = (t: string) => ({
    get: (url: string) =>
      request(server).get(url).set('Authorization', `Bearer ${t}`),
    post: (url: string) =>
      request(server).post(url).set('Authorization', `Bearer ${t}`),
    patch: (url: string) =>
      request(server).patch(url).set('Authorization', `Bearer ${t}`),
    delete: (url: string) =>
      request(server).delete(url).set('Authorization', `Bearer ${t}`),
  });
  const owner = () => as(token);

  async function createBatch(quantityAtStart: number, extra = {}) {
    const res = await owner()
      .post(`/farms/${farmId}/batches`)
      .send({
        batchName: `Lot ${Math.random().toString(36).slice(2, 7)}`,
        integrationDate: today(),
        quantityAtStart,
        type: 'CHAIR',
        ...extra,
      })
      .expect(201);
    return res.body as { id: string; quantityAlive: number };
  }
  const batchOf = async (id: string) =>
    (await owner().get(`/farms/${farmId}/batches/${id}`).expect(200)).body;

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
      .send({ phone: phone(1), fullName: 'Proprio Revue', code: 'secret123' })
      .expect(201);
    token = await login(phone(1), 'secret123');
    farmId = (
      await owner()
        .post('/farms')
        .send({
          name: `Ferme Revue ${stamp}`,
          administrativeCity: 'Libreville',
          capacityPerBuilding: 1000,
        })
        .expect(201)
    ).body.id;

    await owner()
      .post(`/farms/${farmId}/eleveurs`)
      .send({
        phone: phone(2),
        fullName: 'Admin Boutique',
        code: 'secret456',
        role: 'ADMIN',
        permissions: ['pdv:gerer', 'equipe:gerer'],
      })
      .expect(201);
    adminToken = await login(phone(2), 'secret456');
    await owner()
      .post(`/farms/${farmId}/eleveurs`)
      .send({ phone: phone(3), fullName: 'Éleveur Terrain', code: 'secret789' })
      .expect(201);
    eleveurToken = await login(phone(3), 'secret789');
  }, 180000);

  afterAll(async () => {
    await app.close();
  });

  it('délai d’attente acquitté : l’envoi à l’abattage reste refusé', async () => {
    const batch = await createBatch(200);
    await owner()
      .post(`/farms/${farmId}/batches/${batch.id}/treatments`)
      .send({
        careType: 'ANTIBIOTIQUE',
        productName: 'Amoxicilline',
        withdrawalDays: 7,
      })
      .expect(201);
    const alerts = (await owner().get(`/farms/${farmId}/alerts`).expect(200))
      .body;
    const delai = alerts.find(
      (a: any) => a.batchId === batch.id && a.kind === 'DELAI_ATTENTE',
    );
    expect(delai).toBeDefined();
    await owner()
      .post(`/farms/${farmId}/alerts/${delai.id}/acknowledge`)
      .send({})
      .expect(201);

    const order = await owner()
      .post(`/farms/${farmId}/slaughter-orders`)
      .send({
        batchId: batch.id,
        slaughterType: 'VIVANT',
        destination: 'EXTERNE',
        plannedDate: today(),
        birdCount: 10,
      })
      .expect(201);
    const send = await owner()
      .post(`/farms/${farmId}/slaughter-orders/${order.body.id}/send`)
      .send({})
      .expect(400);
    expect(send.body.message).toContain('Délai d’attente');
  });

  it('lot : effectif vivant ≠ effectif de départ refusé, double clôture sans effet', async () => {
    await owner()
      .post(`/farms/${farmId}/batches`)
      .send({
        integrationDate: today(),
        quantityAtStart: 1000,
        quantityAlive: 900,
        type: 'CHAIR',
      })
      .expect(400);

    const batch = await createBatch(50);
    await owner()
      .post(`/farms/${farmId}/batches/${batch.id}/cloture`)
      .send({})
      .expect(201);
    const first = (await batchOf(batch.id)).closedAt;
    expect(first).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    await owner()
      .post(`/farms/${farmId}/batches/${batch.id}/cloture`)
      .send({})
      .expect(201);
    expect((await batchOf(batch.id)).closedAt).toBe(first);
  });

  it('mortalité déclarée puis supprimée : effectif recalculé, pas réajouté', async () => {
    const batch = await createBatch(100);
    const ev = await owner()
      .post(`/farms/${farmId}/batches/${batch.id}/health-events`)
      .send({
        kind: 'MORTALITE',
        occurredAt: today(),
        severity: 'ROUGE',
        quantity: 100,
        title: 'Mortalité massive',
      })
      .expect(201);
    expect((await batchOf(batch.id)).quantityAlive).toBe(0);
    await owner()
      .post(`/farms/${farmId}/batches/${batch.id}/daily-entries`)
      .send({ entryDate: today(), deaths: 10 })
      .expect(201);
    await owner()
      .delete(
        `/farms/${farmId}/batches/${batch.id}/health-events/${ev.body.id}`,
      )
      .expect(200);
    // 100 − 10 morts saisis = 90 (l'ancien calcul rajoutait 100 → 100).
    expect((await batchOf(batch.id)).quantityAlive).toBe(90);
  });

  it('bâtiment occupé : suppression refusée', async () => {
    const building = await owner()
      .post(`/farms/${farmId}/buildings`)
      .send({ name: `Bât ${stamp}`, buildingAreaM2: 100 })
      .expect(201);
    await createBatch(30, { buildingId: building.body.id });
    await owner()
      .delete(`/farms/${farmId}/buildings/${building.body.id}`)
      .expect(400);
  });

  it('caisse : seul l’écart avec la clôture précédente est un apport', async () => {
    await owner()
      .post(`/farms/${farmId}/caisse/open`)
      .send({ openingBalanceFcfa: 50000 })
      .expect(201);
    await owner()
      .post(`/farms/${farmId}/caisse/close`)
      .send({ declaredBalanceFcfa: 50000 })
      .expect(201);
    const second = await owner()
      .post(`/farms/${farmId}/caisse/open`)
      .send({ openingBalanceFcfa: 60000 })
      .expect(201);
    const journal = (
      await owner().get(`/farms/${farmId}/accounting/journal`).expect(200)
    ).body.entries as any[];
    const open2 = journal.find((e) => e.sourceId === `open:${second.body.id}`);
    expect(open2.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '571', debitFcfa: 10000 }),
        expect.objectContaining({ accountCode: '108', creditFcfa: 10000 }),
      ]),
    );
  });

  it('droits : rentabilité réservée à compta:rapports, points de vente ouverts à pdv:gerer', async () => {
    await as(eleveurToken)
      .get(`/farms/${farmId}/rentabilite/overview`)
      .expect(403);
    await owner().get(`/farms/${farmId}/rentabilite/overview`).expect(200);
    await as(adminToken)
      .post(`/farms/${farmId}/points-of-sale`)
      .send({ kind: 'BOUTIQUE', name: `Boutique ${stamp}` })
      .expect(201);
  });

  it('équipe : salaires masqués sans rh:lire, un admin ne peut pas suspendre un plus habilité', async () => {
    const head = await owner()
      .post(`/farms/${farmId}/eleveurs`)
      .send({
        phone: phone(4),
        fullName: 'Chef Admin',
        code: 'secret999',
        role: 'ADMIN',
        permissions: ['pdv:gerer', 'equipe:gerer', 'compta:rapports'],
        salaryFcfa: 250000,
      })
      .expect(201);
    const team = (
      await as(adminToken).get(`/farms/${farmId}/eleveurs`).expect(200)
    ).body;
    const seen = team.find((m: any) => m.id === head.body.employment.id);
    expect(seen.salaryFcfa).toBeNull();
    const full = (await owner().get(`/farms/${farmId}/eleveurs`).expect(200))
      .body;
    expect(
      full.find((m: any) => m.id === head.body.employment.id).salaryFcfa,
    ).toBe(250000);

    await as(adminToken)
      .patch(`/farms/${farmId}/eleveurs/${head.body.employment.id}`)
      .send({ active: false })
      .expect(403);
  });
});
