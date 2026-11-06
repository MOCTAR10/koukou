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

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

describe('Assistant — next-actions (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ownerToken: string;
  let foreignToken: string;
  let farmId: string;
  let batchId: string;
  let adminToken: string;

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
  });

  beforeAll(async () => {
    adminToken = (await createPlatformAdmin(server, app.get(DataSource))).token;
    // Utilisateur étranger (propriétaire d'une autre ferme) → doit recevoir un 403.
    foreignToken = (await createProgrammeFarm(server, adminToken)).ownerToken;
  });

  it('crée une ferme, un lot surdensitaire et un intrant proche de péremption', async () => {
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme E2E ${Date.now()}`,
    });
    ownerToken = farm.ownerToken;
    farmId = farm.farmId;

    // 2400 poussins / 40 m² → grille de surface par lot > critique (alerte SURDENSITE).
    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        batchName: 'Lot E2E NextActions',
        integrationDate: daysFromNow(-20),
        quantityAtStart: 2400,
        type: 'CHAIR',
        buildingAreaM2: 40,
      })
      .expect(201);
    batchId = batch.body.id;

    // Provende NON rattachée à un lot, expire dans 3 jours → alerte PEREMPTION niveau ferme.
    await request(server)
      .post(`/farms/${farmId}/inputs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        kind: 'ALIMENT',
        foodType: 'DEMARRAGE',
        productName: 'Provende Démarrage',
        supplier: 'CEAG',
        supplierLotNumber: `L${Date.now()}`,
        quantity: 50,
        unit: 'SAC',
        expirationDate: daysFromNow(3),
      })
      .expect(201);
  });

  it('next-actions : structure, décompte et ordre de priorité de la réponse', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/advisory/next-actions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const body = res.body;

    expect(body.farmId).toBe(farmId);
    expect(body.generatedAt).toBeTruthy();
    expect(Array.isArray(body.actions)).toBe(true);
    expect(body.summary.total).toBe(body.actions.length);
    expect(body.summary.total).toBe(
      body.summary.rouge + body.summary.jaune + body.summary.vert,
    );

    // Tri : ROUGE d'abord, puis JAUNE (respecter la priorité).
    const levels: string[] = body.actions.map((a: any) => a.level);
    const firstJaune = levels.indexOf('JAUNE');
    const rouges = levels.slice(
      0,
      firstJaune === -1 ? levels.length : firstJaune,
    );
    const jaunes = levels.slice(firstJaune === -1 ? 0 : firstJaune);
    expect(rouges.every((l) => l === 'ROUGE')).toBe(true);
    expect(jaunes.every((l) => l === 'JAUNE')).toBe(true);
  });

  it('next-actions : alerte SURDENSITÉ (ROUGE) et saisie du jour manquante (JAUNE) pour le lot', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/advisory/next-actions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const actions = res.body.actions;

    const surd = actions.find(
      (a: any) => a.category === 'ALERTE' && a.title.includes('oiseaux/m²'),
    );
    expect(surd).toBeTruthy();
    expect(surd.level).toBe('ROUGE');
    expect(surd.alertId).toBeTruthy();

    // Aucune saisie du jour → une action SAISIE par lot en cours.
    const saisie = actions.find((a: any) => a.category === 'SAISIE');
    expect(saisie).toBeTruthy();
    expect(saisie.level).toBe('JAUNE');
    expect(saisie.batchId).toBe(batchId);
    expect(saisie.dueDate).toBeTruthy();
  });

  it('next-actions : soin planifié dans la fenêtre remonte en SOIN, sans doublon ALERTE', async () => {
    // Soin unique planifié demain → dans la fenêtre de prévenance (calendar_lead_days).
    const careName = `Vaccin E2E ${Date.now()}`;
    await request(server)
      .post(`/farms/${farmId}/vaccine-schedules/manual`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        lotIds: [batchId],
        careType: 'VACCIN',
        name: careName,
        scheduledDate: daysFromNow(1),
      })
      .expect(201);

    const res = await request(server)
      .get(`/farms/${farmId}/advisory/next-actions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const actions = res.body.actions;

    // La forme actionnable (granulaire) est bien là, une seule fois.
    const soins = actions.filter(
      (a: any) => a.category === 'SOIN' && a.title.includes(careName),
    );
    expect(soins).toHaveLength(1);
    expect(soins[0].level).toBe('JAUNE');
    expect(soins[0].batchId).toBe(batchId);
    expect(soins[0].id.startsWith('care:')).toBe(true);

    // PROPHYLAXIE est re-présenté sous forme SOIN → pas de carte générique en doublon.
    const generic = actions.find(
      (a: any) => a.category === 'ALERTE' && a.title.includes(careName),
    );
    expect(generic).toBeUndefined();
  });

  it('next-actions : provende proche de péremption remonte en ALERTE ROUGE', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/advisory/next-actions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const action = res.body.actions.find(
      (a: any) => a.category === 'ALERTE' && a.title.includes('péremption'),
    );
    expect(action).toBeTruthy();
    expect(action.level).toBe('ROUGE');
    expect(action.title).toContain('Provende Démarrage');
  });

  it('cycle de vie : soin planifié → SOIN dans next-actions → FAIT → plus de SOIN ni alerte PROPHYLAXIE', async () => {
    // 1) Planifier un soin unique demain (dans la fenêtre de prévenance).
    const careName = `Vaccin E2E Cycle ${Date.now()}`;
    await request(server)
      .post(`/farms/${farmId}/vaccine-schedules/manual`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        lotIds: [batchId],
        careType: 'VACCIN',
        name: careName,
        scheduledDate: daysFromNow(1),
      })
      .expect(201);

    // 2) Il remonte une seule fois sous forme SOIN actionnable (care:<eventId>).
    const before = await request(server)
      .get(`/farms/${farmId}/advisory/next-actions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const soin = before.body.actions.find(
      (a: any) => a.category === 'SOIN' && a.title.includes(careName),
    );
    expect(soin).toBeTruthy();
    expect(soin.id).toMatch(/^care:/);
    const eventId = soin.id.slice('care:'.length);

    // 3) Marquer « Fait » → FAIT + clearedAt renseigné.
    const completed = await request(server)
      .post(
        `/farms/${farmId}/batches/${batchId}/prophylaxis/${eventId}/complete`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ completedAt: daysFromNow(0), animalCount: 2400 })
      .expect(201);
    expect(completed.body.status).toBe('FAIT');
    expect(completed.body.completedAt).toBeTruthy();

    // 4) Disparu de next-actions : ni SOIN granulaire, ni alerte générique.
    const after = await request(server)
      .get(`/farms/${farmId}/advisory/next-actions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const actions = after.body.actions as any[];
    expect(
      actions.find((a: any) => a.title.includes(careName)),
    ).toBeUndefined();
    expect(
      actions.find(
        (a: any) => a.category === 'ALERTE' && a.title.includes('Soin à venir'),
      ),
    ).toBeUndefined();
  });

  it('refuse l’accès à un utilisateur hors ferme (403)', async () => {
    await request(server)
      .get(`/farms/${farmId}/advisory/next-actions`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(403);
  });
});
