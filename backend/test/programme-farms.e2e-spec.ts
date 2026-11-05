// The programme layer is inert unless PROGRAM_CODE is set: set it before the
// app (and its ConfigModule) loads.
process.env.PROGRAM_CODE = 'POUFA';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';

const POUFA_CSV = readFileSync(
  join(process.cwd(), 'test', 'fixtures', 'fermes-poufa.csv'),
);

describe('Programme POUFA — registre des fermes (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let ownerToken: string;
  let programId: string;

  const stamp = Date.now();
  const digits = String(stamp).slice(-7);
  /** Synthetic square far from Gabon (Atlantic), so it can't mislead anyone. */
  const SQUARE = {
    type: 'Polygon',
    coordinates: [
      [
        [1, -11],
        [2, -11],
        [2, -10],
        [1, -10],
        [1, -11],
      ],
    ],
  };
  const SQUARE_PROVINCE = 'G6';
  let savedGeometry: unknown = null;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (url: string, token = adminToken) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token = adminToken) =>
    request(server).post(url).set(auth(token)).send(body);
  const patch = (url: string, body: object, token = adminToken) =>
    request(server).patch(url).set(auth(token)).send(body);
  const put = (url: string, body: object, token = adminToken) =>
    request(server).put(url).set(auth(token)).send(body);
  const importCsv = (dryRun?: boolean) => {
    const req = request(server)
      .post('/programme/farms/import')
      .set(auth(adminToken))
      .attach('file', POUFA_CSV, 'fermes-poufa.csv');
    return dryRun === undefined ? req : req.field('dryRun', String(dryRun));
  };

  async function register(phone: string, fullName = 'Registre E2E') {
    await request(server)
      .post('/auth/register')
      .send({ phone, fullName, code: 'secret123' })
      .expect(201);
  }

  async function login(phone: string, code = 'secret123'): Promise<string> {
    const res = await request(server)
      .post('/auth/login')
      .send({ phone, code })
      .expect(201);
    return res.body.accessToken;
  }

  /** Removes every programme farm left by an earlier run (test DB only). */
  async function resetRegistry() {
    const scope = `SELECT id FROM farms WHERE program_id = $1`;
    await ds.query(
      `DELETE FROM farm_status_history WHERE farm_id IN (${scope})`,
      [programId],
    );
    await ds.query(
      `DELETE FROM farm_gps_history WHERE farm_id IN (${scope})`,
      [programId],
    );
    await ds.query(
      `DELETE FROM farm_infrastructures WHERE farm_id IN (${scope})`,
      [programId],
    );
    await ds.query(`DELETE FROM farms WHERE program_id = $1`, [programId]);
    // Codes are never reused in real life; a test DB starts over.
    await ds.query(`DELETE FROM id_counters WHERE scope LIKE 'FARM:%'`);
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

    const [program] = await ds.query(
      `SELECT id FROM programs WHERE code = 'POUFA'`,
    );
    programId = program.id;
    await resetRegistry();

    const ownerPhone = `+24165${digits}`;
    await register(ownerPhone);
    ownerToken = await login(ownerPhone);
    const adminPhone = `+24166${digits}`;
    await register(adminPhone);
    await ds.query(
      `UPDATE users SET role = 'PLATFORM_ADMIN' WHERE phone = $1`,
      [adminPhone],
    );
    adminToken = await login(adminPhone);

    const [row] = await ds.query(
      `SELECT geometry FROM provinces WHERE program_id = $1 AND code = $2`,
      [programId, SQUARE_PROVINCE],
    );
    savedGeometry = row?.geometry ?? null;
  });

  afterAll(async () => {
    await ds?.query(
      `UPDATE provinces SET geometry = $1 WHERE code = $2 AND program_id = $3`,
      [
        savedGeometry === null ? null : JSON.stringify(savedGeometry),
        SQUARE_PROVINCE,
        programId,
      ],
    );
    await app?.close();
    delete process.env.PROGRAM_CODE;
  });

  describe('import de la liste POUFA', () => {
    it('essai à blanc par défaut : 150 à créer, aucun rejet, rien d’écrit', async () => {
      const res = await importCsv().expect(201);
      expect(res.body).toMatchObject({
        dryRun: true,
        format: 'LISTE_POUFA',
        read: 150,
        created: 150,
        matched: 0,
        rejected: 0,
      });
      expect(
        res.body.lines.every((l: any) => l.outcome === 'A_CREER'),
      ).toBe(true);
      const [{ n }] = await ds.query(
        `SELECT COUNT(*)::int AS n FROM farms WHERE program_id = $1`,
        [programId],
      );
      expect(n).toBe(0);
    });

    it('import réel : 150 fermes créées, codes distincts par province', async () => {
      const res = await importCsv(false).expect(201);
      expect(res.body).toMatchObject({
        dryRun: false,
        read: 150,
        created: 150,
        matched: 0,
        rejected: 0,
      });
      const codes: string[] = res.body.lines.map((l: any) => l.code);
      expect(new Set(codes).size).toBe(150);
      const estuaire = codes.filter((c) => c.startsWith('G1-'));
      expect(estuaire).toHaveLength(90);
      expect(estuaire.every((c) => /^G1-\d{4}$/.test(c))).toBe(true);
      expect([...estuaire].sort()).toEqual(
        Array.from(
          { length: 90 },
          (_, i) => `G1-${String(i + 1).padStart(4, '0')}`,
        ),
      );
      // Woleu-Ntem (G9) holds 6 farms, among them the quoted « FERME DU NTEM, ONA & FILS ».
      const ntem = res.body.lines.find((l: any) =>
        l.name.includes('NTEM, ONA'),
      );
      expect(ntem.code).toMatch(/^G9-\d{4}$/);

      const rows = await ds.query(
        `SELECT f.owner_id, f.status_code, f.active, h.status_code AS h_code
           FROM farms f JOIN farm_status_history h ON h.farm_id = f.id
          WHERE f.program_id = $1`,
        [programId],
      );
      expect(rows).toHaveLength(150);
      expect(
        rows.every(
          (r: any) =>
            r.owner_id === null &&
            r.status_code === 'EN_PREPARATION' &&
            r.h_code === 'EN_PREPARATION' &&
            r.active === true,
        ),
      ).toBe(true);
    });

    it('relance : idempotente, 0 créée et 150 déjà présentes', async () => {
      const res = await importCsv(false).expect(201);
      expect(res.body).toMatchObject({ created: 0, matched: 150, rejected: 0 });
      const [{ n }] = await ds.query(
        `SELECT COUNT(*)::int AS n FROM farms WHERE program_id = $1`,
        [programId],
      );
      expect(n).toBe(150);
    });

    it('format complet en JSON : rapport par ligne avec motif de rejet', async () => {
      const res = await post('/programme/farms/import', {
        dryRun: false,
        rows: [
          {
            nom: `Ferme Complète ${stamp}`,
            province: 'estuaire',
            localite: 'Komo-Mondah',
            exploitant: 'Jeanne Complète',
            telephone: `077 ${digits.slice(0, 3)} ${digits.slice(3)}`,
            amiRef: `ami-json-${stamp}`,
            cohorte: '2',
            capacite: '1 200',
            latitude: '0,39',
            longitude: '9.45',
            statut: 'Opérationnelle',
          },
          { nom: `Ferme Perdue ${stamp}`, province: 'Atlantide' },
          { nom: '', province: 'G1' },
          {
            nom: `Ferme Inconnue ${stamp}`,
            province: 'G1',
            localite: 'Nulle part',
            cohorte: '9',
          },
          // Same farm written differently: already present (line 1).
          { nom: `FERME AVICOLE COMPLETE ${stamp}`, province: 'G1', amiRef: `AMI-JSON-${stamp}` },
          // An imported farm written without its space: the same key.
          { nom: 'AGRIVERT', province: 'Estuaire' },
          // A typo of it: probable duplicate, rejected.
          { nom: 'AGRI VERTT', province: 'Estuaire' },
        ],
      }).expect(201);
      expect(res.body).toMatchObject({
        format: 'COMPLET',
        read: 7,
        created: 1,
        matched: 2,
        rejected: 4,
      });
      const [created, lost, noName, unknown, again, same, typo] =
        res.body.lines;
      expect(created).toMatchObject({ outcome: 'CREEE' });
      expect(created.code).toMatch(/^G1-\d{4}$/);
      expect(lost).toMatchObject({
        outcome: 'REJETEE',
        reason: 'Province inconnue : « Atlantide ».',
      });
      expect(noName.reason).toBe('Nom manquant.');
      expect(unknown.reason).toContain('Localité inconnue dans la province Estuaire');
      expect(unknown.reason).toContain('Cohorte inconnue : « 9 »');
      expect(again).toMatchObject({ outcome: 'DEJA_PRESENTE', code: created.code });
      // "AGRIVERT" = "AGRI VERT" once spaces are ignored: an exact match.
      expect(same.outcome).toBe('DEJA_PRESENTE');
      expect(typo.outcome).toBe('REJETEE');
      expect(typo.reason).toMatch(/^Doublon probable de G1-\d{4} « AGRI VERT »/);
      expect(typo.duplicates[0].reasons).toEqual([
        'nom très proche dans la même province',
      ]);

      const sheet = await get(`/programme/farms/${created.farmId}`).expect(200);
      expect(sheet.body).toMatchObject({
        code: created.code,
        localite: { name: 'Komo-Mondah' },
        cohort: { code: 'COHORTE_2' },
        capacityPlaces: 1200,
        amiRef: `AMI-JSON-${stamp}`,
        exploitant: { name: 'Jeanne Complète', phone: `077${digits}` },
        status: { code: 'OPERATIONNELLE', family: 'OPERATIONNELLE' },
        gps: { latitude: 0.39, longitude: 9.45, source: 'IMPORT' },
        occupation: { chicksPlaced: 0, capacityPlaces: 1200, ratePct: 0 },
        hasOwnerAccount: false,
      });
    });

    it('refuse un fichier sans colonne province', async () => {
      const res = await request(server)
        .post('/programme/farms/import')
        .set(auth(adminToken))
        .attach('file', Buffer.from('numero,nom\n1,Ferme\n'), 'x.csv')
        .expect(400);
      expect(res.body.message).toBe(
        'Colonne(s) obligatoire(s) absente(s) : province.',
      );
    });
  });

  describe('fiche, doublons, statut, GPS', () => {
    let farmId: string;
    let farmCode: string;

    it('crée une ferme unitaire hors liste, code suivant de la province', async () => {
      const res = await post('/programme/farms', {
        name: `Ferme Nouvelle ${stamp}`,
        provinceCode: 'G4',
        amiRef: `AMI-${stamp}`,
        cohort: 'COHORTE_1',
        capacityPlaces: 2000,
        infrastructures: [
          { code: 'BATIMENT_ELEVAGE', count: 2, surfaceM2: 400 },
          { code: 'POINT_EAU', count: 1 },
        ],
      }).expect(201);
      farmId = res.body.id;
      farmCode = res.body.code;
      // Ngounié: 5 imported farms, so the next one is G4-0006.
      expect(farmCode).toBe('G4-0006');
      expect(res.body).toMatchObject({
        status: { code: 'EN_PREPARATION' },
        infrastructures: [
          { code: 'BATIMENT_ELEVAGE', count: 2, surfaceM2: 400 },
          { code: 'POINT_EAU', count: 1, surfaceM2: null },
        ],
        occupation: { chicksPlaced: 0, ratePct: 0 },
      });
    });

    it('refuse une référence AMI déjà attribuée (409, sans contournement)', async () => {
      const res = await post('/programme/farms', {
        name: `Autre Ferme ${stamp}`,
        provinceCode: 'G1',
        amiRef: ` ami-${stamp} `,
        confirmDuplicate: true,
      }).expect(409);
      expect(res.body.message).toContain(farmCode);
    });

    it('bloque un doublon probable (409 avec candidats) puis crée sur confirmation', async () => {
      const dup = await post('/programme/farms', {
        name: 'Ferme avicole Agri-Vert',
        provinceCode: 'G1',
      }).expect(409);
      expect(dup.body.duplicates).toHaveLength(1);
      expect(dup.body.duplicates[0]).toMatchObject({
        name: 'AGRI VERT',
        reasons: ['même nom dans la même province'],
      });
      expect(dup.body.message).toContain('confirmDuplicate');
      const ok = await post('/programme/farms', {
        name: 'Ferme avicole Agri-Vert',
        provinceCode: 'G1',
        confirmDuplicate: true,
      }).expect(201);
      expect(ok.body.duplicateOverride.candidateCodes).toEqual([
        dup.body.duplicates[0].code,
      ]);
    });

    it('modifie la fiche sans jamais toucher au code', async () => {
      const res = await patch(`/programme/farms/${farmId}`, {
        name: `Ferme Nouvelle Renommée ${stamp}`,
        capacityPlaces: 2500,
        code: 'G4-9999',
        programId: '00000000-0000-4000-8000-000000000000',
      }).expect(200);
      expect(res.body).toMatchObject({
        code: farmCode,
        programId,
        capacityPlaces: 2500,
      });
      await expect(
        ds.query(`UPDATE farms SET code = 'X-1' WHERE id = $1`, [farmId]),
      ).rejects.toThrow(/ne peut pas être modifié/);
    });

    it('change le statut avec historique ; la suspension désactive la ferme', async () => {
      await post(`/programme/farms/${farmId}/status`, {
        statusCode: 'SUSPENDUE',
      }).expect(400);
      await post(`/programme/farms/${farmId}/status`, {
        statusCode: 'OPERATIONNELLE',
      }).expect(201);
      const suspended = await post(`/programme/farms/${farmId}/status`, {
        statusCode: 'SUSPENDUE',
        reason: 'Contrôle sanitaire',
      }).expect(201);
      expect(suspended.body).toMatchObject({
        active: false,
        status: { code: 'SUSPENDUE', family: 'SUSPENDUE' },
      });
      const history = await get(
        `/programme/farms/${farmId}/status-history`,
      ).expect(200);
      expect(history.body.map((h: any) => h.statusCode)).toEqual([
        'SUSPENDUE',
        'OPERATIONNELLE',
        'EN_PREPARATION',
      ]);
      expect(history.body[0]).toMatchObject({
        statusLabel: 'Suspendue',
        reason: 'Contrôle sanitaire',
        cohort: 'COHORTE_1',
      });
      const list = await get(
        '/programme/farms?status=SUSPENDUE&province=g4',
      ).expect(200);
      expect(list.body.items.map((f: any) => f.id)).toContain(farmId);
      // The platform route can't bypass the status.
      await patch(`/admin/farms/${farmId}`, { active: true }).expect(400);
      const back = await post(`/programme/farms/${farmId}/status`, {
        statusCode: 'OPERATIONNELLE',
      }).expect(201);
      expect(back.body.active).toBe(true);
    });

    it('stocke un avertissement GPS hors province, puis la correction garde l’ancien point', async () => {
      await put(`/programme/provinces/${SQUARE_PROVINCE}/geometry`, {
        geometry: SQUARE,
      }).expect(200);
      const res = await post('/programme/farms', {
        name: `Ferme GPS ${stamp}`,
        provinceCode: SQUARE_PROVINCE,
        gps: { latitude: 0.5, longitude: 12.5, accuracyM: 8 },
      }).expect(201);
      expect(res.body.gps).toMatchObject({
        latitude: 0.5,
        longitude: 12.5,
        source: 'APPAREIL',
        accuracyM: 8,
      });
      expect(res.body.gps.provinceWarning).toContain(
        `hors de la province ${SQUARE_PROVINCE}`,
      );
      const fixed = await put(`/programme/farms/${res.body.id}/gps`, {
        latitude: -10.5,
        longitude: 1.5,
        reason: 'Relevé refait sur place',
      }).expect(200);
      expect(fixed.body).toMatchObject({
        previous: { latitude: 0.5, longitude: 12.5, source: 'APPAREIL' },
        provinceWarning: null,
        gps: { latitude: -10.5, longitude: 1.5, source: 'MANUEL' },
      });
      const history = await get(
        `/programme/farms/${res.body.id}/gps-history`,
      ).expect(200);
      expect(history.body).toHaveLength(2);
      expect(history.body[0]).toMatchObject({
        latitude: -10.5,
        reason: 'Relevé refait sur place',
        provinceWarning: null,
      });
      expect(history.body[1].provinceWarning).toContain('hors de la province');
    });

    it('filtre et pagine la liste', async () => {
      const page = await get(
        '/programme/farms?province=G1&page=2&pageSize=20',
      ).expect(200);
      expect(page.body.total).toBeGreaterThanOrEqual(92);
      expect(page.body.items).toHaveLength(20);
      expect(page.body.items.every((f: any) => f.province.code === 'G1')).toBe(
        true,
      );
      const q = await get(
        `/programme/farms?q=${encodeURIComponent('ntem, ona')}`,
      ).expect(200);
      expect(q.body.total).toBe(1);
      expect(q.body.items[0]).toMatchObject({
        name: 'FERME DU NTEM, ONA & FILS',
        hasOwnerAccount: false,
        status: { code: 'EN_PREPARATION', label: 'En préparation' },
      });
      const cohort = await get('/programme/farms?cohort=COHORTE_1').expect(200);
      expect(cohort.body.items.map((f: any) => f.id)).toContain(farmId);
    });
  });

  describe('compte de l’exploitant', () => {
    const phone = `+24167${digits}`;
    let farmA: string;
    let farmB: string;
    let loginCode: string;

    it('crée le compte Propriétaire, qui se connecte et lit sa fiche', async () => {
      const a = await post('/programme/farms', {
        name: `Ferme Exploitant A ${stamp}`,
        provinceCode: 'G5',
        exploitantName: 'Paul Exploitant',
        exploitantPhone: `+241 67 ${digits}`,
      }).expect(201);
      farmA = a.body.id;
      expect(a.body.exploitant.phone).toBe(phone);

      const res = await post(`/programme/farms/${farmA}/activate-owner`, {}).expect(201);
      expect(res.body).toMatchObject({
        linkedExistingAccount: false,
        owner: { fullName: 'Paul Exploitant', phone },
      });
      expect(res.body.loginCode).toMatch(/^\d{8}$/);
      loginCode = res.body.loginCode;
      await post(`/programme/farms/${farmA}/activate-owner`, {}).expect(409);

      const token = await login(phone, res.body.loginCode);
      const sheet = await get(`/programme/farms/${farmA}`, token).expect(200);
      expect(sheet.body).toMatchObject({
        hasOwnerAccount: true,
        owner: { fullName: 'Paul Exploitant' },
      });
      // Login must not have created a default farm next to the programme one.
      const mine = await get('/farms', token).expect(200);
      expect(mine.body.map((f: any) => f.id)).toEqual([farmA]);
      // Reading his sheet does not open the registry to him.
      await get('/programme/farms', token).expect(403);
    });

    it('une 2e ferme du même exploitant se rattache à son compte existant', async () => {
      const dup = await post('/programme/farms', {
        name: `Ferme Exploitant B ${stamp}`,
        provinceCode: 'G9',
        exploitantName: 'Paul Exploitant',
        exploitantPhone: phone,
      }).expect(409);
      expect(dup.body.duplicates[0].reasons).toEqual([
        'même téléphone de l’exploitant',
      ]);
      const b = await post('/programme/farms', {
        name: `Ferme Exploitant B ${stamp}`,
        provinceCode: 'G9',
        exploitantName: 'Paul Exploitant',
        exploitantPhone: phone,
        confirmDuplicate: true,
      }).expect(201);
      farmB = b.body.id;

      const refused = await post(`/programme/farms/${farmB}/activate-owner`, {}).expect(409);
      expect(refused.body).toMatchObject({ existingAccount: true });
      expect(refused.body.message).toContain('linkExistingUser');
      expect(JSON.stringify(refused.body)).not.toContain('Paul');

      const linked = await post(`/programme/farms/${farmB}/activate-owner`, {
        linkExistingUser: true,
      }).expect(201);
      expect(linked.body).toMatchObject({
        linkedExistingAccount: true,
        loginCode: null,
      });

      const [{ id: userId }] = await ds.query(
        `SELECT id FROM users WHERE phone = $1`,
        [phone],
      );
      const [{ n }] = await ds.query(
        `SELECT COUNT(*)::int AS n FROM users WHERE phone = $1`,
        [phone],
      );
      expect(n).toBe(1);
      expect(linked.body.owner.id).toBe(userId);
    });

    it('le propriétaire voit ses deux fermes, et pas celles des autres', async () => {
      const token = await login(phone, loginCode);
      const mine = await get('/farms', token).expect(200);
      expect(mine.body.map((f: any) => f.id).sort()).toEqual(
        [farmA, farmB].sort(),
      );
      await get(`/programme/farms/${farmB}`, token).expect(200);
      const someoneElse = (
        await get('/programme/farms?province=G1&pageSize=1')
      ).body.items[0].id;
      await get(`/programme/farms/${someoneElse}`, token).expect(403);
    });

    it('refuse le registre à un compte non administrateur', async () => {
      await get('/programme/farms', ownerToken).expect(403);
      await post('/programme/farms', { name: 'X', provinceCode: 'G1' }, ownerToken).expect(403);
      await request(server)
        .post('/programme/farms/import')
        .set(auth(ownerToken))
        .attach('file', POUFA_CSV, 'fermes-poufa.csv')
        .expect(403);
      await post(`/programme/farms/${farmA}/activate-owner`, {}, ownerToken).expect(403);
    });
  });

  describe('inscription d’une ferme Fermia existante', () => {
    it('inscrit la ferme d’un propriétaire existant, une seule fois', async () => {
      const phone = `+24168${digits}`;
      await register(phone, 'Marie Existante');
      const token = await login(phone);
      const [farm] = (await get('/farms', token).expect(200)).body;

      const res = await post(`/programme/farms/${farm.id}/enrol`, {
        provinceCode: 'G2',
        cohort: 'COHORTE_1',
        capacityPlaces: 1000,
      }).expect(201);
      // Haut-Ogooué: 17 imported farms.
      expect(res.body).toMatchObject({
        id: farm.id,
        code: 'G2-0018',
        province: { code: 'G2' },
        status: { code: 'EN_PREPARATION' },
        exploitant: { name: 'Marie Existante', phone },
        owner: { fullName: 'Marie Existante' },
        hasOwnerAccount: true,
        capacityPlaces: 1000,
      });
      await post(`/programme/farms/${farm.id}/enrol`, {
        provinceCode: 'G2',
      }).expect(409);
      // The owner keeps his farm and reads its programme sheet.
      const mine = await get('/farms', token).expect(200);
      expect(mine.body.map((f: any) => f.id)).toEqual([farm.id]);
      await get(`/programme/farms/${farm.id}`, token).expect(200);
    });
  });

  describe('fermes sans propriétaire dans les parcours existants', () => {
    it('les listes de fermes et la plateforme les acceptent', async () => {
      const mine = await get('/farms').expect(200);
      expect(mine.body.some((f: any) => f.ownerId === null)).toBe(true);
      const all = await get('/admin/farms').expect(200);
      const orphan = all.body.find((f: any) => f.code === 'G1-0001');
      expect(orphan).toBeDefined();
      expect(orphan.owner).toBeNull();
      const byFarm = await get('/admin/metrics/by-farm').expect(200);
      expect(byFarm.body.some((r: any) => r.owner === null)).toBe(true);
      await get('/admin/metrics').expect(200);
    });

    it('la base refuse une ferme hors programme sans propriétaire', async () => {
      await expect(
        ds.query(
          `INSERT INTO farms (name, "administrativeCity") VALUES ('Sans owner', 'Libreville')`,
        ),
      ).rejects.toThrow(/CHK_farms_owner_or_program/);
    });
  });
});
