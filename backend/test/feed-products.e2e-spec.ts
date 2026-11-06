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

describe('Module 3 — Catalogue provende & types d’entrée (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let otherToken: string;
  let farmId: string;
  let otherFarmId: string;

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
      name: `Ferme Catalogue ${Date.now()}`,
      provinceCode: 'G3',
    });
    token = farm.ownerToken;
    farmId = farm.farmId;

    const otherFarm = await createProgrammeFarm(server, admin.token, {
      name: `Ferme Tiers Cat ${Date.now()}`,
    });
    otherToken = otherFarm.ownerToken;
    otherFarmId = otherFarm.farmId;
  });

  it('créer un produit BAG avec phase et prix, puis le lister', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/feed-products`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Provende Démarrage CEAG ${Date.now()}`,
        entryType: 'BAG',
        feedPhase: 'DEMARRAGE',
        defaultBagSizeKg: 50,
        defaultUnitPriceFcfa: 18500,
        supplier: 'CEAG',
      })
      .expect(201);
    expect(res.body.entryType).toBe('BAG');
    expect(res.body.feedPhase).toBe('DEMARRAGE');
    expect(res.body.defaultBagSizeKg).toBe(50);
    expect(res.body.active).toBe(true);

    const list = await request(server)
      .get(`/farms/${farmId}/feed-products`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.length).toBeGreaterThan(0);
    expect(list.body[0]).toHaveProperty('entryType');
    expect(list.body[0]).toHaveProperty('feedPhase');
  });

  it('nom en double → 409', async () => {
    const name = `Doublon ${Date.now()}`;
    await request(server)
      .post(`/farms/${farmId}/feed-products`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(201);
    await request(server)
      .post(`/farms/${farmId}/feed-products`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(409);
  });

  it('PATCH partiel ne vide pas les champs omis (régression BUG 1)', async () => {
    const created = await request(server)
      .post(`/farms/${farmId}/feed-products`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Patch ${Date.now()}`,
        entryType: 'BULKER',
        feedPhase: 'CROISSANCE',
        defaultCostPerMtFcfa: 300000,
        defaultBagSizeKg: null,
        supplier: 'Sotravia',
      })
      .expect(201);
    const id = created.body.id;

    // Seul le prix par tonne change — les autres champs (entryType/feedPhase/supplier) doivent être conservés.
    const updated = await request(server)
      .patch(`/farms/${farmId}/feed-products/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ defaultCostPerMtFcfa: 320000 })
      .expect(200);
    expect(updated.body.defaultCostPerMtFcfa).toBe(320000);
    expect(updated.body.entryType).toBe('BULKER');
    expect(updated.body.feedPhase).toBe('CROISSANCE');
    expect(updated.body.supplier).toBe('Sotravia');
  });

  it('créer un produit MEDICAMENT puis MATIERE_PREMIERE (types d’entrée variés)', async () => {
    const med = await request(server)
      .post(`/farms/${farmId}/feed-products`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Vitamine AD3E ${Date.now()}`,
        entryType: 'MEDICAMENT',
        supplier: 'CEVA',
      })
      .expect(201);
    expect(med.body.entryType).toBe('MEDICAMENT');

    const mp = await request(server)
      .post(`/farms/${farmId}/feed-products`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Maïs broyé ${Date.now()}`,
        entryType: 'MATIERE_PREMIERE',
        feedPhase: 'CROISSANCE',
      })
      .expect(201);
    expect(mp.body.entryType).toBe('MATIERE_PREMIERE');
    expect(mp.body.feedPhase).toBe('CROISSANCE');
  });

  it('entrée BULKER : tonnage MT converti en kg et phase mappée', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/inputs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'ALIMENT',
        entryType: 'BULKER',
        feedPhase: 'CROISSANCE',
        tonnageMt: 2,
        costPerMtFcfa: 300000,
        productName: `Bulker Maïs ${Date.now()}`,
        supplier: 'Sotravia',
        supplierLotNumber: 'BLK-2026-1',
      })
      .expect(201);
    expect(res.body.quantity).toBe(2000); // 2 MT = 2000 kg
    expect(res.body.unit).toBe('KG');
    expect(res.body.entryType).toBe('BULKER');
    expect(res.body.feedPhase).toBe('CROISSANCE');

    // L'entrée bulker doit apparaître dans le stock agrégé par phase (CROISSANCE).
    const stock = await request(server)
      .get(`/farms/${farmId}/feed-stock`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const croiss = stock.body.byType.find(
      (t: any) => t.feedPhase === 'CROISSANCE',
    );
    expect(croiss).toBeTruthy();
    expect(croiss.receivedKg).toBe(2000);
  });

  it('entrée MEDICAMENT : tracée dans lots[] (FEFO) mais hors byType/autonomie', async () => {
    const med = await request(server)
      .post(`/farms/${farmId}/inputs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'ALIMENT',
        entryType: 'MEDICAMENT',
        additiveName: 'Vitamine AD3E',
        doseQuantity: 10,
        doseUnit: 'sachet',
        productName: `Vitamine ${Date.now()}`,
        supplier: 'CEVA',
        supplierLotNumber: 'VIT-2026-1',
        expirationDate: '2027-01-01',
      })
      .expect(201);
    expect(med.body.entryType).toBe('MEDICAMENT');
    expect(med.body.additiveName).toBe('Vitamine AD3E');

    const stock = await request(server)
      .get(`/farms/${farmId}/feed-stock`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const lot = stock.body.lots.find((l: any) => l.id === med.body.id);
    expect(lot).toBeTruthy();
    expect(lot.entryType).toBe('MEDICAMENT');
    // Le médicament est visible dans lots[] (FEFO) mais n'influe pas sur l'autonomie en kg :
    // le byType CROISSANCE doit rester inchangé (2000 kg du bulker, pas + le médicament).
    const croiss = stock.body.byType.find(
      (t: any) => t.feedPhase === 'CROISSANCE',
    );
    expect(croiss).toBeTruthy();
    expect(croiss.receivedKg).toBe(2000);
  });

  it('entrée liée à un produit catalogue : productId et prix par défaut pré-remplis', async () => {
    const product = await request(server)
      .post(`/farms/${farmId}/feed-products`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Provende Ponte Pro ${Date.now()}`,
        entryType: 'BAG',
        feedPhase: 'PONTE_PHASE_1',
        defaultBagSizeKg: 50,
        defaultUnitPriceFcfa: 17000,
        supplier: 'CEAG',
      })
      .expect(201);
    const pid = product.body.id;

    const input = await request(server)
      .post(`/farms/${farmId}/inputs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'ALIMENT',
        productId: pid,
        quantity: 10,
        unit: 'SAC',
        productName: 'Provende ponte (catalogue)',
        supplier: 'CEAG',
        supplierLotNumber: 'PO-2026-77',
      })
      .expect(201);
    expect(input.body.productId).toBe(pid);
    expect(input.body.foodType).toBe('PONTE');
    expect(input.body.feedPhase).toBe('PONTE_PHASE_1');
    expect(input.body.unitPriceFcfa).toBe(17000);
  });

  it('suppression d’un produit rattaché à une entrée → 400 (traçabilité HACCP)', async () => {
    const created = await request(server)
      .post(`/farms/${farmId}/feed-products`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `À rattacher ${Date.now()}`,
        entryType: 'BAG',
        feedPhase: 'FINITION',
      })
      .expect(201);
    const pid = created.body.id;

    await request(server)
      .post(`/farms/${farmId}/inputs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'ALIMENT',
        productId: pid,
        quantity: 1,
        unit: 'SAC',
        productName: 'X',
        supplier: 'Y',
        supplierLotNumber: 'Z-1',
      })
      .expect(201);

    await request(server)
      .delete(`/farms/${farmId}/feed-products/${pid}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    // Suppression sans lien → OK.
    const free = await request(server)
      .post(`/farms/${farmId}/feed-products`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Libre ${Date.now()}` })
      .expect(201);
    const gone = await request(server)
      .delete(`/farms/${farmId}/feed-products/${free.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(gone.body.deleted).toBe(true);
  });

  it('catalogue d’une autre ferme → 403', async () => {
    await request(server)
      .get(`/farms/${farmId}/feed-products`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });

  it('productId d’une autre ferme → 400', async () => {
    const foreignProduct = await request(server)
      .post(`/farms/${otherFarmId}/feed-products`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: `Tiers ${Date.now()}` })
      .expect(201);
    await request(server)
      .post(`/farms/${farmId}/inputs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'ALIMENT',
        productId: foreignProduct.body.id,
        quantity: 1,
        unit: 'SAC',
        productName: 'X',
        supplier: 'Y',
        supplierLotNumber: 'Z-2',
      })
      .expect(400);
  });

  afterAll(async () => {
    await app.close();
  });
});
