// Regression wave 3: lockout keyed per account + IP, optional pagination of
// the remaining lists, lot re-opening, read-only institutions on GETs that
// used to write, concurrent EC- references.
process.env.INSTITUTION_OTP = 'off';

import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { slicePage } from './../src/common/utils/pagination.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  registerBuyer,
  uniquePhone,
} from './helpers/programme-farm.js';

describe('Regression wave 3 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let farmId: string;
  let token: string;

  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');
  const today = new Date().toISOString().slice(0, 10);
  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

  const get = (url: string, t = token) =>
    request(server).get(url).set(auth(t));
  const post = (url: string, body: object, t = token) =>
    request(server).post(url).set(auth(t)).send(body);

  async function newBatch(qty: number): Promise<string> {
    const res = await post(`/farms/${farmId}/batches`, {
      batchName: `Lot wave3 ${qty}`,
      integrationDate: daysAgo(45),
      quantityAtStart: qty,
      type: 'CHAIR',
      couvoirSupplier: 'Canabec',
      chickLotNumber: `W3-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      hatchDate: today,
    }).expect(201);
    return res.body.id as string;
  }

  const sale = (batchId: string, qty: number, payments: object[] = []) =>
    post(`/farms/${farmId}/sales`, {
      customerName: 'Client wave3',
      items: [
        {
          productType: 'POULET_PIECE',
          quantity: qty,
          unit: 'PIECE',
          unitPriceFcfa: 2000,
          batchId,
        },
      ],
      payments,
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    // Lets the specs play several client addresses through X-Forwarded-For.
    (
      app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }
    ).set('trust proxy', true);
    await app.init();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    adminToken = (await createPlatformAdmin(server, ds)).token;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Wave3 ${tag}`,
    });
    farmId = farm.farmId;
    token = farm.ownerToken;
    await post(`/farms/${farmId}/caisse/open`, {
      openingBalanceFcfa: 100000,
    }).expect(201);
  }, 90_000);

  afterAll(async () => {
    await app.close();
  });

  // ----------------------------------------------------------- 1. lockout

  describe('verrouillage par compte + adresse IP', () => {
    const attempt = (phone: string, code: string, ip: string) =>
      request(server)
        .post('/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ phone, code });

    it('un inconnu qui échoue depuis son adresse ne verrouille pas le propriétaire ailleurs', async () => {
      const buyer = await registerBuyer(server);
      for (let i = 0; i < 5; i++) {
        expect((await attempt(buyer.phone, 'mauvais', '198.51.100.7')).status).toBe(
          401,
        );
      }
      // The attacker's address is locked, even with the right code ...
      const blocked = await attempt(buyer.phone, buyer.code, '198.51.100.7');
      expect(blocked.status).toBe(401);
      expect(blocked.body.message).toContain('verrouillé');
      // ... the owner, from his own address, gets in.
      const ok = await attempt(buyer.phone, buyer.code, '203.0.113.9');
      expect(ok.status).toBe(201);
      const [row] = await ds.query(
        `SELECT locked_until FROM users WHERE phone = $1`,
        [buyer.phone],
      );
      expect(row.locked_until).toBeNull();
    });

    it('plafond global par compte : atteint depuis plusieurs adresses, il verrouille tout le monde', async () => {
      const buyer = await registerBuyer(server);
      await ds.query(`UPDATE users SET failed_logins = 49 WHERE phone = $1`, [
        buyer.phone,
      ]);
      await attempt(buyer.phone, 'mauvais', '198.51.100.20').expect(401);
      const fresh = await attempt(buyer.phone, buyer.code, '203.0.113.50');
      expect(fresh.status).toBe(401);
      expect(fresh.body.message).toContain('verrouillé');
    });
  });

  // ---------------------------------------------------------- 2. pagination

  describe('pagination facultative', () => {
    let batchId: string;

    beforeAll(async () => {
      batchId = await newBatch(300);
      for (let i = 0; i < 3; i++) {
        await sale(batchId, 1, [{ method: 'CASH', amountFcfa: 1000 }]).expect(
          201,
        );
        await post(`/farms/${farmId}/expenses`, {
          category: 'ALIMENTS',
          amountFcfa: 1000 + i,
          label: `Dépense wave3 ${i}`,
          batchId,
        }).expect(201);
      }
    }, 60_000);

    const lists = ['sales', 'expenses', 'payments', 'alerts', 'feed-stock/movements'];

    it('sans paramètre : tableau complet, forme inchangée', async () => {
      for (const path of ['sales', 'expenses', 'payments']) {
        const res = await get(`/farms/${farmId}/${path}`).expect(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('limit / offset : pages disjointes et bornées', async () => {
      for (const path of ['sales', 'expenses', 'payments']) {
        const full = (await get(`/farms/${farmId}/${path}`).expect(200)).body;
        const p1 = (await get(`/farms/${farmId}/${path}?limit=2`).expect(200))
          .body;
        const p2 = (
          await get(`/farms/${farmId}/${path}?limit=2&offset=2`).expect(200)
        ).body;
        expect(p1).toHaveLength(2);
        expect(p1.map((r: { id: string }) => r.id)).toEqual(
          full.slice(0, 2).map((r: { id: string }) => r.id),
        );
        const ids2 = p2.map((r: { id: string }) => r.id);
        expect(ids2.length).toBeGreaterThan(0);
        expect(ids2).toEqual(
          full.slice(2, 2 + ids2.length).map((r: { id: string }) => r.id),
        );
      }
      // A sale keeps its joined items/payments when paged.
      const paged = (await get(`/farms/${farmId}/sales?limit=1`).expect(200))
        .body;
      expect(paged[0].items.length).toBeGreaterThan(0);
    });

    it('alertes, mouvements de stock, commandes Market : paramètres acceptés', async () => {
      for (const path of ['alerts', 'feed-stock/movements']) {
        const res = await get(`/farms/${farmId}/${path}?limit=1`).expect(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeLessThanOrEqual(1);
      }
      const orders = await get(
        `/farms/${farmId}/market/orders?limit=1&offset=0`,
      );
      expect(orders.status).toBe(200);
      expect(orders.body.length).toBeLessThanOrEqual(1);
      const buyer = await registerBuyer(server);
      const mine = await get('/market/orders?limit=5', buyer.token).expect(200);
      expect(mine.body).toEqual([]);
      expect(lists.length).toBe(5);
    });

    it('valeurs invalides : 400', async () => {
      for (const q of ['limit=0', 'limit=abc', 'offset=-1']) {
        await get(`/farms/${farmId}/sales?${q}`).expect(400);
        await get(`/farms/${farmId}/expenses?${q}`).expect(400);
      }
    });

    it('slicePage : sans paramètre le tableau reste entier', () => {
      expect(slicePage([1, 2, 3], {})).toEqual([1, 2, 3]);
      expect(slicePage([1, 2, 3], { take: 1, skip: 1 })).toEqual([2]);
      expect(slicePage([1, 2, 3], { skip: 2 })).toEqual([3]);
    });
  });

  // -------------------------------------------------------------- 3. FINI

  describe('lot FINI automatique : ré-ouverture', () => {
    const statusOf = async (id: string) =>
      (await get(`/farms/${farmId}/batches/${id}`).expect(200)).body;

    it('une sortie supprimée rouvre le lot épuisé, pas un lot clôturé à la main', async () => {
      const id = await newBatch(40);
      const sold = await sale(id, 40).expect(201);
      expect((await statusOf(id)).status).toBe('FINI');
      // The sale disappears from the books (e.g. corrected elsewhere) ...
      await ds.query(`UPDATE sales SET status = 'CANCELLED' WHERE id = $1`, [
        sold.body.sale.id,
      ]);
      // ... the next headcount recomputation brings the birds back and re-opens.
      await post(`/farms/${farmId}/batches/${id}/daily-entries`, {
        entryDate: today,
        deaths: 0,
      }).expect(201);
      const after = await statusOf(id);
      expect(after.quantityAlive).toBe(40);
      expect(['ACTIF', 'EN_VENTE']).toContain(after.status);

      // A lot closed by hand keeps its status.
      const closed = await newBatch(40);
      const s2 = await sale(closed, 40).expect(201);
      await ds.query(
        `UPDATE production_batches SET closed_at = now() WHERE id = $1`,
        [closed],
      );
      await ds.query(`UPDATE sales SET status = 'CANCELLED' WHERE id = $1`, [
        s2.body.sale.id,
      ]);
      await post(`/farms/${farmId}/batches/${closed}/daily-entries`, {
        entryDate: today,
        deaths: 0,
      }).expect(201);
      expect((await statusOf(closed)).status).toBe('FINI');
    });
  });

  // ------------------------------------------- 5. read-only institutions

  describe('institution : GET qui écrivaient', () => {
    it('clients sans code et points de vente : lecture sans écriture', async () => {
      const farm = await createProgrammeFarm(server, adminToken, {
        name: `Ferme Wave3 inst ${tag}`,
      });
      const fid = farm.farmId;
      // A legacy customer without code, and no default point of sale yet.
      const cust = await post(
        `/farms/${fid}/customers`,
        { fullName: 'Client legacy', phone: uniquePhone() },
        farm.ownerToken,
      ).expect(201);
      await ds.query(`UPDATE customers SET code = NULL WHERE id = $1`, [
        cust.body.id,
      ]);
      await ds.query(`DELETE FROM points_of_sale WHERE farm_id = $1`, [fid]);

      const code = `W3${tag}`;
      await post(
        '/programme/access/profiles',
        {
          code,
          label: `Profil ${code}`,
          scopeKind: 'FARMS',
          matrix: { REGISTRE: ['CONSULTER'], VENTES: ['CONSULTER'] },
        },
        adminToken,
      ).expect(201);
      const phone = uniquePhone();
      const m = await post(
        '/programme/access/memberships',
        { fullName: 'Lecteur wave3', phone, profileCode: code, farmIds: [fid] },
        adminToken,
      ).expect(201);
      const instToken = await login(server, phone, m.body.loginCode as string);

      await get(`/farms/${fid}/customers`, instToken).expect(200);
      await get(`/farms/${fid}/customers/${cust.body.id}`, instToken).expect(200);
      const pos = await get(`/farms/${fid}/points-of-sale`, instToken).expect(200);
      expect(pos.body).toEqual([]);
      const [c] = await ds.query(`SELECT code FROM customers WHERE id = $1`, [
        cust.body.id,
      ]);
      expect(c.code).toBeNull();
      const [{ n }] = await ds.query(
        `SELECT count(*)::int AS n FROM points_of_sale WHERE farm_id = $1`,
        [fid],
      );
      expect(n).toBe(0);

      // The owner's read still initialises both, once, even concurrently.
      await Promise.all([
        get(`/farms/${fid}/points-of-sale`, farm.ownerToken).expect(200),
        get(`/farms/${fid}/points-of-sale`, farm.ownerToken).expect(200),
        get(`/farms/${fid}/customers`, farm.ownerToken).expect(200),
      ]);
      const [{ n: after }] = await ds.query(
        `SELECT count(*)::int AS n FROM points_of_sale WHERE farm_id = $1 AND kind = 'FERME'`,
        [fid],
      );
      expect(after).toBe(1);
      const [c2] = await ds.query(`SELECT code FROM customers WHERE id = $1`, [
        cust.body.id,
      ]);
      expect(c2.code).toMatch(/^CL-/);
    });
  });

  // ------------------------------------------------ 6. EC- / references

  describe('références générées', () => {
    it('ventes simultanées : une écriture comptable par vente, références EC- distinctes', async () => {
      const batchId = await newBatch(200);
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          sale(batchId, 1, [{ method: 'CASH', amountFcfa: 2000 }]),
        ),
      );
      for (const r of results) expect(r.status).toBe(201);
      const rows = await ds.query(
        `SELECT reference FROM accounting_journal_entries WHERE farm_id = $1`,
        [farmId],
      );
      const refs = rows.map((r: { reference: string }) => r.reference);
      expect(refs.length).toBeGreaterThanOrEqual(8);
      expect(new Set(refs).size).toBe(refs.length);
      for (const r of refs) expect(r).toMatch(/^EC-\d{8}-\d{6}$/);
    });
  });
});
