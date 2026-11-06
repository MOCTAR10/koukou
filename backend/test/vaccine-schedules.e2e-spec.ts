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

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

describe('Sanitaire — Programmes de vaccination & échéances (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let eleveurToken: string;
  let farmId: string;
  let batchFreshId: string;
  let batchOldId: string;
  let batchLayerId: string;
  let batchPintadeId: string;

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
      name: `Ferme Vaccin ${Date.now()}`,
    });
    token = farm.ownerToken;
    farmId = farm.farmId;

    const eleveurPhone = `+24181${Date.now()}`;
    await request(server)
      .post(`/farms/${farmId}/eleveurs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Eleveur Vaccin',
        phone: eleveurPhone,
        email: `eleveur.vaccin.${Date.now()}@e2e.ga`,
        code: 'secret123',
      })
      .expect(201);
    const eleveurLogin = await request(server)
      .post('/auth/login')
      .send({ phone: eleveurPhone, code: 'secret123' })
      .expect(201);
    eleveurToken = eleveurLogin.body.accessToken;

    const makeBatch = async (
      name: string,
      type: 'CHAIR' | 'PONDEUSE',
      date: string,
      species?: string,
    ) => {
      const res = await request(server)
        .post(`/farms/${farmId}/batches`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          batchName: name,
          integrationDate: date,
          quantityAtStart: 300,
          type,
          ...(species ? { species } : {}),
          couvoirSupplier: 'Canabec',
          chickLotNumber: `CL-${Date.now()}-${name}`,
          hatchDate: date,
        })
        .expect(201);
      return res.body.id as string;
    };

    batchFreshId = await makeBatch('Lot vaccin jour J', 'CHAIR', today());
    batchOldId = await makeBatch(
      'Lot vaccin âgé',
      'CHAIR',
      addDays(today(), -40),
    );
    batchLayerId = await makeBatch('Lot pondeuse vaccin', 'PONDEUSE', today());
    batchPintadeId = await makeBatch(
      'Lot pintade vaccin',
      'CHAIR',
      today(),
      'PINTADE',
    );
  });

  const programs = (type: string) =>
    request(server)
      .get('/sanitary/protocols')
      .query({ type })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

  const findProgram = async (type: string, code: string) => {
    const res = await programs(type);
    const found = res.body.find((p: { code: string }) => p.code === code);
    expect(found).toBeDefined();
    return found as { id: string; name: string };
  };

  it('programmes Gabon pré-chargés disponibles (chair + pondeuse)', async () => {
    const chair = (await programs('CHAIR')).body as { code: string }[];
    const layer = (await programs('PONDEUSE')).body as { code: string }[];
    expect(chair.some((p) => p.code === 'vacc-poulet-chair-gabon')).toBe(true);
    expect(layer.some((p) => p.code === 'vacc-poule-pondeuse-gabon')).toBe(
      true,
    );
  });

  it('générer un programme sur un lot au jour J → tout est planifié, non bloquant', async () => {
    const program = await findProgram('CHAIR', 'vacc-poulet-chair-gabon');
    const res = await request(server)
      .post(`/farms/${farmId}/vaccine-schedules/programs/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ protocolId: program.id, lotIds: [batchFreshId] })
      .expect(201);
    expect(res.body.planned).toBe(6);
    expect(res.body.skipped).toBe(0);
    expect(res.body.perLot).toHaveLength(1);
    expect(res.body.perLot[0].planned).toBe(6);
    expect(res.body.events).toHaveLength(6);
    expect(res.body.events[0].source).toBe('PROGRAM');
    expect(res.body.events[0].status).toBe('PLANIFIE');
    expect(res.body.events[0].protocolStepId).toBeTruthy();
  });

  it('re-générer le même programme → déjà planifié, aucune étape bloquante', async () => {
    const program = await findProgram('CHAIR', 'vacc-poulet-chair-gabon');
    const res = await request(server)
      .post(`/farms/${farmId}/vaccine-schedules/programs/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ protocolId: program.id, lotIds: [batchFreshId] })
      .expect(201);
    expect(res.body.planned).toBe(0);
    expect(res.body.skipped).toBe(6);
    expect(
      res.body.perLot[0].skippedSteps.every((s: { reason: string }) =>
        s.reason.includes('déjà'),
      ),
    ).toBe(true);
  });

  it('programme sur un lot âgé → les étapes dont la date est passée sont sautées (jamais bloquant)', async () => {
    const program = await findProgram('CHAIR', 'vacc-poulet-chair-gabon');
    const res = await request(server)
      .post(`/farms/${farmId}/vaccine-schedules/programs/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ protocolId: program.id, lotIds: [batchOldId] })
      .expect(201);
    expect(res.body.planned).toBe(0);
    expect(res.body.skipped).toBe(6);
    const reasons = res.body.perLot[0].skippedSteps.map(
      (s: { reason: string }) => s.reason,
    );
    expect(reasons.some((r: string) => r.includes('passée'))).toBe(true);
  });

  it('programme pondeuse (Gabon) → 11 étapes planifiées', async () => {
    const program = await findProgram('PONDEUSE', 'vacc-poule-pondeuse-gabon');
    const res = await request(server)
      .post(`/farms/${farmId}/vaccine-schedules/programs/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ protocolId: program.id, lotIds: [batchLayerId] })
      .expect(201);
    expect(res.body.planned).toBe(11);
  });

  it('programme POULET sur un lot PINTADE → 400 (espèce liée au programme)', async () => {
    const program = await findProgram('CHAIR', 'vacc-poulet-chair-gabon');
    const res = await request(server)
      .post(`/farms/${farmId}/vaccine-schedules/programs/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ protocolId: program.id, lotIds: [batchPintadeId] })
      .expect(400);
    expect(res.body.message).toContain('Pintade');
    expect(res.body.message).toContain('Lot pintade vaccin');
    expect(res.body.message).toMatch(/Poulet Chair/);
  });

  it('programme mixte (POULET + PINTADE) → 400, aucun lot planifié', async () => {
    const program = await findProgram('CHAIR', 'vacc-poulet-chair-gabon');
    const countProgramEvents = async () => {
      const r = await request(server)
        .get(`/farms/${farmId}/batches/${batchFreshId}/prophylaxis`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      return r.body.filter((e: { source: string }) => e.source === 'PROGRAM')
        .length;
    };
    const beforeCount = await countProgramEvents();
    const res = await request(server)
      .post(`/farms/${farmId}/vaccine-schedules/programs/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ protocolId: program.id, lotIds: [batchFreshId, batchPintadeId] })
      .expect(400);
    expect(res.body.message).toContain('Pintade');

    const afterCount = await countProgramEvents();
    expect(afterCount).toBe(beforeCount);
  });

  it('programme PINTADE pré-chargé disponible et applicable sur un lot PINTADE', async () => {
    const program = await findProgram('CHAIR', 'vacc-pintade-chair-gabon');
    const res = await request(server)
      .post(`/farms/${farmId}/vaccine-schedules/programs/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ protocolId: program.id, lotIds: [batchPintadeId] })
      .expect(201);
    expect(res.body.planned).toBeGreaterThan(0);
    expect(
      res.body.events.every(
        (e: { batchId: string }) => e.batchId === batchPintadeId,
      ),
    ).toBe(true);
  });

  it('soin manuel vaccin multi-lots → un événement par lot (source MANUEL)', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/vaccine-schedules/manual`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        lotIds: [batchFreshId, batchOldId],
        careType: 'VACCIN',
        name: 'Rappel vaccinal ND — eau de boisson',
        scheduledDate: addDays(today(), 1),
        route: 'Eau de boisson',
        dosage: '1 dose/sujet',
        notes: 'Souche LaSota',
        withdrawalDays: 0,
      })
      .expect(201);
    expect(res.body).toHaveLength(2);
    expect(
      res.body.every((e: { source: string }) => e.source === 'MANUEL'),
    ).toBe(true);
    expect(
      res.body.every((e: { careType: string }) => e.careType === 'VACCIN'),
    ).toBe(true);
    expect(res.body.map((e: { batchId: string }) => e.batchId).sort()).toEqual(
      [batchFreshId, batchOldId].sort(),
    );
  });

  it('soin manuel : type non vaccin/médicament → 400', async () => {
    await request(server)
      .post(`/farms/${farmId}/vaccine-schedules/manual`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        lotIds: [batchFreshId],
        careType: 'VITAMINE',
        name: 'Vitaminage',
        scheduledDate: addDays(today(), 1),
      })
      .expect(400);
  });

  it('médicament « Sortir du stock » → stock décrémenté, jamais négatif', async () => {
    const input = await request(server)
      .post(`/farms/${farmId}/inputs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'ALIMENT',
        entryType: 'MEDICAMENT',
        productName: 'Antibiotique respiratoire',
        supplier: 'CEAG',
        supplierLotNumber: `MED-${Date.now()}`,
        quantity: 10,
        doseUnit: 'dose',
      })
      .expect(201);
    const medLotId = input.body.id as string;

    const res = await request(server)
      .post(`/farms/${farmId}/vaccine-schedules/manual`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        lotIds: [batchFreshId],
        careType: 'MEDICAMENT',
        name: 'Antibiotique respiratoire',
        scheduledDate: addDays(today(), 2),
        route: 'Eau de boisson',
        withdrawalDays: 5,
        decrementStock: true,
        medicationLotId: medLotId,
        medicationQty: 3,
        medicationUnit: 'dose',
      })
      .expect(201);
    expect(res.body[0].decrementStock).toBe(true);
    expect(res.body[0].medicationLotId).toBe(medLotId);
    expect(res.body[0].stockConsumedAt).toBeTruthy();

    const after = await request(server)
      .get(`/farms/${farmId}/inputs`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const med = after.body.find((l: { id: string }) => l.id === medLotId);
    expect(med.quantity).toBe(7);

    // Sortie supérieure au stock restant → 400, jamais de négatif.
    await request(server)
      .post(`/farms/${farmId}/vaccine-schedules/manual`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        lotIds: [batchFreshId],
        careType: 'MEDICAMENT',
        name: 'Antibiotique respiratoire (dose forte)',
        scheduledDate: addDays(today(), 2),
        decrementStock: true,
        medicationLotId: medLotId,
        medicationQty: 8,
      })
      .expect(400);
  });

  it('Éleveur peut planifier mais pas supprimer (403)', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/vaccine-schedules/manual`)
      .set('Authorization', `Bearer ${eleveurToken}`)
      .send({
        lotIds: [batchFreshId],
        careType: 'VACCIN',
        name: 'Rappel Newcastle — Éleveur',
        scheduledDate: addDays(today(), 3),
      })
      .expect(201);
    const eventId = res.body[0].id as string;

    await request(server)
      .delete(
        `/farms/${farmId}/batches/${batchFreshId}/vaccine-schedules/${eventId}`,
      )
      .set('Authorization', `Bearer ${eleveurToken}`)
      .expect(403);
  });

  it('édition d’un soin planifié (vaccin ↔ médicament, date) + immuable une fois FAIT', async () => {
    const list = await request(server)
      .get(`/farms/${farmId}/batches/${batchFreshId}/prophylaxis`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const event = list.body.find(
      (e: { name: string }) => e.name === 'Rappel vaccinal ND — eau de boisson',
    ) as { id: string };

    const edited = await request(server)
      .patch(
        `/farms/${farmId}/batches/${batchFreshId}/vaccine-schedules/${event.id}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({
        careType: 'MEDICAMENT',
        name: 'Rappel ND renommé (médicament)',
        route: 'Goutte oculaire',
        dosage: '2 doses/sujet',
      })
      .expect(200);
    expect(edited.body.careType).toBe('MEDICAMENT');
    expect(edited.body.name).toBe('Rappel ND renommé (médicament)');
    expect(edited.body.status).toBe('PLANIFIE');

    await request(server)
      .post(
        `/farms/${farmId}/batches/${batchFreshId}/prophylaxis/${event.id}/complete`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Réalisé sur le terrain' })
      .expect(201);

    await request(server)
      .patch(
        `/farms/${farmId}/batches/${batchFreshId}/vaccine-schedules/${event.id}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Immutable' })
      .expect(400);

    await request(server)
      .delete(
        `/farms/${farmId}/batches/${batchFreshId}/vaccine-schedules/${event.id}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('suppression (Propriétaire) d’un soin « Sortir du stock » → stock restitué', async () => {
    const list = await request(server)
      .get(`/farms/${farmId}/batches/${batchFreshId}/prophylaxis`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const event = list.body.find(
      (e: { name: string }) => e.name === 'Antibiotique respiratoire',
    ) as { id: string; medicationLotId: string; medicationQty: number };

    const del = await request(server)
      .delete(
        `/farms/${farmId}/batches/${batchFreshId}/vaccine-schedules/${event.id}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(del.body.deleted).toBe(true);

    const after = await request(server)
      .get(`/farms/${farmId}/inputs`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const med = after.body.find(
      (l: { id: string }) => l.id === event.medicationLotId,
    );
    expect(med.quantity).toBe(10);
  });
});
