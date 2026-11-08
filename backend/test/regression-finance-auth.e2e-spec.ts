import { deflateRawSync } from 'node:zlib';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  isReferenceCollision,
  retryOnReferenceCollision,
} from './../src/common/utils/idempotency.js';
import {
  assertXlsxNotBomb,
  toXlsx,
  readXlsx,
} from './../src/common/utils/spreadsheet.js';
import {
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  registerBuyer,
  uniquePhone,
} from './helpers/programme-farm.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

/** A one-entry .xlsx-looking zip declaring `size` bytes once inflated. */
function zipDeclaring(size: number): Buffer {
  const name = Buffer.from('xl/worksheets/sheet1.xml');
  const data = deflateRawSync(Buffer.alloc(1024 * 1024));
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(size, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(size, 24);
  central.writeUInt16LE(name.length, 28);
  const cdOffset = local.length + name.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, name, data, central, name, eocd]);
}

describe('Régression finance + auth (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;

  // Farm A: POS, orders, refunds.
  let farmId: string;
  let token: string;
  let batchId: string;
  let customerId: string;

  // Farm B: fiscal year closing.
  let closedFarmId: string;
  let closedToken: string;
  let closedBatchId: string;

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const post = (url: string, body: object, t = token) =>
    request(server).post(url).set(bearer(t)).send(body);
  const get = (url: string, t = token) =>
    request(server).get(url).set(bearer(t));
  const del = (url: string, t = token) =>
    request(server).delete(url).set(bearer(t));

  const balance = async (id = farmId, t = token): Promise<number> =>
    (await get(`/farms/${id}/caisse/current`, t).expect(200)).body
      .expectedBalanceFcfa;

  const sale = (
    payments: object[],
    qty = 1,
    unitPriceFcfa = 5000,
    extra: object = {},
    id = farmId,
    b = batchId,
    t = token,
  ) =>
    post(
      `/farms/${id}/sales`,
      {
        customerName: 'Client régression',
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: qty,
            unit: 'PIECE',
            unitPriceFcfa,
            batchId: b,
          },
        ],
        payments,
        ...extra,
      },
      t,
    );

  const order = (qty: number, unitPriceFcfa: number, deposit?: object) =>
    post(`/farms/${farmId}/orders`, {
      canal: 'FERME',
      expectedDate: today(),
      customerId,
      items: [
        {
          productType: 'POULET_PIECE',
          quantity: qty,
          unit: 'PIECE',
          unitPriceFcfa,
          batchId,
        },
      ],
      ...(deposit ? { deposit } : {}),
    });

  async function newBatch(id: string, t: string): Promise<string> {
    const res = await request(server)
      .post(`/farms/${id}/batches`)
      .set(bearer(t))
      .send({
        batchName: 'Lot régression',
        integrationDate: daysAgo(45),
        quantityAtStart: 400,
        type: 'CHAIR',
        couvoirSupplier: 'Canabec',
        chickLotNumber: `RG-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        hatchDate: today(),
      })
      .expect(201);
    return res.body.id as string;
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
    ds = app.get(DataSource);

    const admin = await createPlatformAdmin(server, ds);
    adminToken = admin.token;

    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Régression ${uniquePhone('')}`,
    });
    farmId = farm.farmId;
    token = farm.ownerToken;
    batchId = await newBatch(farmId, token);
    const cust = await post(`/farms/${farmId}/customers`, {
      fullName: 'Cliente Régression',
      phone: uniquePhone(),
    }).expect(201);
    customerId = cust.body.id;
    await post(`/farms/${farmId}/caisse/open`, {
      openingBalanceFcfa: 100000,
    }).expect(201);

    const farmB = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Exercice clos ${uniquePhone('')}`,
    });
    closedFarmId = farmB.farmId;
    closedToken = farmB.ownerToken;
    closedBatchId = await newBatch(closedFarmId, closedToken);

    // Mobile money is off by default (cash only): the refund tests need it.
    await request(server)
      .patch('/admin/payment-methods/MOBILE_MONEY')
      .set(bearer(adminToken))
      .send({ enabled: true })
      .expect(200);
  }, 90_000);

  afterAll(async () => {
    await request(server)
      .patch('/admin/payment-methods/MOBILE_MONEY')
      .set(bearer(adminToken))
      .send({ enabled: false })
      .then(() => undefined)
      .catch(() => undefined);
    await app.close();
  });

  // ------------------------------------------------------------------ POS

  describe('POS espèces (comportement existant)', () => {
    it('vente soldée, encaissement complémentaire, sur-paiement refusé', async () => {
      const before = await balance();
      const created = await sale([{ method: 'CASH', amountFcfa: 4000 }], 1, 10000);
      expect(created.status).toBe(201);
      expect(created.body.sale.status).toBe('OUTSTANDING');
      expect(created.body.sale.referenceNumber).toMatch(/^VTE-\d{8}-\d{6}$/);
      const saleId = created.body.sale.id as string;
      expect(await balance()).toBe(before + 4000);

      const over = await post(`/farms/${farmId}/sales/${saleId}/payments`, {
        method: 'CASH',
        amountFcfa: 7000,
      });
      expect(over.status).toBe(400);
      expect(over.body.message).toContain('dépasse le solde');

      await post(`/farms/${farmId}/sales/${saleId}/payments`, {
        method: 'CASH',
        amountFcfa: 6000,
      }).expect(201);
      expect(await balance()).toBe(before + 10000);
    });

    it('annulation d’une vente en espèces : la caisse rend l’encaissement', async () => {
      const before = await balance();
      const created = await sale([{ method: 'CASH', amountFcfa: 5000 }]);
      expect(created.status).toBe(201);
      expect(await balance()).toBe(before + 5000);
      await del(`/farms/${farmId}/sales/${created.body.sale.id}`).expect(200);
      expect(await balance()).toBe(before);
    });

    it('six ventes simultanées : toutes passent, références distinctes', async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          sale([{ method: 'CASH', amountFcfa: 1000 }], 1, 1000),
        ),
      );
      for (const r of results) expect(r.status).toBe(201);
      const refs = results.map((r) => r.body.sale.referenceNumber);
      expect(new Set(refs).size).toBe(6);
    });
  });

  // -------------------------------------------- remboursement non espèces

  describe('remboursement non espèces : jamais de mouvement de caisse', () => {
    it('vente payée en mobile money : la caisse ne bouge ni à la vente ni à l’annulation', async () => {
      const before = await balance();
      const created = await sale([
        { method: 'MOBILE_MONEY', amountFcfa: 5000 },
      ]);
      expect(created.status).toBe(201);
      expect(await balance()).toBe(before);
      await del(`/farms/${farmId}/sales/${created.body.sale.id}`).expect(200);
      expect(await balance()).toBe(before);
    });

    it('annulation d’une vente mobile money SANS session de caisse ouverte → 200', async () => {
      const created = await sale([
        { method: 'MOBILE_MONEY', amountFcfa: 5000 },
      ]);
      expect(created.status).toBe(201);
      const current = await balance();
      await post(`/farms/${farmId}/caisse/close`, {
        declaredBalanceFcfa: current,
      }).expect(201);
      await del(`/farms/${farmId}/sales/${created.body.sale.id}`).expect(200);
      // An all-cash sale still needs the register to trace its refund.
      await post(`/farms/${farmId}/caisse/open`, {
        openingBalanceFcfa: current,
      }).expect(201);
      const cash = await sale([{ method: 'CASH', amountFcfa: 2000 }], 1, 2000);
      await post(`/farms/${farmId}/caisse/close`, {
        declaredBalanceFcfa: current + 2000,
      }).expect(201);
      const refused = await del(`/farms/${farmId}/sales/${cash.body.sale.id}`);
      expect(refused.status).toBe(400);
      expect(refused.body.message).toContain('session de caisse');
      await post(`/farms/${farmId}/caisse/open`, {
        openingBalanceFcfa: current + 2000,
      }).expect(201);
      await del(`/farms/${farmId}/sales/${cash.body.sale.id}`).expect(200);
    });
  });

  // ------------------------------------------------------ acompte > total

  describe('acompte supérieur au total', () => {
    it('à la création du bon et sur /deposit : refusé (400), rien n’est encaissé', async () => {
      const before = await balance();
      const tooMuch = await order(2, 5000, { method: 'CASH', amountFcfa: 20000 });
      expect(tooMuch.status).toBe(400);
      expect(tooMuch.body.message).toContain('dépasse le solde');

      const created = await order(2, 5000);
      expect(created.status).toBe(201);
      const over = await post(
        `/farms/${farmId}/orders/${created.body.id}/deposit`,
        { method: 'CASH', amountFcfa: 10001 },
      );
      expect(over.status).toBe(400);
      expect(await balance()).toBe(before);

      const exact = await post(
        `/farms/${farmId}/orders/${created.body.id}/deposit`,
        { method: 'CASH', amountFcfa: 10000 },
      );
      expect(exact.status).toBe(201);
      expect(exact.body.status).toBe('CONFIRMED');
      expect(exact.body.sale.status).toBe('SETTLED');
      expect(exact.body.depositFcfa).toBe(10000);
    });

    it('livraison à un total final plus bas (espèces) : l’excédent ressort de la caisse', async () => {
      const created = await order(10, 3500, { method: 'CASH', amountFcfa: 30000 });
      expect(created.status).toBe(201);
      const before = await balance();
      const saleItemId = created.body.items[0].saleItemId as string;
      const delivered = await post(
        `/farms/${farmId}/orders/${created.body.id}/livrer`,
        { items: [{ saleItemId, quantity: 5 }] },
      );
      expect(delivered.status).toBe(201);
      expect(delivered.body.status).toBe('LIVRE');
      expect(delivered.body.totalAmountFcfa).toBe(17500);
      expect(delivered.body.depositFcfa).toBe(17500);
      expect(delivered.body.sale.status).toBe('SETTLED');
      // 30 000 collected, 17 500 due: 12 500 handed back in cash.
      expect(await balance()).toBe(before - 12500);
    });

    it('même scénario en mobile money : rien ne sort de la caisse', async () => {
      const created = await order(10, 3500, {
        method: 'MOBILE_MONEY',
        amountFcfa: 30000,
      });
      expect(created.status).toBe(201);
      const before = await balance();
      const saleItemId = created.body.items[0].saleItemId as string;
      const delivered = await post(
        `/farms/${farmId}/orders/${created.body.id}/livrer`,
        { items: [{ saleItemId, quantity: 5 }] },
      );
      expect(delivered.status).toBe(201);
      expect(delivered.body.status).toBe('LIVRE');
      expect(delivered.body.depositFcfa).toBe(17500);
      expect(await balance()).toBe(before);
    });

    it('livraison payée au comptant : bon CMD, vente soldée, caisse créditée', async () => {
      const created = await order(3, 5000);
      expect(created.body.referenceNumber).toMatch(/^CMD-\d{8}-\d{6}$/);
      const before = await balance();
      const delivered = await post(
        `/farms/${farmId}/orders/${created.body.id}/livrer`,
        { payment: { method: 'CASH', amountFcfa: 15000 } },
      );
      expect(delivered.status).toBe(201);
      expect(delivered.body.sale.status).toBe('SETTLED');
      expect(await balance()).toBe(before + 15000);
    });
  });

  // ------------------------------------------------- exercice clôturé

  describe('exercice comptable clôturé', () => {
    let openSaleId: string;
    const jul = '2025-07-01';

    beforeAll(async () => {
      await post(
        `/farms/${closedFarmId}/caisse/open`,
        { openingBalanceFcfa: 50000 },
        closedToken,
      ).expect(201);
      // A vente still open on the books, before the year is closed.
      const open = await sale(
        [{ method: 'CASH', amountFcfa: 1000 }],
        1,
        5000,
        {},
        closedFarmId,
        closedBatchId,
        closedToken,
      );
      expect(open.status).toBe(201);
      openSaleId = open.body.sale.id;

      await post(
        `/farms/${closedFarmId}/accounting/entries`,
        {
          date: '2025-06-15',
          label: 'Régularisation 2025',
          lines: [
            { account: '6011', debitFcfa: 2000 },
            { account: '471', creditFcfa: 2000 },
          ],
        },
        closedToken,
      ).expect(201);
      const exercices = await get(
        `/farms/${closedFarmId}/accounting/exercices`,
        closedToken,
      ).expect(200);
      const ex2025 = (exercices.body as any[]).find(
        (e) => e.startDate === '2025-01-01',
      );
      expect(ex2025).toBeDefined();
      await post(
        `/farms/${closedFarmId}/accounting/exercices/${ex2025.id}/close`,
        {},
        closedToken,
      ).expect(201);
    }, 60_000);

    it('vente datée dans l’exercice clos → 400', async () => {
      const res = await sale(
        [{ method: 'CASH', amountFcfa: 5000 }],
        1,
        5000,
        { saleDate: jul },
        closedFarmId,
        closedBatchId,
        closedToken,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('clôturé');
    });

    it('dépense datée dans l’exercice clos → 400 ; dépense du jour → 201', async () => {
      const refused = await post(
        `/farms/${closedFarmId}/expenses`,
        { category: 'EAU', amountFcfa: 1500, expenseDate: jul },
        closedToken,
      );
      expect(refused.status).toBe(400);
      expect(refused.body.message).toContain('clôturé');
      await post(
        `/farms/${closedFarmId}/expenses`,
        { category: 'EAU', amountFcfa: 1500 },
        closedToken,
      ).expect(201);
    });

    it('mouvement de caisse manuel daté dans l’exercice clos → 400 ; du jour → 201', async () => {
      const refused = await post(
        `/farms/${closedFarmId}/caisse/movements`,
        { type: 'IN', amountFcfa: 1000, movementDate: jul },
        closedToken,
      );
      expect(refused.status).toBe(400);
      expect(refused.body.message).toContain('clôturé');
      await post(
        `/farms/${closedFarmId}/caisse/movements`,
        { type: 'IN', amountFcfa: 1000 },
        closedToken,
      ).expect(201);
    });

    it('encaissement daté dans l’exercice clos → 400 ; encaissement du jour → 201', async () => {
      const refused = await post(
        `/farms/${closedFarmId}/sales/${openSaleId}/payments`,
        { method: 'CASH', amountFcfa: 1000, paymentDate: jul },
        closedToken,
      );
      expect(refused.status).toBe(400);
      expect(refused.body.message).toContain('clôturé');
      await post(
        `/farms/${closedFarmId}/sales/${openSaleId}/payments`,
        { method: 'CASH', amountFcfa: 1000 },
        closedToken,
      ).expect(201);
    });

    it('régularisation manuelle dans l’exercice clos → 400 (existant)', async () => {
      await post(
        `/farms/${closedFarmId}/accounting/entries`,
        {
          date: jul,
          label: 'Trop tard',
          lines: [
            { account: '6011', debitFcfa: 100 },
            { account: '471', creditFcfa: 100 },
          ],
        },
        closedToken,
      ).expect(400);
    });
  });

  // ------------------------------------------- références & import xlsx

  describe('références uniques et import xlsx', () => {
    it('retryOnReferenceCollision rejoue sur collision de référence, pas sur les autres erreurs', async () => {
      const collision = {
        code: '23505',
        constraint: 'UQ_sales_reference_number',
      };
      expect(isReferenceCollision(collision)).toBe(true);
      expect(
        isReferenceCollision({
          code: '23505',
          constraint: 'IDX_sales_farm_idempotency',
        }),
      ).toBe(false);

      let calls = 0;
      const out = await retryOnReferenceCollision(async () => {
        calls++;
        if (calls < 3) throw collision;
        return 'ok';
      });
      expect(out).toBe('ok');
      expect(calls).toBe(3);

      let other = 0;
      await expect(
        retryOnReferenceCollision(async () => {
          other++;
          throw { code: '23505', constraint: 'IDX_x_idempotency' };
        }),
      ).rejects.toBeDefined();
      expect(other).toBe(1);
    });

    it('classeur légitime lu ; bombe zip refusée avant décompression', async () => {
      const ok = await toXlsx(['a', 'b'], [[1, 'x']]);
      expect(() => assertXlsxNotBomb(ok)).not.toThrow();
      expect(await readXlsx(ok)).toEqual([
        ['a', 'b'],
        ['1', 'x'],
      ]);

      const bomb = zipDeclaring(200 * 1024 * 1024);
      expect(bomb.length).toBeLessThan(5 * 1024 * 1024);
      expect(() => assertXlsxNotBomb(bomb)).toThrow(/volumineux/);
      await expect(readXlsx(bomb)).rejects.toThrow(/volumineux/);
    });

    it('dépôt d’une bombe zip sur /programme/imports → 400 (pas de 500)', async () => {
      const res = await request(server)
        .post('/programme/imports')
        .set(bearer(adminToken))
        .field('type', 'AMI')
        .attach('file', zipDeclaring(200 * 1024 * 1024), {
          filename: 'reprise.xlsx',
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain('volumineux');
    });
  });

  // ------------------------------------------------------------------ auth

  describe('authentification', () => {
    it('verrouillage : 5 échecs → compte verrouillé, message neutre sur mauvais code, verrou non renouvelé', async () => {
      const buyer = await registerBuyer(server);
      const wrong = () =>
        request(server)
          .post('/auth/login')
          .send({ phone: buyer.phone, code: 'mauvais-code' });
      const unknown = await request(server)
        .post('/auth/login')
        .send({ phone: uniquePhone(), code: 'mauvais-code' });
      expect(unknown.status).toBe(401);

      for (let i = 0; i < 5; i++) {
        const res = await wrong();
        expect(res.status).toBe(401);
        // Same words as an unknown number: nothing to enumerate.
        expect(res.body.message).toBe(unknown.body.message);
      }

      const locked = await request(server)
        .post('/auth/login')
        .send({ phone: buyer.phone, code: buyer.code });
      expect(locked.status).toBe(401);
      expect(locked.body.message).toContain('verrouillé');

      // A wrong code on a locked account still reads like any wrong code ...
      const stillWrong = await wrong();
      expect(stillWrong.body.message).toBe(unknown.body.message);
      // ... and does not push the end of the lock further.
      // The lock is per account + IP (login_failures); the account-wide
      // counter keeps counting towards its much higher ceiling.
      const lockSql = `SELECT f.locked_until, u.failed_logins FROM login_failures f
         JOIN users u ON u.id = f.user_id WHERE u.phone = $1`;
      const [row] = await ds.query(lockSql, [buyer.phone]);
      expect(Number(row.failed_logins)).toBe(5);
      const until = new Date(row.locked_until).getTime();
      expect(until).toBeGreaterThan(Date.now());
      expect(until).toBeLessThanOrEqual(Date.now() + 15 * 60_000 + 5_000);
      await wrong();
      const [after] = await ds.query(lockSql, [buyer.phone]);
      expect(new Date(after.locked_until).getTime()).toBe(until);
      expect(Number(after.failed_logins)).toBe(5);

      // The lock is time-bounded: once it ran out, the right code works.
      await ds.query(
        `UPDATE login_failures SET locked_until = now() - interval '1 minute'
         WHERE user_id = (SELECT id FROM users WHERE phone = $1)`,
        [buyer.phone],
      );
      expect(await login(server, buyer.phone, buyer.code)).toBeTruthy();
    });

    it('inscription acheteur : numéro libre → 201 ; numéro pris → 409 au message neutre', async () => {
      const buyer = await registerBuyer(server);
      const again = await request(server).post('/auth/register-buyer').send({
        phone: buyer.phone,
        fullName: 'Doublon',
        code: 'secret123',
      });
      expect(again.status).toBe(409);
      expect(String(again.body.message)).not.toMatch(/existe déjà/i);
      expect(String(again.body.message)).not.toContain(buyer.phone);
    });

    it('un acheteur ne peut pas lire les finances d’une ferme (périmètre)', async () => {
      const buyer = await registerBuyer(server);
      const res = await get(`/farms/${farmId}/caisse/current`, buyer.token);
      expect([401, 403, 404]).toContain(res.status);
      const other = await createProgrammeFarm(server, adminToken);
      const cross = await get(
        `/farms/${farmId}/caisse/current`,
        other.ownerToken,
      );
      expect([403, 404]).toContain(cross.status);
      const crossSale = await sale(
        [{ method: 'CASH', amountFcfa: 1000 }],
        1,
        1000,
        {},
        farmId,
        batchId,
        other.ownerToken,
      );
      expect([403, 404]).toContain(crossSale.status);
    });
  });
});
