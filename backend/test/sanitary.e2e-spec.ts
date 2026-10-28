import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('Module 2 — Sanitaire & Prophylaxie (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let farmId: string;

  const ownerPhone = `+24180${Date.now()}`;

  async function createBatch(integrationDate: string) {
    const res = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: `Lot Sanitaire ${Date.now()}`,
        integrationDate,
        quantityAtStart: 500,
        type: 'CHAIR',
      })
      .expect(201);
    return res.body.id;
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
      .send({
        phone: ownerPhone,
        fullName: 'Proprio Sanitaire',
        code: 'secret123',
      })
      .expect(201);
    const login = await request(server)
      .post('/auth/login')
      .send({ phone: ownerPhone, code: 'secret123' })
      .expect(201);
    token = login.body.accessToken;

    const farm = await request(server)
      .post('/farms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Ferme Sanitaire ${Date.now()}`,
        administrativeCity: 'Ntoum',
        capacityPerBuilding: 1000,
      })
      .expect(201);
    farmId = farm.body.id;
  });

  it('seed : les protocoles sanitaires par défaut sont disponibles (chair + pondeuse)', async () => {
    const chair = await request(server)
      .get(`/sanitary/protocols?species=POULET&type=CHAIR`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defaultChair = chair.body.find(
      (p: any) => p.code === 'proto-poulet-chair-standard',
    );
    expect(defaultChair).toBeTruthy();
    expect(defaultChair.isDefault).toBe(true);

    const detail = await request(server)
      .get(`/sanitary/protocols/${defaultChair.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.steps.length).toBeGreaterThan(0);
    expect(detail.body.steps[0].careType).toBe('VACCIN');
  });

  it('génère le calendrier prophylactique automatiquement à partir de la date d’arrivée', async () => {
    const today = daysAgo(0);
    const batchId = await createBatch(today);
    const res = await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/prophylaxis/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    const events = res.body;
    expect(events.length).toBeGreaterThanOrEqual(1);
    const marek = events.find(
      (e: any) => e.careType === 'VACCIN' && e.name.includes('Marek'),
    );
    expect(marek).toBeTruthy();
    expect(marek.scheduledDate).toBe(today);
    expect(marek.status).toBe('PLANIFIE');
  });

  it('répète la génération sans dupliquer les soins (idempotent)', async () => {
    const batchId = await createBatch(daysAgo(0));
    await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/prophylaxis/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    const second = await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/prophylaxis/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    const first = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}/prophylaxis`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(second.body.length).toBe(first.body.length);
  });

  it('marque un soin réalisé (FAIT) et l’exclut du retard', async () => {
    const batchId = await createBatch(daysAgo(0));
    const generated = await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/prophylaxis/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    const marek = generated.body.find((e: any) => e.name.includes('Marek'));

    const done = await request(server)
      .post(
        `/farms/${farmId}/batches/${batchId}/prophylaxis/${marek.id}/complete`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Vaccin réalisé avec succès' })
      .expect(201);
    expect(done.body.status).toBe('FAIT');
    expect(done.body.performedNotes).toBe('Vaccin réalisé avec succès');

    const list = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}/prophylaxis`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const marekAfter = list.body.find((e: any) => e.id === marek.id);
    expect(marekAfter.status).toBe('FAIT');
  });

  it('soins en retard → alerte PROPHYLAXIE ROUGE, résolue après complétion', async () => {
    const batchId = await createBatch(daysAgo(20));
    await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/prophylaxis/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    const alerts = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const prophyl = alerts.body.find(
      (a: any) => a.kind === 'PROPHYLAXIE' && a.batchId === batchId,
    );
    expect(prophyl).toBeTruthy();
    expect(prophyl.level).toBe('ROUGE');

    const events = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}/prophylaxis`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const overdue = events.body.filter((e: any) => e.status === 'EN_RETARD');
    expect(overdue.length).toBeGreaterThan(0);

    for (const e of overdue) {
      await request(server)
        .post(
          `/farms/${farmId}/batches/${batchId}/prophylaxis/${e.id}/complete`,
        )
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(201);
    }
    const after = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const stillRed = after.body.some(
      (a: any) =>
        a.kind === 'PROPHYLAXIE' &&
        a.status === 'ACTIVE' &&
        a.level === 'ROUGE' &&
        a.batchId === batchId,
    );
    expect(stillRed).toBe(false);
  });

  it('traitement antibiotique → alerte DELAI_ATTENTE (commercialisation suspendue)', async () => {
    const batchId = await createBatch(daysAgo(0));
    const treatment = await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/treatments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        careType: 'ANTIBIOTIQUE',
        productName: 'Amoxicilline 20%',
        dosage: '1 g/L d’eau',
        route: 'Eau de boisson',
        withdrawalDays: 30,
      })
      .expect(201);
    expect(treatment.body.withdrawalEndDate).toBeTruthy();
    expect(treatment.body.performedById).toBeTruthy();

    const alerts = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const dela = alerts.body.find(
      (a: any) =>
        a.kind === 'DELAI_ATTENTE' &&
        a.status === 'ACTIVE' &&
        a.batchId === batchId,
    );
    expect(dela).toBeTruthy();
    expect(dela.level).toBe('ROUGE');
    expect(dela.message).toContain(treatment.body.withdrawalEndDate);
  });

  it('délai d’attente expiré → aucune alerte DELAI_ATTENTE (déjà purgée)', async () => {
    const batchId = await createBatch(daysAgo(0));
    await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/treatments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        careType: 'ANTIBIOTIQUE',
        productName: 'Tylosine',
        administeredAt: new Date(Date.now() - 10 * 86400000).toISOString(),
        withdrawalDays: 1,
      })
      .expect(201);
    const alerts = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const active = alerts.body.some(
      (a: any) =>
        a.kind === 'DELAI_ATTENTE' &&
        a.status === 'ACTIVE' &&
        a.batchId === batchId,
    );
    expect(active).toBe(false);
  });

  it('protocole personnalisé : compléter un soin antibiotique enregistre le traitement HACCP', async () => {
    const protocol = await request(server)
      .post('/sanitary/protocols')
      .set('Authorization', `Bearer ${token}`)
      .send({
        farmId,
        name: 'Protocole test antibio',
        species: 'POULET',
        type: 'CHAIR',
        steps: [
          {
            stepOrder: 1,
            dayFrom: 0,
            dayTo: 0,
            careType: 'ANTIBIOTIQUE',
            name: 'Antibiotique préventif',
            dosage: '1 mL/L',
            route: 'Eau de boisson',
            withdrawalDays: 3,
          },
        ],
      })
      .expect(201);
    expect(protocol.body.code).toMatch(/^custom-/);

    const batchId = await createBatch(daysAgo(0));
    const generated = await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/prophylaxis/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ protocolId: protocol.body.id })
      .expect(201);
    const event = generated.body[0];

    await request(server)
      .post(
        `/farms/${farmId}/batches/${batchId}/prophylaxis/${event.id}/complete`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    const treatments = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}/treatments`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const auto = treatments.body.find(
      (t: any) => t.productName === 'Antibiotique préventif',
    );
    expect(auto).toBeTruthy();
    expect(auto.withdrawalDays).toBe(3);
  });

  afterAll(async () => {
    await app.close();
  });
});
