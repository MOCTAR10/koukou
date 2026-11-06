import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
} from './helpers/programme-farm.js';

const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * POUFA lot A2 divers: offline delivery day (cession), T2 delivery in one
 * band only, F4 slaughter order to an abattoir, F10 traced lots on receipts.
 */
describe('POUFA lot A2 divers (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let adminToken: string;
  let ownerToken: string;
  let farmId: string;
  let buyerOp: { id: string };
  let abattoir: { id: string };

  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');
  const get = (url: string, token = ownerToken) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token = ownerToken) =>
    request(server).post(url).set(auth(token)).send(body);
  const patch = (url: string, body: object, token = ownerToken) =>
    request(server).patch(url).set(auth(token)).send(body);

  async function openBand(qty: number, integrationDate = day(-10)) {
    return (
      await post(`/farms/${farmId}/batches`, {
        batchName: `Bande A2 ${tag}`,
        type: 'CHAIR',
        integrationDate,
        quantityAtStart: qty,
      }).expect(201)
    ).body as { id: string; code: string };
  }
  const subLots = async (batchId: string) =>
    (
      (await get(`/farms/${farmId}/trace/lots?batchId=${batchId}`).expect(200))
        .body as Array<Record<string, any>>
    ).filter((l) => l.kind === 'SOUS_LOT');

  beforeAll(async () => {
    const mf: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mf.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    adminToken = (await createPlatformAdmin(server, app.get(DataSource))).token;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Divers ${tag}`,
      exploitantName: 'Éleveur Divers',
    });
    farmId = farm.farmId;
    ownerToken = farm.ownerToken;
    buyerOp = (
      await post('/trace/operators', { typeCode: 'ACHETEUR', name: `Acheteur A2 ${tag}` }, adminToken).expect(201)
    ).body;
    abattoir = (
      await post('/trace/operators', { typeCode: 'ABATTOIR', name: `Abattoir A2 ${tag}` }, adminToken).expect(201)
    ).body;
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('une commande livrée hors ligne est cédée au jour de la livraison sur l’appareil, avec le lot sur le reçu', async () => {
    const band = await openBand(200);
    const customer = await post(`/farms/${farmId}/customers`, { fullName: `Client A2 ${tag}` }).expect(201);
    await patch(`/farms/${farmId}/customers/${customer.body.id}`, { operatorId: buyerOp.id }).expect(200);
    const order = await post(`/farms/${farmId}/orders`, {
      canal: 'FERME',
      expectedDate: day(0),
      customerId: customer.body.id,
      items: [{ productType: 'POULET_PIECE', quantity: 4, unit: 'PIECE', unitPriceFcfa: 3000, batchId: band.id }],
    }).expect(201);
    const capturedAt = `${day(-2)}T10:00:00.000Z`;
    await post(`/farms/${farmId}/orders/${order.body.id}/livrer`, {
      capturedAt,
      deviceSentAt: new Date().toISOString(),
      deviceId: 'test-device',
    }).expect(201);
    const subs = await subLots(band.id);
    expect(subs).toHaveLength(1);
    expect(String(subs[0].cededOn).slice(0, 10)).toBe(day(-2));
    const one = await get(`/farms/${farmId}/orders/${order.body.id}`).expect(200);
    expect(String(one.body.livredAt).slice(0, 10)).toBe(day(-2));
    const pdf = await get(`/farms/${farmId}/orders/${order.body.id}/receipt`).expect(200);
    expect(pdf.headers['content-type']).toContain('pdf');
  });

  it('un ordre d’abattage vers un abattoir crée la cession au traitement, une seule fois', async () => {
    const band = await openBand(100);
    // A buyer is not an abattoir.
    await post(`/farms/${farmId}/slaughter-orders`, {
      batchId: band.id, slaughterType: 'ABATTU', destination: 'EXTERNE', plannedDate: day(0), birdCount: 10, operatorId: buyerOp.id,
    }).expect(400);
    await post(`/farms/${farmId}/slaughter-orders`, {
      batchId: band.id, slaughterType: 'ABATTU', destination: 'INTERNE', plannedDate: day(0), birdCount: 10, operatorId: abattoir.id,
    }).expect(400);
    const order = await post(`/farms/${farmId}/slaughter-orders`, {
      batchId: band.id, slaughterType: 'ABATTU', destination: 'EXTERNE', plannedDate: day(0), birdCount: 10, operatorId: abattoir.id,
    }).expect(201);
    expect(order.body.operatorId).toBe(abattoir.id);
    await post(`/farms/${farmId}/slaughter-orders/${order.body.id}/send`, {}).expect(201);
    expect(await subLots(band.id)).toHaveLength(0);
    await post(`/farms/${farmId}/slaughter-orders/${order.body.id}/process`, {}).expect(201);
    const subs = await subLots(band.id);
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ quantity: 10, operator: { id: abattoir.id } });
    const alive = (await get(`/farms/${farmId}/batches/${band.id}`).expect(200)).body.quantityAlive;
    expect(alive).toBe(90);
    await patch(`/farms/${farmId}/slaughter-orders/${order.body.id}`, { operatorId: null }).expect(400);
  });

  it('l’administration du programme voit et suspend un compte d’équipe (F13)', async () => {
    const phone = `+2416${Date.now().toString().slice(-7)}`;
    const member = await post(`/farms/${farmId}/eleveurs`, { fullName: `Membre A2 ${tag}`, phone, code: 'secret456' }).expect(201);
    const team = (await get(`/programme/farms/${farmId}/team`, adminToken).expect(200)).body as Array<Record<string, any>>;
    const row = team.find((t) => t.phone === phone || t.fullName === `Membre A2 ${tag}`);
    expect(row).toBeDefined();
    expect(row!.linkActive).toBe(true);
    const employmentId = row!.employmentId ?? member.body.employment.id;
    await request(server).put(`/programme/farms/${farmId}/team/${employmentId}/active`).set(auth(adminToken)).send({ active: false }).expect(200);
    const after = (await get(`/programme/farms/${farmId}/team`, adminToken).expect(200)).body as Array<Record<string, any>>;
    expect(after.find((t) => t.employmentId === employmentId)!.linkActive).toBe(false);
    // The owner cannot reach this programme route.
    await get(`/programme/farms/${farmId}/team`).expect(403);
  });

  it('une livraison sans bande ne figure que dans une bande', async () => {
    // A farm already has open bands from the tests above: ambiguity → none.
    const delivery = await post('/programme/input-deliveries', {
      farmId, source: 'ETAT_SMAG', shippedAt: day(0),
      lines: [{ intrantCode: 'ALIMENT_DEMARRAGE', unitCode: 'SAC', quantity: 2, bagSizeKg: 50, feedPhase: 'DEMARRAGE', subsidized: false, unitValueFcfa: 10_000 }],
    }, adminToken).expect(201);
    await post(`/farms/${farmId}/input-deliveries/${delivery.body.id}/confirm`, {}).expect(201);
    const bands = (await get(`/farms/${farmId}/batches`).expect(200)).body as Array<{ id: string; status: string }>;
    const open = bands.filter((b) => b.status !== 'CLOTURE');
    expect(open.length).toBeGreaterThan(1);
    const shownIn = async () => {
      let n = 0;
      for (const b of open) {
        const [root] = (await get(`/farms/${farmId}/trace/lots?batchId=${b.id}`).expect(200)).body as Array<{ id: string; kind: string }>;
        const h = (await get(`/farms/${farmId}/trace/lots/${root.id}`).expect(200)).body as { rearing: Array<{ kind: string; details: any }> };
        if (h.rearing.some((r) => r.kind === 'INTRANT' && r.details.code === delivery.body.code)) n += 1;
      }
      return n;
    };
    expect(await shownIn()).toBe(0);
    await request(server).put(`/farms/${farmId}/input-deliveries/${delivery.body.id}/band`).set(auth(ownerToken)).send({ bandId: open[0].id }).expect(200);
    expect(await shownIn()).toBe(1);
  });
});
