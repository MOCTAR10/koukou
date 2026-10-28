import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';

/**
 * Offline replay: the mobile queue resends a creation with the same
 * idempotencyKey when the first response was lost. The server must return
 * the existing row and never apply the side effects twice.
 */
describe('Idempotence des rejeux hors-ligne (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let db: DataSource;
  let token: string;
  let farmId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function count(table: string, where: string, params: unknown[]) {
    const rows: Array<{ n: number }> = await db.query(
      `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${where}`,
      params,
    );
    return rows[0].n;
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
    db = app.get(DataSource);

    const phone = `+2418${Date.now()}`;
    await request(server)
      .post('/auth/register')
      .send({ phone, fullName: 'Proprio Idem', code: 'secret123' })
      .expect(201);
    const login = await request(server)
      .post('/auth/login')
      .send({ phone, code: 'secret123' })
      .expect(201);
    token = login.body.accessToken;
    const farm = await request(server)
      .post('/farms')
      .set(auth())
      .send({
        name: `Ferme Idem ${Date.now()}`,
        administrativeCity: 'Libreville',
        capacityPerBuilding: 2000,
      })
      .expect(201);
    farmId = farm.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function receiveFeed(key?: string) {
    return request(server)
      .post(`/farms/${farmId}/inputs`)
      .set(auth())
      .send({
        kind: 'ALIMENT',
        feedPhase: 'DEMARRAGE',
        entryType: 'BAG',
        productName: 'Provende Idem',
        supplier: 'CEAG',
        supplierLotNumber: `IDEM-${Date.now()}`,
        numberOfBags: 10,
        bagSizeKg: 50,
        unitPriceFcfa: 15000,
        ...(key ? { idempotencyKey: key } : {}),
      })
      .expect(201);
  }

  it('réception d’intrant rejouée : un seul lot, une seule dépense, une seule écriture', async () => {
    const key = `off-feed-input-${Date.now()}`;
    const first = await receiveFeed(key);
    const replay = await receiveFeed(key);
    expect(replay.body.id).toBe(first.body.id);

    expect(
      await count('input_lots', 'farm_id = $1 AND idempotency_key = $2', [
        farmId,
        key,
      ]),
    ).toBe(1);
    expect(await count('expenses', 'input_lot_id = $1', [first.body.id])).toBe(
      1,
    );
    expect(
      await count('accounting_journal_entries', 'source_id = $1', [
        `input:${first.body.id}`,
      ]),
    ).toBe(1);
  });

  it('perte de provende rejouée : déclarée une seule fois', async () => {
    const lot = await receiveFeed();
    const key = `off-stock-loss-${Date.now()}`;
    const send = () =>
      request(server)
        .post(`/farms/${farmId}/feed-stock/losses`)
        .set(auth())
        .send({
          inputLotId: lot.body.id,
          quantity: 2,
          unit: 'SAC',
          reason: 'HUMIDITE',
          idempotencyKey: key,
        })
        .expect(201);
    const first = await send();
    const replay = await send();
    expect(replay.body.id).toBe(first.body.id);
    expect(
      await count('feed_stock_losses', 'input_lot_id = $1', [lot.body.id]),
    ).toBe(1);
  });

  it('point de vente et transfert rejoués : stock source décrémenté une seule fois', async () => {
    const posKey = `off-pdv-create-${Date.now()}`;
    const createPos = () =>
      request(server)
        .post(`/farms/${farmId}/points-of-sale`)
        .set(auth())
        .send({
          kind: 'BOUTIQUE',
          name: 'Boutique Idem',
          idempotencyKey: posKey,
        })
        .expect(201);
    const pos = await createPos();
    const posReplay = await createPos();
    expect(posReplay.body.id).toBe(pos.body.id);
    // Default FERME point (auto-created) is needed as transfer source.
    await request(server)
      .get(`/farms/${farmId}/points-of-sale`)
      .set(auth())
      .expect(200);

    const lot = await receiveFeed();
    const before = Number(
      (
        await db.query('SELECT quantity FROM input_lots WHERE id = $1', [
          lot.body.id,
        ])
      )[0].quantity,
    );
    const key = `off-stock-transfer-create-${Date.now()}`;
    const transfer = () =>
      request(server)
        .post(`/farms/${farmId}/stock-transfers`)
        .set(auth())
        .send({
          productType: 'PROVENDE',
          inputLotId: lot.body.id,
          pointOfSaleId: pos.body.id,
          unit: 'SAC',
          quantity: 2,
          idempotencyKey: key,
        })
        .expect(201);
    const first = await transfer();
    const replay = await transfer();
    expect(replay.body.id).toBe(first.body.id);

    const after = Number(
      (
        await db.query('SELECT quantity FROM input_lots WHERE id = $1', [
          lot.body.id,
        ])
      )[0].quantity,
    );
    // 2 sacs × 50 kg, removed once (lot stored in kg).
    expect(before - after).toBe(100);
    expect(
      await count('stock_transfers', 'farm_id = $1 AND idempotency_key = $2', [
        farmId,
        key,
      ]),
    ).toBe(1);
  });

  it('même clé sur une autre ferme : pas de collision', async () => {
    const key = `off-feed-input-shared-${Date.now()}`;
    const mine = await receiveFeed(key);
    const other = await request(server)
      .post('/farms')
      .set(auth())
      .send({
        name: `Ferme Idem B ${Date.now()}`,
        administrativeCity: 'Libreville',
        capacityPerBuilding: 2000,
      })
      .expect(201);
    const theirs = await request(server)
      .post(`/farms/${other.body.id}/inputs`)
      .set(auth())
      .send({
        kind: 'ALIMENT',
        feedPhase: 'DEMARRAGE',
        entryType: 'BAG',
        productName: 'Provende B',
        supplier: 'CEAG',
        supplierLotNumber: `IDEM-B-${Date.now()}`,
        numberOfBags: 1,
        idempotencyKey: key,
      })
      .expect(201);
    expect(theirs.body.id).not.toBe(mine.body.id);
  });
});
