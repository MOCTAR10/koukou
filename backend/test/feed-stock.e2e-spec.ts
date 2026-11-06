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

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('Module 3 — Stocks & Inventaire provende (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let otherToken: string;
  let farmId: string;
  let otherFarmId: string;
  let lotAId: string;
  let foreignLotId: string;

  async function createBatch(integrationDate: string) {
    const res = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: `Lot Stock ${Date.now()}`,
        integrationDate,
        quantityAtStart: 300,
        type: 'CHAIR',
      })
      .expect(201);
    return res.body.id;
  }

  async function addDailyEntry(
    batchId: string,
    date: string,
    inputLotId?: string,
  ) {
    return request(server)
      .post(`/farms/${farmId}/batches/${batchId}/daily-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        entryDate: date,
        feedQuantity: 40,
        feedUnit: 'KG',
        feedType: 'DEMARRAGE',
        ...(inputLotId ? { inputLotId } : {}),
      })
      .expect(201);
  }

  async function addInput(
    supplierLotNumber: string,
    quantity: number,
    unit = 'SAC',
  ) {
    const res = await request(server)
      .post(`/farms/${farmId}/inputs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'ALIMENT',
        foodType: 'DEMARRAGE',
        productName: `Provende Démarrage ${supplierLotNumber}`,
        supplier: 'CEAG',
        supplierLotNumber,
        quantity,
        unit,
      })
      .expect(201);
    return res.body.id;
  }

  async function activeAlimentAlert() {
    const res = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.find(
      (a: any) =>
        a.kind === 'ALIMENT' &&
        a.status === 'ACTIVE' &&
        !a.batchId &&
        !a.buildingId,
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
      name: `Ferme Stock ${Date.now()}`,
      provinceCode: 'G2',
    });
    token = farm.ownerToken;
    farmId = farm.farmId;

    // Propriétaire tiers + ferme tierce pour les contrôles d'accès / lot étranger.
    const otherFarm = await createProgrammeFarm(server, admin.token, {
      name: `Ferme Tiers ${Date.now()}`,
    });
    otherToken = otherFarm.ownerToken;
    otherFarmId = otherFarm.farmId;

    const foreignLot = await request(server)
      .post(`/farms/${otherFarmId}/inputs`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        kind: 'ALIMENT',
        foodType: 'DEMARRAGE',
        productName: 'Provende Tiers',
        supplier: 'CEAG',
        supplierLotNumber: 'TIERS-1',
        quantity: 10,
        unit: 'SAC',
      })
      .expect(201);
    foreignLotId = foreignLot.body.id;
  });

  it('sans stock ni saisies : résumé vide et aucune alerte ALIMENT', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/feed-stock`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.byType).toEqual([]);
    const alert = await activeAlimentAlert();
    expect(alert).toBeUndefined();
  });

  it('3 saisies de 40 kg (Démarrage) + 2 sacs de stock → alerte ALIMENT ROUGE (< 3 jours d’autonomie)', async () => {
    const batchId = await createBatch(daysAgo(3));
    for (const n of [2, 1, 0]) {
      await addDailyEntry(batchId, daysAgo(n));
    }

    lotAId = await addInput('DEMA-100', 2); // 2 sacs = 100 kg

    const res = await request(server)
      .get(`/farms/${farmId}/feed-stock`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const dem = res.body.byType.find((t: any) => t.foodType === 'DEMARRAGE');
    expect(dem).toBeTruthy();
    expect(dem.receivedKg).toBe(100);
    expect(dem.availableKg).toBe(100);
    expect(dem.autonomyDays).toBeCloseTo(2.5, 1);

    const alert = await activeAlimentAlert();
    expect(alert).toBeTruthy();
    expect(alert.level).toBe('ROUGE');
    expect(alert.message).toContain('Démarrage');
  });

  it('réapprovisionnement ramène l’autonomie au-dessus des 5 jours → alerte résolue', async () => {
    await addInput('DEMA-120', 2, 'SAC'); // total : 200 kg
    const res = await request(server)
      .get(`/farms/${farmId}/feed-stock`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const dem = res.body.byType.find((t: any) => t.foodType === 'DEMARRAGE');
    expect(dem.autonomyDays).toBeCloseTo(5, 1);
    expect(dem.status).toBe('VERT');

    const alert = await activeAlimentAlert();
    expect(alert).toBeUndefined();
  });

  it('déclare 1 sac gâté (50 kg) → autonomie 3.75 j → alerte JAUNE', async () => {
    await request(server)
      .post(`/farms/${farmId}/feed-stock/losses`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        inputLotId: lotAId,
        quantity: 1,
        reason: 'HUMIDITE',
        notes: 'Sac humide au stockage',
      })
      .expect(201);

    const res = await request(server)
      .get(`/farms/${farmId}/feed-stock`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const dem = res.body.byType.find((t: any) => t.foodType === 'DEMARRAGE');
    expect(dem.availableKg).toBe(150);
    expect(dem.autonomyDays).toBeCloseTo(3.75, 1);
    expect(dem.status).toBe('JAUNE');

    const alert = await activeAlimentAlert();
    expect(alert).toBeTruthy();
    expect(alert.level).toBe('JAUNE');
  });

  it('une 2e perte de 50 kg fait repasser le stock sous le seuil critique (ROUGE)', async () => {
    await request(server)
      .post(`/farms/${farmId}/feed-stock/losses`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        inputLotId: lotAId,
        quantity: 1,
        unit: 'SAC',
        reason: 'RONGEURS',
      })
      .expect(201);

    const res = await request(server)
      .get(`/farms/${farmId}/feed-stock`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const dem = res.body.byType.find((t: any) => t.foodType === 'DEMARRAGE');
    expect(dem.availableKg).toBe(100);

    const alert = await activeAlimentAlert();
    expect(alert).toBeTruthy();
    expect(alert.level).toBe('ROUGE');

    const lotA = res.body.lots.find((l: any) => l.id === lotAId);
    expect(lotA.lostKg).toBe(100);
    expect(lotA.availableKg).toBe(0);
  });

  it('saisie liée à un lot (HACCP) décrémente le stock du lot et trace le mouvement', async () => {
    const batch2 = await createBatch(daysAgo(5));
    // Lot frais avec disponibilité réelle pour que la déduction passe (règle
    // « jamais de stock négatif » : la consommation ne peut pas dépasser le disponible).
    const freshLot = await addInput('DEMA-CONSO-1', 2); // 2 sacs = 100 kg
    await addDailyEntry(batch2, daysAgo(3), freshLot);

    const res = await request(server)
      .get(`/farms/${farmId}/feed-stock`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const lot = res.body.lots.find((l: any) => l.id === freshLot);
    expect(lot).toBeTruthy();
    expect(lot.usedKg).toBe(40);
    expect(lot.availableKg).toBe(60); // 100 reçus − 40 consommés

    const mov = await request(server)
      .get(`/farms/${farmId}/feed-stock/movements`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const conso = mov.body.find(
      (m: any) => m.type === 'CONSOMMATION' && m.inputLotId === freshLot,
    );
    expect(conso).toBeTruthy();
    expect(conso.quantityKg).toBe(40);

    const pertes = await request(server)
      .get(`/farms/${farmId}/feed-stock/losses`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(pertes.body.length).toBe(2);
    expect(pertes.body.every((p: any) => p.quantityKg === 50)).toBe(true);
  });

  it('consommation dépassant le disponible du lot → 400 + alerte ALIMENT (jamais de négatif)', async () => {
    // lotA est totalement consommé par les pertes (disponible 0 kg) : toute
    // consommation supplémentaire liée doit être refusée, pas passée en négatif.
    const batch3 = await createBatch(daysAgo(5));
    await request(server)
      .post(`/farms/${farmId}/batches/${batch3}/daily-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        entryDate: daysAgo(2),
        feedQuantity: 40,
        feedUnit: 'KG',
        feedType: 'DEMARRAGE',
        inputLotId: lotAId,
      })
      .expect(400);

    const alert = await activeAlimentAlert();
    expect(alert).toBeTruthy();
    expect(alert.level).toBe('ROUGE');

    // Le stock du lot reste à 0 (jamais négatif).
    const res = await request(server)
      .get(`/farms/${farmId}/feed-stock`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const lotA = res.body.lots.find((l: any) => l.id === lotAId);
    expect(lotA.availableKg).toBe(0);
  });

  it('achat externe (skipStockDeduction=true) : consommation enregistrée SANS décrémenter le stock', async () => {
    const byType = async () => {
      const r = await request(server)
        .get(`/farms/${farmId}/feed-stock`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      return r.body.byType.find((t: any) => t.foodType === 'DEMARRAGE');
    };

    const before = await byType();
    const batchExt = await createBatch(daysAgo(1));
    const res = await request(server)
      .post(`/farms/${farmId}/batches/${batchExt}/daily-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        entryDate: daysAgo(1),
        feedQuantity: 40,
        feedUnit: 'KG',
        feedType: 'DEMARRAGE',
        skipStockDeduction: true,
      })
      .expect(201);
    expect(res.body.skipStockDeduction).toBe(true);
    expect(res.body.inputLotId).toBeNull();

    const after = await byType();
    expect(after.availableKg).toBe(before.availableKg);

    const mov = await request(server)
      .get(`/farms/${farmId}/feed-stock/movements`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(mov.body.some((m: any) => m.batchId === batchExt)).toBe(false);
  });

  it('skipStockDeduction avec inputLotId → 400 (mutuellement exclusifs)', async () => {
    const batchX = await createBatch(daysAgo(1));
    await request(server)
      .post(`/farms/${farmId}/batches/${batchX}/daily-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        entryDate: daysAgo(1),
        feedQuantity: 40,
        feedUnit: 'KG',
        feedType: 'DEMARRAGE',
        skipStockDeduction: true,
        inputLotId: lotAId,
      })
      .expect(400);
  });

  it('perte déclarée sur un lot d’une autre ferme → 400', async () => {
    await request(server)
      .post(`/farms/${farmId}/feed-stock/losses`)
      .set('Authorization', `Bearer ${token}`)
      .send({ inputLotId: foreignLotId, quantity: 1, reason: 'AUTRE' })
      .expect(400);
  });

  it("l'inventaire d'une ferme n'appartenant pas à l'utilisateur → 403", async () => {
    await request(server)
      .get(`/farms/${farmId}/feed-stock`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });

  afterAll(async () => {
    await app.close();
  });
});
