import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { TraceLotsService } from './../src/modules/trace/trace-lots.service.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  uniquePhone,
} from './helpers/programme-farm.js';

/** `YYYY-MM-DD`, `n` days from today (UTC). */
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const NOTICE =
  "Ce QR code indique l'origine du produit. Il ne constitue pas un certificat sanitaire.";

describe('Programme POUFA — traçabilité des lots (L7, e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let ownerToken: string;
  let farmId: string;
  let farmName: string;
  let other: { farmId: string; ownerToken: string };

  let band: { id: string; code: string };
  let rootLot: { id: string; code: string; qrUrl: string };
  let subLot: { id: string; code: string; qrUrl: string };
  let abattoir: { id: string; code: string; name: string };

  // Letters, so names never resemble an earlier run's (duplicate checks).
  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');
  const digits = String(Date.now()).slice(-6);

  const get = (url: string, token = ownerToken) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token = ownerToken) =>
    request(server).post(url).set(auth(token)).send(body);
  const patch = (url: string, body: object, token = ownerToken) =>
    request(server).patch(url).set(auth(token)).send(body);

  async function openBand(quantityAtStart = 300, farm = farmId, token = ownerToken) {
    const res = await post(
      `/farms/${farm}/batches`,
      {
        batchName: `Bande trace ${tag}`,
        type: 'CHAIR',
        integrationDate: day(-20),
        quantityAtStart,
      },
      token,
    ).expect(201);
    return res.body as { id: string; code: string };
  }

  const lotsOf = async (batchId: string, farm = farmId, token = ownerToken) =>
    (await get(`/farms/${farm}/trace/lots?batchId=${batchId}`, token).expect(200))
      .body as Array<Record<string, any>>;

  /** `/l/<code>?s=<sig>` → the public API path. */
  const publicPath = (qrUrl: string) => {
    const u = new URL(qrUrl);
    return `/public/lots/${u.pathname.split('/').pop()}${u.search}`;
  };

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
    adminToken = (await createPlatformAdmin(server, ds)).token;
    farmName = `Ferme Traçabilité ${tag}`;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: farmName,
      exploitantName: 'Éleveur Trace',
    });
    farmId = farm.farmId;
    ownerToken = farm.ownerToken;
    other = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Voisine ${tag}`,
      provinceCode: 'G2',
    });
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('crée le lot racine avec la bande (code bande + L01, QR signé)', async () => {
    band = await openBand();
    const lots = await lotsOf(band.id);
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({
      kind: 'LOT',
      status: 'OUVERT',
      code: `${band.code}-L01`,
      bandeCode: band.code,
      quantity: 300,
      parentId: null,
    });
    expect(lots[0].qrUrl).toMatch(
      new RegExp(`^https://poufa\\.e2e\\.ga/l/${band.code}-L01\\?s=[A-Za-z0-9_-]{16}$`),
    );
    rootLot = lots[0] as typeof rootLot;
    // The token never leaves the server outside the QR address.
    expect(lots[0]).not.toHaveProperty('qrToken');
  });

  describe('registre des opérateurs', () => {
    it("l'administration crée un opérateur, code OP- jamais réutilisé", async () => {
      const res = await post(
        '/trace/operators',
        {
          typeCode: 'ABATTOIR',
          name: `Abattoir ${tag}`,
          contactName: 'Responsable réception',
          contactPhone: '+241 01 23 45 67',
          conventionRef: `CONV-${digits}`,
          conventionSignedAt: day(-30),
        },
        adminToken,
      ).expect(201);
      expect(res.body).toMatchObject({
        typeCode: 'ABATTOIR',
        typeLabel: 'Abattoir',
        typeFamily: 'ABATTOIR',
        contactPhone: '+24101234567',
        conventionSignedAt: day(-30),
        active: true,
      });
      expect(res.body.code).toMatch(/^OP-\d{4,}$/);
      abattoir = res.body;
    });

    it('refuse un doublon de nom, un type inconnu et une ferme', async () => {
      const dup = await post(
        '/trace/operators',
        { typeCode: 'ACHETEUR', name: `ABATTOIR  ${tag.toLowerCase()}` },
        adminToken,
      ).expect(409);
      expect(dup.body.message).toContain(abattoir.code);
      await post(
        '/trace/operators',
        { typeCode: 'INCONNU', name: `Autre ${tag}` },
        adminToken,
      ).expect(400);
      await post(
        '/trace/operators',
        { typeCode: 'ACHETEUR', name: `Acheteur ${tag}` },
      ).expect(403);
    });

    it('les fermes lisent les opérateurs actifs, pas les désactivés', async () => {
      const buyer = await post(
        '/trace/operators',
        { typeCode: 'ACHETEUR', name: `Grossiste ${tag}` },
        adminToken,
      ).expect(201);
      let list = (await get('/trace/operators?q=' + tag).expect(200)).body;
      expect(list.map((o: any) => o.id)).toEqual(
        expect.arrayContaining([abattoir.id, buyer.body.id]),
      );
      await patch(
        `/trace/operators/${buyer.body.id}`,
        { active: false },
        adminToken,
      ).expect(200);
      list = (await get('/trace/operators?q=' + tag).expect(200)).body;
      expect(list.map((o: any) => o.id)).not.toContain(buyer.body.id);
      await get('/trace/operators?all=true').expect(403);
      const all = (
        await get('/trace/operators?all=true&q=' + tag, adminToken).expect(200)
      ).body;
      expect(all.map((o: any) => o.id)).toContain(buyer.body.id);
      // An inactive operator cannot receive a cession.
      const refused = await post(`/farms/${farmId}/bandes/${band.id}/sorties`, {
        sortieDate: day(0),
        count: 5,
        reasonCode: 'REFORME',
        operatorId: buyer.body.id,
      }).expect(400);
      expect(refused.body.message).toContain('Opérateur inconnu ou inactif');
    });
  });

  describe('cession', () => {
    it('une sortie vers un opérateur crée un sous-lot et sa CESSION', async () => {
      const sortie = await post(`/farms/${farmId}/bandes/${band.id}/sorties`, {
        sortieDate: day(0),
        count: 120,
        weightKg: 250,
        reasonCode: 'ABATTOIR',
        operatorId: abattoir.id,
      }).expect(201);
      const lots = await lotsOf(band.id);
      const subs = lots.filter((l) => l.kind === 'SOUS_LOT');
      expect(subs).toHaveLength(1);
      expect(subs[0]).toMatchObject({
        code: `${rootLot.code}-01`,
        status: 'CEDE',
        parentId: rootLot.id,
        quantity: 120,
        weightKg: 250,
        sortieId: sortie.body.id,
        cededOn: day(0),
        operator: { id: abattoir.id, code: abattoir.code, typeLabel: 'Abattoir' },
      });
      subLot = subs[0] as typeof subLot;
    });

    it('une sortie sans opérateur ou vers un opérateur inconnu', async () => {
      await post(`/farms/${farmId}/bandes/${band.id}/sorties`, {
        sortieDate: day(0),
        count: 3,
        reasonCode: 'DON',
      }).expect(201);
      expect(
        (await lotsOf(band.id)).filter((l) => l.kind === 'SOUS_LOT'),
      ).toHaveLength(1);
      const before = (
        await get(`/farms/${farmId}/bandes/${band.id}/sorties`).expect(200)
      ).body.length;
      await post(`/farms/${farmId}/bandes/${band.id}/sorties`, {
        sortieDate: day(0),
        count: 3,
        reasonCode: 'REFORME',
        operatorId: '00000000-0000-4000-8000-000000000000',
      }).expect(400);
      // The whole sortie was rolled back.
      expect(
        (await get(`/farms/${farmId}/bandes/${band.id}/sorties`).expect(200))
          .body.length,
      ).toBe(before);
    });

    it("l'historique réunit lot, sous-lots, cessions et chronologie d'élevage", async () => {
      await post(`/farms/${farmId}/batches/${band.id}/health-events`, {
        kind: 'VISITE_VETO',
        occurredAt: day(-1),
        severity: 'VERT',
        title: `Visite ${tag}`,
      }).expect(201);
      const root = (
        await get(`/farms/${farmId}/trace/lots/${rootLot.id}`).expect(200)
      ).body;
      expect(root.lot.code).toBe(rootLot.code);
      expect(root.root).toBeNull();
      expect(root.subLots.map((l: any) => l.code)).toEqual([subLot.code]);
      expect(root.farm).toMatchObject({ id: farmId, name: farmName });
      expect(root.band).toMatchObject({ id: band.id, code: band.code });
      expect(root.events).toHaveLength(1);
      expect(root.events[0]).toMatchObject({
        type: 'CESSION',
        lotCode: subLot.code,
        operator: { id: abattoir.id },
        data: { count: 120, reasonCode: 'ABATTOIR' },
      });
      expect(root.events[0].actor.fullName).toBeTruthy();
      const kinds = root.rearing.map((r: any) => r.kind);
      expect(kinds[0]).toBe('OUVERTURE');
      expect(kinds).toEqual(
        expect.arrayContaining(['SORTIE', 'EVENEMENT_SANITAIRE']),
      );
      const cession = root.rearing.find(
        (r: any) => r.kind === 'SORTIE' && r.details.lotCode === subLot.code,
      );
      expect(cession.label).toContain(abattoir.name);

      const sub = (
        await get(`/farms/${farmId}/trace/lots/${subLot.id}`).expect(200)
      ).body;
      expect(sub.root.id).toBe(rootLot.id);
      expect(sub.events.map((e: any) => e.type)).toEqual(['CESSION']);

      const byCode = (
        await get(`/trace/lots/by-code/${subLot.code.toLowerCase()}`).expect(200)
      ).body;
      expect(byCode.lot.id).toBe(subLot.id);
      await get(`/trace/lots/by-code/${subLot.code}`, other.ownerToken).expect(
        403,
      );
      await get(`/farms/${farmId}/trace/lots/${subLot.id}`, other.ownerToken).expect(
        403,
      );
    });

    it("imprime l'étiquette du lot (PDF)", async () => {
      const res = await get(
        `/farms/${farmId}/trace/lots/${subLot.id}/label`,
      ).expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });
  });

  describe('page publique', () => {
    it('liste blanche, mention obligatoire, cache du navigateur seulement', async () => {
      const res = await request(server)
        .get(publicPath(subLot.qrUrl))
        .set('User-Agent', 'e2e-phone')
        .expect(200);
      expect(res.headers['cache-control']).toBe('private, max-age=300');
      expect(res.body).toMatchObject({
        code: subLot.code,
        kind: 'SOUS_LOT',
        status: 'CEDE',
        quantity: 120,
        producer: { farmName, province: expect.any(String) },
        band: { code: band.code, openedOn: day(-20) },
        operatorType: 'Abattoir',
        notice: NOTICE,
        consommonsGabonais: {
          label: 'Consommons Gabonais',
          url: 'https://poufa.e2e.ga/consommons-gabonais',
        },
      });
      const text = JSON.stringify(res.body);
      for (const forbidden of [
        farmId,
        band.id,
        abattoir.name,
        'Éleveur Trace',
        'phone',
        'latitude',
        'Fcfa',
      ]) {
        expect(text).not.toContain(forbidden);
      }
    });

    it('QR mal signé, sans signature ou inconnu : même refus, tous journalisés', async () => {
      const [path] = publicPath(subLot.qrUrl).split('?');
      const bad = await request(server).get(`${path}?s=AAAAAAAAAAAAAAAA`).expect(404);
      expect(bad.headers['cache-control']).toBe('no-store');
      await request(server).get(path).expect(404);
      const unknown = await request(server)
        .get(`/public/lots/${band.code}-L99?s=AAAAAAAAAAAAAAAA`)
        .expect(404);
      expect(unknown.body.message).toBe(bad.body.message);
      await request(server).get(`/public/lots/%27%3B%20DROP?s=x`).expect(404);

      const rows: { result: string; ip_hash: string | null; user_agent: string | null }[] =
        await ds.query(
          `SELECT result, ip_hash, user_agent FROM qr_scans
            WHERE lot_id = $1 ORDER BY scanned_at`,
          [subLot.id],
        );
      expect(rows.map((r) => r.result)).toEqual([
        'OK',
        'SIGNATURE_INVALIDE',
        'SIGNATURE_INVALIDE',
      ]);
      expect(rows[0].user_agent).toBe('e2e-phone');
      expect(rows[0].ip_hash).toMatch(/^[0-9a-f]{32}$/);
      expect(rows[0].ip_hash).not.toContain('127');
      const [unknownRow] = await ds.query(
        `SELECT lot_id, result FROM qr_scans WHERE code = $1 ORDER BY scanned_at DESC LIMIT 1`,
        [`${band.code}-L99`],
      );
      expect(unknownRow).toEqual({ lot_id: null, result: 'INCONNU' });
      // The journal is append-only.
      await expect(
        ds.query(`DELETE FROM qr_scans WHERE lot_id = $1`, [subLot.id]),
      ).rejects.toThrow(/ni modifié ni supprimé/);

      const history = (
        await get(`/farms/${farmId}/trace/lots/${subLot.id}`).expect(200)
      ).body;
      expect(history.scans).toMatchObject({
        scans: 3,
        ok: 1,
        badSignature: 2,
        afterClosure: 0,
      });
    });

    it('lot racine clos avec la bande : QR rejeté (410), le sous-lot reste valide', async () => {
      const alive = (
        await get(`/farms/${farmId}/batches/${band.id}`).expect(200)
      ).body.quantityAlive as number;
      await post(`/farms/${farmId}/bandes/${band.id}/sorties`, {
        sortieDate: day(0),
        count: alive,
        reasonCode: 'REFORME',
      }).expect(201);
      // The stored status follows the BATCH_CLOSED listener; reads already
      // treat the root lot as closed.
      await app.get(TraceLotsService).closeRootLot(band.id);
      const [{ status }] = await ds.query(
        `SELECT status FROM trace_lots WHERE id = $1`,
        [rootLot.id],
      );
      expect(status).toBe('CLOS');
      const closed = await request(server)
        .get(publicPath(rootLot.qrUrl))
        .expect(410);
      expect(closed.body.message).toContain('clos');
      await request(server).get(publicPath(subLot.qrUrl)).expect(200);
      const history = (
        await get(`/farms/${farmId}/trace/lots/${rootLot.id}`).expect(200)
      ).body;
      expect(history.lot.status).toBe('CLOS');
      expect(history.scans.afterClosure).toBe(1);
    });
  });

  it("bande antérieure : lot racine créé à la première lecture, numéro jamais réutilisé", async () => {
    const older = await openBand(100);
    // As if opened before traceability existed.
    await ds.query(`DELETE FROM trace_lots WHERE batch_id = $1`, [older.id]);
    const lots = await lotsOf(older.id);
    expect(lots).toHaveLength(1);
    expect(lots[0].code).toBe(`${older.code}-L02`);
    expect(lots[0].status).toBe('OUVERT');
  });

  it('accès institutionnel : TRACABILITE dans le périmètre seulement', async () => {
    const profileCode = `TRAC${digits}`;
    await post(
      '/programme/access/profiles',
      {
        code: profileCode,
        label: `Traçabilité ${digits}`,
        scopeKind: 'FARMS',
        matrix: { TRACABILITE: ['CONSULTER'] },
      },
      adminToken,
    ).expect(201);
    const phone = uniquePhone();
    const created = await post(
      '/programme/access/memberships',
      { fullName: `Agent trace ${digits}`, phone, profileCode, farmIds: [farmId] },
      adminToken,
    ).expect(201);
    const token = await login(server, phone, created.body.loginCode);

    const history = (
      await get(`/farms/${farmId}/trace/lots/${rootLot.id}`, token).expect(200)
    ).body;
    // No names of people, no sanitary declarations (veterinary services only).
    expect(history.events[0].actor.fullName).toBeNull();
    expect(
      history.rearing.some((r: any) => r.kind === 'EVENEMENT_SANITAIRE'),
    ).toBe(false);
    await get(`/trace/lots/by-code/${subLot.code}`, token).expect(200);
    // Reference data: active operators.
    await get('/trace/operators', token).expect(200);
    await post('/trace/operators', { typeCode: 'ABATTOIR', name: `X ${tag}` }, token).expect(403);

    const otherBand = await openBand(50, other.farmId, other.ownerToken);
    const [otherLot] = await lotsOf(otherBand.id, other.farmId, other.ownerToken);
    await get(`/farms/${other.farmId}/trace/lots`, token).expect(403);
    await get(`/trace/lots/by-code/${otherLot.code}`, token).expect(403);
  });

  it('un client de la ferme peut être relié à un opérateur', async () => {
    const customer = await post(`/farms/${farmId}/customers`, {
      fullName: `Client trace ${tag}`,
    }).expect(201);
    const linked = await patch(`/farms/${farmId}/customers/${customer.body.id}`, {
      operatorId: abattoir.id,
    }).expect(200);
    expect(linked.body.operatorId).toBe(abattoir.id);
    await patch(`/farms/${farmId}/customers/${customer.body.id}`, {
      operatorId: '00000000-0000-4000-8000-000000000000',
    }).expect(400);
    const cleared = await patch(
      `/farms/${farmId}/customers/${customer.body.id}`,
      { operatorId: null },
    ).expect(200);
    expect(cleared.body.operatorId).toBeNull();
  });
});
