import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { IdCounterService } from './../src/modules/programme/id-counter.service.js';
import { PARAMETER_CATALOG } from './../src/modules/programme/parameter-catalog.js';
import { ProgrammeSeedService } from './../src/modules/programme/programme-seed.service.js';
import {
  createPlatformAdmin,
  createProgrammeFarm,
} from './helpers/programme-farm.js';

describe('Programme POUFA — registre, listes, paramètres versionnés, GPS (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let ownerToken: string;

  const stamp = Date.now();
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
  const SQUARE_PROVINCE = 'G5';
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
    // A non-administrator reader: the owner of a registry farm.
    ownerToken = (await createProgrammeFarm(server, adminToken)).ownerToken;

    const [row] = await ds.query(
      `SELECT p.geometry FROM provinces p JOIN programs g ON g.id = p.program_id
       WHERE g.code = 'POUFA' AND p.code = $1`,
      [SQUARE_PROVINCE],
    );
    savedGeometry = row?.geometry ?? null;
  }, 120_000);

  afterAll(async () => {
    // Leave the shared DB as found: the square is test data only.
    await ds?.query(
      `UPDATE provinces SET geometry = $1 WHERE code = $2
         AND program_id = (SELECT id FROM programs WHERE code = 'POUFA')`,
      [
        savedGeometry === null ? null : JSON.stringify(savedGeometry),
        SQUARE_PROVINCE,
      ],
    );
    await app?.close();
  });

  describe('données initiales', () => {
    it('expose le programme configuré', async () => {
      const res = await get('/programme', ownerToken).expect(200);
      expect(res.body).toMatchObject({
        code: 'POUFA',
        name: 'Programme POUFA',
      });
    });

    it('sème les 9 provinces et leurs localités, sans contour', async () => {
      const res = await get('/programme/provinces', ownerToken).expect(200);
      expect(res.body.map((p: any) => p.code)).toEqual([
        'G1',
        'G2',
        'G3',
        'G4',
        'G5',
        'G6',
        'G7',
        'G8',
        'G9',
      ]);
      const g1 = res.body[0];
      expect(g1).toMatchObject({ name: 'Estuaire', chefLieu: 'Libreville' });
      expect(g1).not.toHaveProperty('geometry');
      expect(g1.localites.map((l: any) => l.code)).toEqual(
        expect.arrayContaining(['G1-01', 'G1-05']),
      );
      expect(g1.localites.find((l: any) => l.code === 'G1-05')).toMatchObject({
        name: 'Libreville',
        kind: 'COMMUNE',
      });
      const departments = res.body.flatMap((p: any) =>
        p.localites.filter((l: any) => l.kind === 'DEPARTEMENT'),
      );
      expect(departments.length).toBeGreaterThanOrEqual(48);
    });

    it('sème les listes avec leurs familles', async () => {
      const statuts = await get(
        '/programme/lists/STATUT_FERME',
        ownerToken,
      ).expect(200);
      expect(
        statuts.body.map((i: any) => [i.code, i.label, i.family]).slice(0, 3),
      ).toEqual([
        ['EN_PREPARATION', 'En préparation', 'PREPARATION'],
        ['OPERATIONNELLE', 'Opérationnelle', 'OPERATIONNELLE'],
        ['SUSPENDUE', 'Suspendue', 'SUSPENDUE'],
      ]);
      const postes = await get(
        '/programme/lists/POSTE_CHARGE',
        ownerToken,
      ).expect(200);
      expect(postes.body.map((i: any) => i.code)).toEqual(
        expect.arrayContaining([
          'POUSSINS',
          'ALIMENT',
          'VETERINAIRE',
          'MAIN_OEUVRE',
          'ENERGIE',
          'TRANSPORT',
          'AUTRES',
        ]),
      );
      const alertes = await get(
        '/programme/lists/STATUT_ALERTE',
        ownerToken,
      ).expect(200);
      expect(alertes.body.map((i: any) => i.label)).toEqual(
        expect.arrayContaining([
          'Nouvelle',
          'En analyse',
          'Confirmée',
          'Infirmée',
          'Close',
        ]),
      );
      await get('/programme/lists/INCONNUE', ownerToken).expect(400);
    });

    it('sème les paramètres proposés par le cahier des charges', async () => {
      const res = await get('/programme/parameters', ownerToken).expect(200);
      const byKey = new Map(res.body.map((p: any) => [p.key, p]));
      // Every catalog key is seeded (8 base + 12 formulas + later lots' keys).
      expect(res.body).toHaveLength(PARAMETER_CATALOG.length);
      expect(res.body.length).toBeGreaterThanOrEqual(8 + 12);
      expect(byKey.get('SEUIL_TRACABILITE_QR_PCT')).toMatchObject({
        value: 95,
        ownerProfile: 'DGE',
        unit: '%',
      });
      expect(byKey.get('SEUIL_ALERTE_MORTALITE_JOUR_PCT')).toMatchObject({
        ownerProfile: 'VETERINAIRE',
      });
      const history = await get(
        '/programme/parameters/BANDE_DUREE_REFERENCE_J/history',
      ).expect(200);
      const seed = history.body[history.body.length - 1];
      expect(seed).toMatchObject({ value: 45, createdById: null });
      expect(seed.reason).toContain(
        'Valeur proposée par le cahier des charges',
      );
      const vet = await get(
        '/programme/parameters/SEUIL_ALERTE_MORTALITE_JOUR_PCT/history',
      ).expect(200);
      expect(vet.body[vet.body.length - 1].reason).toContain(
        'à fixer par les services vétérinaires',
      );
      expect((byKey.get('FORMULE_TAUX_MORTALITE') as any).type).toBe('formula');
    });

    it('relancer le seed ne duplique rien et ne réécrit rien', async () => {
      const count = async () =>
        Number(
          (
            await ds.query(
              `SELECT (SELECT COUNT(*) FROM provinces) + (SELECT COUNT(*) FROM localites)
                + (SELECT COUNT(*) FROM ref_items) + (SELECT COUNT(*) FROM program_parameters) AS n`,
            )
          )[0].n,
        );
      const before = await count();
      await app.get(ProgrammeSeedService).seed('POUFA');
      expect(await count()).toBe(before);
    });
  });

  describe('paramètres versionnés', () => {
    it('une nouvelle valeur est une nouvelle ligne, datée, avec son motif', async () => {
      const res = await post('/programme/parameters/PESEE_ECHANTILLON_TETES', {
        value: 40,
        reason: `E2E ${stamp}`,
      }).expect(201);
      expect(res.body).toMatchObject({
        key: 'PESEE_ECHANTILLON_TETES',
        value: 40,
        ownerProfile: 'DGE',
        reason: `E2E ${stamp}`,
      });
      const now = await get('/programme/parameters', ownerToken).expect(200);
      expect(
        now.body.find((p: any) => p.key === 'PESEE_ECHANTILLON_TETES').value,
      ).toBe(40);
      const history = await get(
        '/programme/parameters/PESEE_ECHANTILLON_TETES/history',
      ).expect(200);
      expect(history.body[0]).toMatchObject({
        value: 40,
        reason: `E2E ${stamp}`,
      });
      expect(history.body.at(-1).value).toBe(30);
    });

    it('une valeur programmée ne s’applique qu’à sa date d’effet', async () => {
      const inTenDays = new Date(Date.now() + 10 * 86_400_000).toISOString();
      const before = await get('/programme/parameters', ownerToken).expect(200);
      const current = before.body.find(
        (p: any) => p.key === 'PESEE_FREQUENCE_J',
      );
      await post('/programme/parameters/PESEE_FREQUENCE_J', {
        value: 14,
        reason: 'Pesée bimensuelle',
        validFrom: inTenDays,
      }).expect(201);
      const still = await get('/programme/parameters', ownerToken).expect(200);
      expect(
        still.body.find((p: any) => p.key === 'PESEE_FREQUENCE_J').value,
      ).toBe(current.value);
      const at = new Date(Date.now() + 11 * 86_400_000).toISOString();
      const later = await get(
        `/programme/parameters?at=${encodeURIComponent(at)}`,
        ownerToken,
      ).expect(200);
      expect(
        later.body.find((p: any) => p.key === 'PESEE_FREQUENCE_J'),
      ).toMatchObject({
        value: 14,
        reason: 'Pesée bimensuelle',
      });
    });

    it('refuse une date d’effet passée, une clé inconnue, une valeur hors bornes', async () => {
      const res = await post('/programme/parameters/PESEE_FREQUENCE_J', {
        value: 7,
        reason: 'Rétroactif',
        validFrom: '2026-01-01T00:00:00Z',
      }).expect(400);
      expect(res.body.message).toBe(
        "La date d'effet ne peut pas être dans le passé.",
      );
      const unknown = await post('/programme/parameters/CLE_INCONNUE', {
        value: 1,
        reason: 'x',
      }).expect(400);
      expect(unknown.body.message).toBe('Paramètre inconnu : CLE_INCONNUE.');
      const range = await post(
        '/programme/parameters/SEUIL_TRACABILITE_QR_PCT',
        {
          value: 120,
          reason: 'x',
        },
      ).expect(400);
      expect(range.body.message).toContain('au plus 100');
      await post('/programme/parameters/PESEE_FREQUENCE_J', {
        value: 7,
      }).expect(400);
    });

    it('vérifie une formule avec tout le jeu d’indicateurs', async () => {
      const bad = await post('/programme/parameters/FORMULE_TAUX_MORTALITE', {
        value: 'morts_cumules / effectif_fantome * 100',
        reason: 'Essai',
      }).expect(400);
      expect(bad.body.message).toMatch(
        /^Indicateur « taux_mortalite » : .*effectif_fantome/,
      );
      const cycle = await post('/programme/parameters/FORMULE_TAUX_MORTALITE', {
        value: '100 - viabilite',
        reason: 'Essai',
      }).expect(400);
      expect(cycle.body.message).toContain('dépendance circulaire');
      const ok = await post('/programme/parameters/FORMULE_TAUX_MORTALITE', {
        value: 'arrondi(morts_cumules / mis_en_place * 100; 2)',
        reason: 'Arrondi à 2 décimales',
      }).expect(201);
      expect(ok.body.value).toBe(
        'arrondi(morts_cumules / mis_en_place * 100; 2)',
      );
    });

    it('les versions de paramètres sont immuables en base', async () => {
      await expect(
        ds.query(
          `UPDATE program_parameters SET reason = 'modifié' WHERE reason = $1`,
          [`E2E ${stamp}`],
        ),
      ).rejects.toThrow(/immuables/);
      await expect(
        ds.query(`DELETE FROM program_parameters WHERE reason = $1`, [
          `E2E ${stamp}`,
        ]),
      ).rejects.toThrow(/immuables/);
    });
  });

  describe('listes paramétrables', () => {
    const code = `E2E_${stamp}`;

    it('ajoute, renomme puis désactive un élément (jamais supprimé)', async () => {
      const created = await post('/programme/lists/MOTIF_SORTIE', {
        code,
        label: 'Vente au marché de Mont-Bouët',
        family: 'VENTE',
      }).expect(201);
      expect(created.body).toMatchObject({
        code,
        family: 'VENTE',
        active: true,
      });

      await post('/programme/lists/MOTIF_SORTIE', {
        code,
        label: 'Doublon',
        family: 'VENTE',
      }).expect(409);
      const noFamily = await post('/programme/lists/MOTIF_SORTIE', {
        code: `${code}_B`,
        label: 'Sans famille',
      }).expect(400);
      expect(noFamily.body.message).toContain('Famille obligatoire');
      await post('/programme/lists/COHORTE', {
        code: 'cohorte en minuscules',
        label: 'x',
      }).expect(400);

      await patch(`/programme/lists/MOTIF_SORTIE/${code}`, {
        label: 'Vente — marché de Mont-Bouët',
        sort: 1,
      }).expect(200);
      let list = await get('/programme/lists/MOTIF_SORTIE', ownerToken).expect(
        200,
      );
      expect(list.body[0]).toMatchObject({
        code,
        label: 'Vente — marché de Mont-Bouët',
      });

      await patch(`/programme/lists/MOTIF_SORTIE/${code}`, {
        active: false,
      }).expect(200);
      list = await get('/programme/lists/MOTIF_SORTIE', ownerToken).expect(200);
      expect(list.body.some((i: any) => i.code === code)).toBe(false);
      const all = await get('/programme/lists/MOTIF_SORTIE?all=true').expect(
        200,
      );
      expect(all.body.find((i: any) => i.code === code)).toMatchObject({
        active: false,
        family: 'VENTE',
      });
      await get('/programme/lists/MOTIF_SORTIE?all=true', ownerToken).expect(
        403,
      );
      await patch('/programme/lists/MOTIF_SORTIE/CODE_ABSENT', {
        sort: 2,
      }).expect(404);
    });

    it('ajoute et modifie une localité, code généré à la suite des codes semés', async () => {
      const created = await post('/programme/localites', {
        provinceCode: 'G1',
        name: `Owendo ${stamp}`,
        kind: 'COMMUNE',
        chefLieu: 'Owendo',
      }).expect(201);
      expect(created.body.code).toMatch(/^G1-\d{2,}$/);
      expect(Number(created.body.code.slice(3))).toBeGreaterThan(5);
      const renamed = await patch(`/programme/localites/${created.body.id}`, {
        name: `Owendo (commune) ${stamp}`,
        active: false,
      }).expect(200);
      expect(renamed.body).toMatchObject({
        code: created.body.code,
        active: false,
      });
      await post('/programme/localites', {
        provinceCode: 'G0',
        name: 'x',
      }).expect(404);
    });
  });

  describe('contours et cohérence GPS', () => {
    it('refuse un contour invalide', async () => {
      await put(`/programme/provinces/${SQUARE_PROVINCE}/geometry`, {
        geometry: { type: 'Point', coordinates: [1, 1] },
      }).expect(400);
      const open = await put(
        `/programme/provinces/${SQUARE_PROVINCE}/geometry`,
        {
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [1, -11],
                [2, -11],
                [2, -10],
                [1, -10.5],
              ],
            ],
          },
        },
      ).expect(400);
      expect(open.body.message).toContain('fermé');
    });

    it('charge un carré et vérifie un point dedans, dehors, ou sans contour', async () => {
      await put(`/programme/provinces/${SQUARE_PROVINCE}/geometry`, {
        geometry: SQUARE,
      }).expect(200);
      const provinces = await get('/programme/provinces', ownerToken).expect(
        200,
      );
      expect(
        provinces.body.find((p: any) => p.code === SQUARE_PROVINCE),
      ).toMatchObject({ hasGeometry: true });

      const inside = await post('/programme/geo/check', {
        latitude: -10.5,
        longitude: 1.5,
        provinceCode: SQUARE_PROVINCE,
      }).expect(201);
      expect(inside.body).toMatchObject({
        inside: true,
        foundProvinceCode: SQUARE_PROVINCE,
        warning: null,
      });

      const outside = await post('/programme/geo/check', {
        latitude: -9.5,
        longitude: 1.5,
        provinceCode: SQUARE_PROVINCE,
      }).expect(201);
      expect(outside.body.inside).toBe(false);
      expect(outside.body.warning).toContain('hors de la province');

      // G1 has no boundary in this DB: unknown, but the point is found in G5.
      const [g1] = await ds.query(
        `SELECT geometry IS NULL AS none FROM provinces WHERE code = 'G1'
         AND program_id = (SELECT id FROM programs WHERE code = 'POUFA')`,
      );
      if (g1.none) {
        const unknown = await post('/programme/geo/check', {
          latitude: -10.5,
          longitude: 1.5,
          provinceCode: 'G1',
        }).expect(201);
        expect(unknown.body).toMatchObject({
          inside: null,
          foundProvinceCode: SQUARE_PROVINCE,
          warning: null,
        });
      }
      await post('/programme/geo/check', {
        latitude: 95,
        longitude: 1.5,
        provinceCode: 'G1',
      }).expect(400);
    });
  });

  describe('droits', () => {
    it('refuse les écritures à un non-administrateur (403), autorise les lectures', async () => {
      await post(
        '/programme/lists/COHORTE',
        { code: `X_${stamp}`, label: 'x' },
        ownerToken,
      ).expect(403);
      await patch(
        '/programme/lists/COHORTE/COHORTE_1',
        { label: 'x' },
        ownerToken,
      ).expect(403);
      await post(
        '/programme/parameters/PESEE_FREQUENCE_J',
        { value: 3, reason: 'x' },
        ownerToken,
      ).expect(403);
      await get(
        '/programme/parameters/PESEE_FREQUENCE_J/history',
        ownerToken,
      ).expect(403);
      await post(
        '/programme/localites',
        { provinceCode: 'G1', name: 'x' },
        ownerToken,
      ).expect(403);
      await put(
        `/programme/provinces/${SQUARE_PROVINCE}/geometry`,
        { geometry: SQUARE },
        ownerToken,
      ).expect(403);
      await post(
        '/programme/geo/check',
        { latitude: 0, longitude: 0, provinceCode: 'G1' },
        ownerToken,
      ).expect(403);
      await request(server).get('/programme').expect(401);
    });
  });

  describe('compteurs', () => {
    it('20 tirages concurrents donnent 20 numéros distincts et consécutifs', async () => {
      const counters = app.get(IdCounterService);
      const scope = `E2E:${stamp}`;
      const numbers = await Promise.all(
        Array.from({ length: 20 }, () => counters.next(scope)),
      );
      expect(new Set(numbers).size).toBe(20);
      expect([...numbers].sort((a, b) => a - b)).toEqual(
        Array.from({ length: 20 }, (_, i) => i + 1),
      );
      expect(await counters.nextFarmCode(`T${stamp}`)).toMatch(/^T\d+-0001$/);
    });

    it('un tirage annulé avec sa transaction est rendu : il n’a jamais été enregistré', async () => {
      const counters = app.get(IdCounterService);
      const scope = `E2E-TX:${stamp}`;
      expect(await counters.next(scope)).toBe(1);
      await ds
        .transaction(async (em) => {
          expect(await counters.next(scope, em)).toBe(2);
          throw new Error('rollback');
        })
        .catch(() => undefined);
      expect(await counters.next(scope)).toBe(2);
    });
  });
});
