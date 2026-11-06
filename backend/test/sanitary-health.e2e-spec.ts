import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DataSource } from 'typeorm';
import {
  createPlatformAdmin,
  createProgrammeFarm,
} from './helpers/programme-farm.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('Sanitaire — Santé & événements sanitaires (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let eleveurToken: string;
  let otherToken: string;
  let farmId: string;
  let batchId: string;
  let eventId: string;

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
      name: `Ferme Santé ${Date.now()}`,
    });
    token = farm.ownerToken;
    farmId = farm.farmId;
    const eleveurPhone = `+24171${Date.now()}`;
    await request(server)
      .post(`/farms/${farmId}/eleveurs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Eleveur Santé',
        phone: eleveurPhone,
        email: `eleveur.sante.${Date.now()}@e2e.ga`,
        code: 'secret123',
      })
      .expect(201);
    const eleveurLogin = await request(server)
      .post('/auth/login')
      .send({ phone: eleveurPhone, code: 'secret123' })
      .expect(201);
    eleveurToken = eleveurLogin.body.accessToken;

    otherToken = (await createProgrammeFarm(server, admin.token)).ownerToken;

    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Lot santé',
        integrationDate: today(),
        quantityAtStart: 300,
        type: 'CHAIR',
        couvoirSupplier: 'Canabec',
        chickLotNumber: `CL-${Date.now()}`,
        hatchDate: today(),
      })
      .expect(201);
    batchId = batch.body.id;
  });

  it('agrégat santé : métriques, score, conseils et tendances', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}/health`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.batchId).toBe(batchId);
    expect(res.body.quantityAtStart).toBe(300);
    expect(res.body.liveCount).toBe(300);
    expect(res.body.totalDeaths).toBe(0);
    expect(res.body.mortalityPercent).toBe(0);
    expect(res.body.viabilityPercent).toBe(100);
    expect(res.body.healthScore).toBeGreaterThanOrEqual(0);
    expect(res.body.healthScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(res.body.tips)).toBe(true);
    expect(Array.isArray(res.body.check.insights)).toBe(true);
    expect(Array.isArray(res.body.check.advice)).toBe(true);
    expect(res.body.trends.dates.length).toBe(7);
    expect(res.body.trends.mortality.length).toBe(7);
    expect(res.body.trends.eggs.length).toBe(7);
  });

  it('liste des événements vide au départ', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}/health-events`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('créer un événement MALADIE → statut OUVERT', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/health-events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'MALADIE',
        occurredAt: today(),
        severity: 'JAUNE',
        title: 'Symptômes respiratoires',
        description: 'Éternuements et faible appétit observés.',
        symptoms: 'Toux, écoulement nasal',
      })
      .expect(201);
    expect(res.body.kind).toBe('MALADIE');
    expect(res.body.status).toBe('OUVERT');
    expect(res.body.quantity).toBe(0);
    eventId = res.body.id;
  });

  it('résoudre un événement → statut RESOLU', async () => {
    const res = await request(server)
      .patch(
        `/farms/${farmId}/batches/${batchId}/health-events/${eventId}/resolve`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.status).toBe('RESOLU');
    expect(res.body.resolvedAt).toBe(today());
  });

  it('événement MALADIE enrichi (maladie, sévérité, symptômes, traitement, vétérinaire) → OUVERT', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/health-events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'MALADIE',
        occurredAt: today(),
        diseaseSeverity: 'CRITICAL',
        title: 'Newcastle disease',
        disease: 'Newcastle disease',
        symptoms: 'Détresse respiratoire, Morts brutales',
        treatmentGiven: 'Aucun traitement disponible',
        vetConsulted: true,
        vetName: 'Dr OBIANG',
        notes: 'Quarantaine renforcée.',
      })
      .expect(201);
    expect(res.body.kind).toBe('MALADIE');
    expect(res.body.disease).toBe('Newcastle disease');
    expect(res.body.diseaseSeverity).toBe('CRITICAL');
    expect(res.body.severity).toBe('ROUGE');
    expect(res.body.treatmentGiven).toBe('Aucun traitement disponible');
    expect(res.body.vetConsulted).toBe(true);
    expect(res.body.vetName).toBe('Dr OBIANG');
    expect(res.body.symptoms).toContain('Morts brutales');
    expect(res.body.status).toBe('OUVERT');
  });

  it('événement MALADIE avec resolved:true → créé directement RESOLU', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/health-events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'MALADIE',
        occurredAt: today(),
        diseaseSeverity: 'LOW',
        title: 'Coccidiose résolue',
        disease: 'Coccidiose',
        symptoms: 'Diarrhée',
        treatmentGiven: 'Anticoccidien dans l’eau de boisson',
        vetConsulted: false,
        resolved: true,
      })
      .expect(201);
    expect(res.body.status).toBe('RESOLU');
    expect(res.body.resolvedAt).toBe(today());
    expect(res.body.severity).toBe('VERT');
    expect(res.body.vetConsulted).toBe(false);
  });

  it('réforme (REFORME) : décrémente le cheptel vivant', async () => {
    const before = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const beforeLive = before.body.quantityAlive;

    await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/health-events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'REFORME',
        occurredAt: today(),
        severity: 'ROUGE',
        quantity: 12,
        title: 'Réforme sanitaire d’oiseaux affaiblis',
      })
      .expect(201);

    const after = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.quantityAlive).toBe(beforeLive - 12);
  });

  it('réforme supérieure à l’effectif vivant → 400', async () => {
    await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/health-events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'REFORME',
        occurredAt: today(),
        severity: 'ROUGE',
        quantity: 999999,
        title: 'Réforme impossible',
      })
      .expect(400);
  });

  it('mortalité (MORTALITE) : décrémente le cheptel vivant', async () => {
    const before = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const beforeLive = before.body.quantityAlive;

    await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/health-events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'MORTALITE',
        occurredAt: today(),
        severity: 'ROUGE',
        quantity: 8,
        title: 'Pic de mortalité subit',
        description: 'Morts brutales observées à l’aube.',
      })
      .expect(201);

    const after = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.quantityAlive).toBe(beforeLive - 8);
  });

  it('mortalité supérieure à l’effectif vivant → 400', async () => {
    await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/health-events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'MORTALITE',
        occurredAt: today(),
        severity: 'ROUGE',
        quantity: 999999,
        title: 'Mortalité impossible',
      })
      .expect(400);
  });

  it('validation DTO : titre manquant ou gravité invalide → 400', async () => {
    await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/health-events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'MALADIE',
        occurredAt: today(),
        severity: 'JAUNE',
        title: '',
      })
      .expect(400);
    await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/health-events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'MALADIE',
        occurredAt: today(),
        severity: 'BLEU',
        title: 'x',
      })
      .expect(400);
  });

  it('un Éleveur de la ferme peut lire et créer, mais pas supprimer (403)', async () => {
    await request(server)
      .get(`/farms/${farmId}/batches/${batchId}/health`)
      .set('Authorization', `Bearer ${eleveurToken}`)
      .expect(200);

    const created = await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/health-events`)
      .set('Authorization', `Bearer ${eleveurToken}`)
      .send({
        kind: 'SYMPTOME',
        occurredAt: today(),
        severity: 'VERT',
        title: 'Observation mineure',
      })
      .expect(201);

    await request(server)
      .delete(
        `/farms/${farmId}/batches/${batchId}/health-events/${created.body.id}`,
      )
      .set('Authorization', `Bearer ${eleveurToken}`)
      .expect(403);
  });

  it('le propriétaire peut supprimer un événement REFORME → réintègre l’effectif', async () => {
    const list = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}/health-events`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const refor = (list.body as any[]).find((e) => e.kind === 'REFORME');
    expect(refor).toBeDefined();

    const before = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const beforeLive = before.body.quantityAlive;

    await request(server)
      .delete(`/farms/${farmId}/batches/${batchId}/health-events/${refor.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const after = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.quantityAlive).toBe(beforeLive + refor.quantity);
  });

  it('supprimer un événement MORTALITE → réintègre l’effectif', async () => {
    const list = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}/health-events`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const mort = (list.body as any[]).find((e) => e.kind === 'MORTALITE');
    expect(mort).toBeDefined();

    const before = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const beforeLive = before.body.quantityAlive;

    await request(server)
      .delete(`/farms/${farmId}/batches/${batchId}/health-events/${mort.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const after = await request(server)
      .get(`/farms/${farmId}/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.quantityAlive).toBe(beforeLive + mort.quantity);
  });

  it('autre ferme (visibilité) → 404', async () => {
    await request(server)
      .get(`/farms/${farmId}/batches/${batchId}/health`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });
});
