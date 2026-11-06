// The SMS step of institutional logins starts off (default) and is switched
// on below.
process.env.INSTITUTION_OTP = 'off';

import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { AccessScopeKind } from './../src/common/enums/access-scope-kind.enum.js';
import type {
  AccessAction,
  GrantableDomain,
} from './../src/modules/access/access-domains.js';
import { DEFAULT_PROFILES } from './../src/modules/access/data/default-profiles.js';
import {
  ConsoleSmsSender,
  SMS_SENDER,
} from './../src/modules/auth/sms/sms-sender.js';
import {
  addProgrammeFarm,
  createPlatformAdmin,
  createProgrammeFarm,
  registerBuyer,
} from './helpers/programme-farm.js';

type Need = readonly [GrantableDomain, AccessAction];

interface Probe {
  name: string;
  /** Needs a farm-level scope (ALL, PROVINCES, FARMS). */
  farm: boolean;
  /** Every grant the route needs; [] = never open to an institution. */
  needs: readonly Need[];
  call: (farmId: string) => request.Test;
}

describe('Programme POUFA — accès institutionnels (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let ownerToken: string;
  let ownerId: string;
  let farmA: string; // registry farm, province G1, no owner
  let farmB: string; // registry farm, province G2, no owner
  let farmC: string; // the owner's farm, province G3
  let batchC: string; // a band of farm C
  /** Band id probed on programme farms: the access decision comes first. */
  const NO_BATCH = '00000000-0000-4000-8000-0000000000b1';
  let programId: string;

  const stamp = Date.now();
  const digits = String(stamp).slice(-7);
  let seq = 10;
  const phone = () => `+2416${seq++}${digits}`;
  /** Letters unlike any earlier run's names (duplicate detection). */
  const tag = Array.from(randomBytes(8), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');

  /** A FARMS profile reading the registry only (within the admin profile's rights). */
  const readerProfile = `LECT${digits}`;

  /** Institutional accounts by profile code. */
  const accounts: Record<
    string,
    { phone: string; code: string; token: string; userId: string; id: string }
  > = {};

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (url: string, token: string) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token: string) =>
    request(server).post(url).set(auth(token)).send(body);
  const patch = (url: string, body: object, token: string) =>
    request(server).patch(url).set(auth(token)).send(body);

  function jwtPayload(token: string): Record<string, unknown> {
    return JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
    );
  }

  const login = (p: string, code: string) =>
    request(server).post('/auth/login').send({ phone: p, code });

  async function createInstitution(
    profileCode: string,
    scope: { provinceCodes?: string[]; farmIds?: string[] } = {},
  ) {
    const p = phone();
    const res = await post(
      '/programme/access/memberships',
      {
        fullName: `Agent ${profileCode} ${digits}`,
        phone: p,
        profileCode,
        ...scope,
      },
      adminToken,
    ).expect(201);
    expect(res.body.loginCode).toMatch(/^\d{8}$/);
    expect(res.body.user.role).toBe('INSTITUTION');
    const logged = await login(p, res.body.loginCode).expect(201);
    return {
      phone: p,
      code: res.body.loginCode as string,
      token: logged.body.accessToken as string,
      userId: res.body.user.id as string,
      id: res.body.id as string,
    };
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
    [{ id: programId }] = await ds.query(
      `SELECT id FROM programs WHERE code = 'POUFA'`,
    );

    adminToken = (await createPlatformAdmin(server, ds)).token;

    const owner = await createProgrammeFarm(server, adminToken, {
      provinceCode: 'G3',
      exploitantName: 'Accès E2E',
    });
    ownerToken = owner.ownerToken;
    ownerId = owner.ownerId;
    expect(String(jwtPayload(ownerToken).sub)).toBe(ownerId);
    farmC = owner.farmId;
    batchC = (
      await post(
        `/farms/${farmC}/batches`,
        {
          batchName: 'Lot accès',
          integrationDate: new Date().toISOString().slice(0, 10),
          quantityAtStart: 200,
          type: 'CHAIR',
          couvoirSupplier: 'Canabec',
          chickLotNumber: `CL-${stamp}`,
          hatchDate: new Date().toISOString().slice(0, 10),
        },
        ownerToken,
      ).expect(201)
    ).body.id;
    farmA = (
      await post(
        '/programme/farms',
        {
          name: `Ferme Accès Nord ${digits}`,
          provinceCode: 'G1',
          confirmDuplicate: true,
        },
        adminToken,
      ).expect(201)
    ).body.id;
    farmB = (
      await post(
        '/programme/farms',
        {
          name: `Ferme Accès Sud ${digits}`,
          provinceCode: 'G2',
          confirmDuplicate: true,
        },
        adminToken,
      ).expect(201)
    ).body.id;

    await post(
      '/programme/access/profiles',
      {
        code: readerProfile,
        label: `Lecteur registre ${digits}`,
        scopeKind: 'FARMS',
        matrix: { REGISTRE: ['CONSULTER'] },
      },
      adminToken,
    ).expect(201);

    for (const p of DEFAULT_PROFILES) {
      accounts[p.code] = await createInstitution(
        p.code,
        p.scopeKind === AccessScopeKind.FARMS ? { farmIds: [farmB] } : {},
      );
    }
  }, 120_000);

  afterAll(async () => {
    process.env.INSTITUTION_OTP = 'off';
    await app?.close();
  });

  describe('profiles and memberships', () => {
    it('seeds the seven system profiles', async () => {
      const res = await get('/programme/access/profiles', adminToken).expect(
        200,
      );
      const system = res.body.filter((p: { system: boolean }) => p.system);
      expect(system.map((p: { code: string }) => p.code).sort()).toEqual(
        DEFAULT_PROFILES.map((p) => p.code).sort(),
      );
    });

    it('protects system profiles and refuses Fermia-only domains', async () => {
      const profiles = (
        await get('/programme/access/profiles', adminToken).expect(200)
      ).body as Array<{ id: string; code: string }>;
      const dge = profiles.find((p) => p.code === 'DGE')!;
      await request(server)
        .delete(`/programme/access/profiles/${dge.id}`)
        .set(auth(adminToken))
        .expect(400);
      await patch(
        `/programme/access/profiles/${dge.id}`,
        { scopeKind: 'PROVINCES' },
        adminToken,
      ).expect(400);
      // POUFA lot A droits: the Fermia bonus domains open in consultation only.
      for (const matrix of [
        { MARCHE: ['CREER'] },
        { COMPTABILITE: ['CONSULTER', 'MODIFIER'] },
        { CULTURES: ['CONSULTER'] },
        { AUDIT: ['CONSULTER'] },
      ]) {
        await post(
          '/programme/access/profiles',
          { code: `X${digits}`, label: 'X', scopeKind: 'ALL', matrix },
          adminToken,
        ).expect(400);
      }
    });

    it('gives an 8 h session, without SMS step while INSTITUTION_OTP is off', () => {
      const payload = jwtPayload(accounts.DGE.token);
      expect(Number(payload.exp) - Number(payload.iat)).toBe(8 * 3600);
      expect(payload.mfa).toBeUndefined();
    });

    it('lets an institution see its own access', async () => {
      const res = await get(
        '/programme/access/me',
        accounts.AGENT_TECHNIQUE.token,
      ).expect(200);
      expect(res.body.profile.code).toBe('AGENT_TECHNIQUE');
      expect(res.body.farmIds).toEqual([farmB]);
      await get('/programme/access/me', adminToken).expect(403);
    });

    it('lets the programme admin profile administer, not the others', async () => {
      const admin = accounts.ADMIN.token;
      await get('/programme/access/profiles', admin).expect(200);
      await get('/programme/access/profiles', accounts.DGE.token).expect(403);
      await get('/programme/access/memberships', ownerToken).expect(403);
      // No self-escalation.
      await patch(
        `/programme/access/memberships/${accounts.ADMIN.id}`,
        { profileCode: 'DGE' },
        admin,
      ).expect(403);
      // The national administrator (ALL scope + ADMINISTRATION:ADMINISTRER)
      // assigns a profile whose rights it doesn't hold itself: the seeded
      // agent profile carries TECHNIQUE and INTRANTS, the admin profile not.
      await post(
        '/programme/access/memberships',
        {
          fullName: `Agent technique par admin ${digits}`,
          phone: phone(),
          profileCode: 'AGENT_TECHNIQUE',
          farmIds: [farmA],
        },
        admin,
      ).expect(201);
      const created = await post(
        '/programme/access/memberships',
        {
          fullName: `Agent créé par admin ${digits}`,
          phone: phone(),
          profileCode: readerProfile,
          farmIds: [farmA],
        },
        admin,
      ).expect(201);
      expect(created.body.loginCode).toMatch(/^\d{8}$/);
      // A FARMS scope only holds farms of the programme.
      await post(
        '/programme/access/memberships',
        {
          fullName: 'Agent hors programme',
          phone: phone(),
          profileCode: readerProfile,
          farmIds: ['00000000-0000-4000-8000-0000000000c1'],
        },
        admin,
      ).expect(400);
      // The audit profile (AUDIT domain) is granted by the platform only.
      const audit = await post(
        '/programme/access/memberships',
        { fullName: 'Auditeur', phone: phone(), profileCode: 'ANINF' },
        admin,
      ).expect(403);
      expect(audit.body.message).toBe(
        "Accès refusé : seul l'administrateur de la plateforme attribue un profil d'audit.",
      );
    });
  });

  describe('membership: account details', () => {
    it('edits the name, phone (normalized) and e-mail of an account', async () => {
      const agent = await createInstitution(readerProfile, {
        farmIds: [farmA],
      });
      const next = phone();
      const spaced = `${next.slice(0, 4)} ${next.slice(4, 6)}.${next.slice(6, 9)}-${next.slice(9)}`;
      const email = `agent.${digits}@E2E.ga`;
      const res = await patch(
        `/programme/access/memberships/${agent.id}`,
        { fullName: '  Agent Renommé  ', phone: spaced, email },
        adminToken,
      ).expect(200);
      expect(res.body.user).toMatchObject({
        fullName: 'Agent Renommé',
        phone: next,
        email: email.toLowerCase(),
      });
      // The phone is the login.
      await login(agent.phone, agent.code).expect(401);
      await login(next, agent.code).expect(201);

      // Another account's phone or e-mail: 409, a Market buyer's flagged.
      const buyer = await registerBuyer(server, { phone: phone() });
      const toBuyer = await patch(
        `/programme/access/memberships/${agent.id}`,
        { phone: buyer.phone },
        adminToken,
      ).expect(409);
      expect(toBuyer.body).toMatchObject({ buyerAccount: true });
      expect(toBuyer.body.message).toContain('acheteur du Market');
      const toOther = await patch(
        `/programme/access/memberships/${agent.id}`,
        { phone: accounts.DGE.phone },
        adminToken,
      ).expect(409);
      expect(toOther.body.message).toContain('autre compte');
      const other = await createInstitution(readerProfile, {
        farmIds: [farmA],
      });
      const sameEmail = await patch(
        `/programme/access/memberships/${other.id}`,
        { email },
        adminToken,
      ).expect(409);
      expect(sameEmail.body.message).toContain('adresse e-mail');
      await patch(
        `/programme/access/memberships/${agent.id}`,
        { phone: 'abc' },
        adminToken,
      ).expect(400);
      const cleared = await patch(
        `/programme/access/memberships/${agent.id}`,
        { email: null },
        adminToken,
      ).expect(200);
      expect(cleared.body.user.email).toBeNull();
      // Still no self-edit.
      await patch(
        `/programme/access/memberships/${accounts.ADMIN.id}`,
        { fullName: 'Moi' },
        accounts.ADMIN.token,
      ).expect(403);
    });
  });

  describe('reference data (REFERENCE)', () => {
    it('opens provinces and list items to every member, whatever its matrix', async () => {
      for (const p of DEFAULT_PROFILES) {
        const token = accounts[p.code].token;
        const provinces = await get('/programme/provinces', token).expect(200);
        expect(provinces.body.map((x: { code: string }) => x.code)).toContain(
          'G1',
        );
        expect(provinces.body[0].localites.length).toBeGreaterThan(0);
        await get('/programme/lists/STATUT_FERME', token).expect(200);
        // Inactive items stay administrator-only.
        await get('/programme/provinces?all=true', token).expect(403);
      }
      // Writes keep their domain: an institution without ADMINISTRATION.
      await post(
        '/programme/localites',
        { provinceCode: 'G1', name: 'X' },
        accounts.MAEDR.token,
      ).expect(403);
      // An account without membership is still refused.
      await patch(
        `/programme/access/memberships/${accounts.BCEG.id}`,
        { active: false },
        adminToken,
      ).expect(200);
      await get('/programme/provinces', accounts.BCEG.token).expect(403);
      await patch(
        `/programme/access/memberships/${accounts.BCEG.id}`,
        { active: true },
        adminToken,
      ).expect(200);
    });

    it('opens the provinces to Market buyers, not the lists', async () => {
      const buyer = await registerBuyer(server);
      await get('/programme/provinces', buyer.token).expect(200);
      await get('/programme/lists/STATUT_FERME', buyer.token).expect(403);
    });
  });

  describe('matrix: profile × domain × action', () => {
    const probes: Probe[] = [
      {
        name: 'REGISTRE consulter (fiche)',
        farm: true,
        needs: [['REGISTRE', 'CONSULTER']],
        call: (f) => get(`/programme/farms/${f}`, ''),
      },
      {
        name: 'REGISTRE consulter (liste)',
        farm: true,
        needs: [['REGISTRE', 'CONSULTER']],
        call: () => get('/programme/farms', ''),
      },
      {
        name: 'REGISTRE créer',
        farm: false,
        needs: [['REGISTRE', 'CREER']],
        call: () => post('/programme/farms', {}, ''),
      },
      {
        name: 'REGISTRE modifier',
        farm: true,
        needs: [['REGISTRE', 'MODIFIER']],
        call: (f) => patch(`/programme/farms/${f}`, { name: 12 }, ''),
      },
      {
        name: 'REGISTRE vérification GPS',
        farm: false,
        needs: [['REGISTRE', 'CONSULTER']],
        call: () => post('/programme/geo/check', {}, ''),
      },
      {
        name: 'TECHNIQUE consulter',
        farm: true,
        needs: [['TECHNIQUE', 'CONSULTER']],
        call: (f) => get(`/farms/${f}/batches`, ''),
      },
      {
        name: 'TECHNIQUE créer',
        farm: true,
        needs: [
          ['TECHNIQUE', 'CREER'],
          ['TECHNIQUE', 'MODIFIER'],
        ],
        call: (f) => post(`/farms/${f}/batches`, {}, ''),
      },
      {
        name: 'INTRANTS consulter',
        farm: true,
        needs: [['INTRANTS', 'CONSULTER']],
        call: (f) => get(`/farms/${f}/feed-stock`, ''),
      },
      {
        name: 'SANITAIRE consulter',
        farm: true,
        needs: [['SANITAIRE', 'CONSULTER']],
        call: (f) => get(`/farms/${f}/batches/${NO_BATCH}/prophylaxis`, ''),
      },
      {
        name: 'SANITAIRE créer',
        farm: true,
        needs: [['SANITAIRE', 'CREER']],
        call: (f) => post(`/farms/${f}/batches/${NO_BATCH}/treatments`, {}, ''),
      },
      {
        name: 'ECONOMIQUE consulter',
        farm: true,
        needs: [['ECONOMIQUE', 'CONSULTER']],
        call: (f) => get(`/farms/${f}/expenses`, ''),
      },
      {
        name: 'TRACABILITE consulter',
        farm: true,
        needs: [['TRACABILITE', 'CONSULTER']],
        call: (f) => get(`/farms/${f}/slaughter-orders`, ''),
      },
      {
        name: 'PARAMETRES consulter',
        farm: false,
        needs: [['PARAMETRES', 'CONSULTER']],
        call: () => get('/programme/parameters', ''),
      },
      {
        name: 'PARAMETRES modifier',
        farm: false,
        needs: [['PARAMETRES', 'MODIFIER']],
        call: () =>
          post('/programme/parameters/SEUIL_ALERTE_MORTALITE_JOUR_PCT', {}, ''),
      },
      {
        name: 'AUDIT consulter',
        farm: false,
        needs: [['AUDIT', 'CONSULTER']],
        call: () => get('/audit/events?limit=1', ''),
      },
      {
        name: 'ADMINISTRATION consulter',
        farm: false,
        needs: [['ADMINISTRATION', 'CONSULTER']],
        call: () => get('/programme/access/profiles', ''),
      },
      {
        name: 'ADMINISTRATION administrer',
        farm: false,
        needs: [['ADMINISTRATION', 'ADMINISTRER']],
        call: () => post('/programme/access/profiles', {}, ''),
      },
      // Fermia bonus domains (POUFA lot A droits): consultation through the
      // matrix (the DGE by default); the other Fermia domains stay closed.
      {
        name: 'VENTES (caisse)',
        farm: true,
        needs: [['VENTES', 'CONSULTER']],
        call: (f) => get(`/farms/${f}/caisse/current`, ''),
      },
      {
        name: 'MARCHE',
        farm: true,
        needs: [['MARCHE', 'CONSULTER']],
        call: (f) => get(`/farms/${f}/market/listings`, ''),
      },
      {
        name: 'COMPTABILITE',
        farm: true,
        needs: [['COMPTABILITE', 'CONSULTER']],
        call: (f) => get(`/farms/${f}/accounting/journal`, ''),
      },
      {
        name: 'EQUIPE',
        farm: true,
        needs: [['EQUIPE', 'CONSULTER']],
        call: (f) => get(`/farms/${f}/eleveurs`, ''),
      },
      {
        name: 'COMPTE (réglages de la ferme)',
        farm: true,
        needs: [],
        call: (f) => patch(`/farms/${f}`, { administrativeCity: 'x' }, ''),
      },
      {
        name: 'PLATEFORME',
        farm: false,
        needs: [],
        call: () => get('/admin/users', ''),
      },
      {
        name: 'COMPTE',
        farm: false,
        needs: [],
        call: () => get('/auth/buyer-profile', ''),
      },
    ];

    const reaches = (kind: AccessScopeKind) =>
      kind === AccessScopeKind.ALL ||
      kind === AccessScopeKind.PROVINCES ||
      kind === AccessScopeKind.FARMS;

    for (const profile of DEFAULT_PROFILES) {
      it(`${profile.code}: every probe answers as its matrix says`, async () => {
        const token = accounts[profile.code].token;
        const target =
          profile.scopeKind === AccessScopeKind.FARMS ? farmB : farmA;
        const mismatches: string[] = [];
        for (const probe of probes) {
          const granted =
            probe.needs.length > 0 &&
            probe.needs.every(([d, a]) =>
              (profile.matrix[d] ?? []).includes(a),
            ) &&
            (!probe.farm || reaches(profile.scopeKind));
          const res = await probe.call(target).set(auth(token));
          const ok = granted
            ? res.status !== 403 && res.status < 500
            : res.status === 403;
          if (!ok) {
            mismatches.push(
              `${probe.name}: ${res.status} (attendu ${granted ? 'autorisé' : '403'}) ${JSON.stringify(res.body).slice(0, 160)}`,
            );
          }
        }
        expect(mismatches).toEqual([]);
      });
    }

    it('leaves farm owners and the platform admin as before', async () => {
      await get(`/farms/${farmC}/batches`, ownerToken).expect(200);
      await get(`/farms/${farmC}/caisse/current`, ownerToken).expect(200);
      await get(`/programme/farms/${farmA}`, ownerToken).expect(403);
      await get('/programme/farms', ownerToken).expect(403);
      await get('/audit/events?limit=1', ownerToken).expect(403);
      await get('/programme/farms', adminToken).expect(200);
      await get(`/farms/${farmC}/batches`, adminToken).expect(200);
    });
  });

  describe('scope', () => {
    let provToken: string;

    beforeAll(async () => {
      const code = `PROV${digits}`;
      await post(
        '/programme/access/profiles',
        {
          code,
          label: `Agent provincial ${digits}`,
          scopeKind: 'PROVINCES',
          matrix: {
            REGISTRE: ['CONSULTER', 'CREER'],
            TECHNIQUE: ['CONSULTER'],
            SANITAIRE: ['CONSULTER'],
          },
        },
        adminToken,
      ).expect(201);
      provToken = (await createInstitution(code, { provinceCodes: ['G1'] }))
        .token;
    });

    it('PROVINCES: the farms of its provinces only', async () => {
      const list = await get('/programme/farms?pageSize=200', provToken).expect(
        200,
      );
      // This run's farms only (Nord in G1, Sud in G2): G1 holds every run's.
      const ours = await get(
        `/programme/farms?pageSize=200&q=${digits}`,
        provToken,
      ).expect(200);
      const ids = ours.body.items.map((f: { id: string }) => f.id);
      expect(ids).toContain(farmA);
      expect(ids).not.toContain(farmB);
      expect(
        list.body.items.every(
          (f: { province: { code: string } }) => f.province.code === 'G1',
        ),
      ).toBe(true);
      const mineRows = (await get('/farms', provToken).expect(200)).body;
      expect(
        mineRows.every(
          (f: { provinceCode: string; provinceName: string }) =>
            f.provinceCode === 'G1' && f.provinceName === 'Estuaire',
        ),
      ).toBe(true);
      const mine = mineRows.map((f: { id: string }) => f.id);
      expect(mine).toContain(farmA);
      expect(mine).not.toContain(farmB);
      expect(mine).not.toContain(farmC);
      await get(`/farms/${farmA}/batches`, provToken).expect(200);
      await get(`/farms/${farmB}/batches`, provToken).expect(403);
      await get(`/farms/${farmC}/batches`, provToken).expect(403);
      await get(`/programme/farms/${farmB}`, provToken).expect(403);
      // Creating a farm: only in its provinces.
      await post(
        '/programme/farms',
        {
          name: `Ferme hors zone ${digits}`,
          provinceCode: 'G2',
          confirmDuplicate: true,
        },
        provToken,
      ).expect(403);
      await post(
        '/programme/farms',
        {
          name: `Ferme zone ${digits}`,
          provinceCode: 'G1',
          confirmDuplicate: true,
        },
        provToken,
      ).expect(201);
    });

    it('masks duplicates out of scope, and only a national admin confirms them', async () => {
      const exploitantPhone = phone();
      const exploitant = {
        exploitantName: `Jeanne Doublon ${digits}`,
        exploitantPhone,
      };
      const south = await post(
        '/programme/farms',
        { name: `Bilongo ${tag}`, provinceCode: 'G2', ...exploitant },
        adminToken,
      ).expect(201);
      const entry = {
        name: `Ferme Bilongo ${tag}`,
        provinceCode: 'G1',
        ...exploitant,
      };
      const dup = await post('/programme/farms', entry, provToken).expect(409);
      expect(dup.body.duplicates).toEqual([
        {
          hidden: true,
          score: 1,
          reasons: [
            'nom ressemblant',
            'même téléphone de l’exploitant',
            'même nom d’exploitant',
          ],
        },
      ]);
      // Nothing more than before about a hidden candidate: no province.
      expect(dup.body.duplicates[0]).not.toHaveProperty('provinceCode');
      expect(dup.body.message).toContain('hors de votre périmètre');
      expect(dup.body.message).not.toContain('confirmDuplicate');
      const body = JSON.stringify(dup.body);
      expect(body).not.toContain(south.body.code);
      expect(body).not.toContain(south.body.id);
      expect(body).not.toContain(`Bilongo ${tag}"`);
      // A provincial agent cannot confirm against a farm it cannot see.
      await post(
        '/programme/farms',
        { ...entry, confirmDuplicate: true },
        provToken,
      ).expect(409);
      // The national admin sees the candidate and decides.
      const seen = await post('/programme/farms', entry, adminToken).expect(
        409,
      );
      expect(seen.body.duplicates[0]).toMatchObject({
        farmId: south.body.id,
        code: south.body.code,
        provinceCode: 'G2',
        provinceName: expect.any(String),
      });
      const created = await post(
        '/programme/farms',
        { ...entry, confirmDuplicate: true },
        adminToken,
      ).expect(201);
      expect(created.body.duplicateOverride.candidateCodes).toEqual([
        south.body.code,
      ]);
      // The provincial agent reads the new sheet without the other code.
      const sheet = await get(
        `/programme/farms/${created.body.id}`,
        provToken,
      ).expect(200);
      expect(sheet.body.duplicateOverride.candidateCodes).toEqual([]);
    });

    it('FARMS: the listed farms only', async () => {
      const token = accounts.AGENT_TECHNIQUE.token;
      const list = await get('/programme/farms?pageSize=200', token).expect(
        200,
      );
      expect(list.body.items.map((f: { id: string }) => f.id)).toEqual([farmB]);
      await get(`/farms/${farmA}/batches`, token).expect(403);
      await get(`/programme/farms/${farmA}`, token).expect(403);
      await get(`/programme/farms/${farmB}`, token).expect(200);
    });

    it('ALL: every farm of the programme', async () => {
      const token = accounts.DGE.token;
      const [{ count }] = await ds.query(
        `SELECT COUNT(*)::int AS count FROM farms WHERE program_id = $1`,
        [programId],
      );
      const list = await get('/programme/farms?pageSize=1', token).expect(200);
      expect(list.body.total).toBe(count);
      const mine = (await get('/farms', token).expect(200)).body.map(
        (f: { id: string }) => f.id,
      );
      expect(mine).toEqual(expect.arrayContaining([farmA, farmB, farmC]));
      await get(`/farms/${farmC}/batches`, token).expect(200);
      // An unknown farm id answers like one out of scope.
      await get(
        '/farms/00000000-0000-4000-8000-000000000000/batches',
        token,
      ).expect(403);
    });

    it('AGGREGATE and AUDIT: no farm-level rows', async () => {
      for (const code of ['MAEDR', 'ANINF', 'BCEG']) {
        const token = accounts[code].token;
        await get(`/programme/farms/${farmA}`, token).expect(403);
        await get(`/farms/${farmA}/batches`, token).expect(403);
      }
      await get('/programme/farms', accounts.MAEDR.token).expect(403);
      await get('/programme/farms', accounts.BCEG.token).expect(403);
      // FINANCED reaches no farm until the consent model exists.
      expect(
        (await get('/farms', accounts.BCEG.token).expect(200)).body,
      ).toEqual([]);
      // The caller's farm list is SESSION: open, but an AGGREGATE scope holds
      // nor an AUDIT one any farm row.
      for (const code of ['MAEDR', 'ANINF']) {
        expect(
          (await get('/farms', accounts[code].token).expect(200)).body,
        ).toEqual([]);
        await get(`/farms/${farmA}/me`, accounts[code].token).expect(403);
      }
    });

    it('sanitary declarations: the farm and the veterinary services only', async () => {
      await get(
        `/farms/${farmC}/batches/${batchC}/health-events`,
        ownerToken,
      ).expect(200);
      // The rule runs before anything else: the vets reach the service
      // (404: no such band), the others are refused.
      const url = `/farms/${farmA}/batches/${NO_BATCH}/health-events`;
      await get(url, accounts.VETERINAIRE.token).expect(404);
      // A profile holding SANITAIRE:CONSULTER still cannot read them.
      await get(
        `/farms/${farmA}/batches/${NO_BATCH}/prophylaxis`,
        provToken,
      ).expect(404);
      const refused = await get(url, provToken).expect(403);
      expect(refused.body.message).toContain('services vétérinaires');
      await get(url, accounts.DGE.token).expect(403);
    });

    it('a suspended or expired membership loses access at once', async () => {
      const agent = await createInstitution('DGE');
      await get('/programme/parameters', agent.token).expect(200);
      await patch(
        `/programme/access/memberships/${agent.id}`,
        { active: false },
        adminToken,
      ).expect(200);
      await get('/programme/parameters', agent.token).expect(403);
      await login(agent.phone, agent.code).expect(401);
      await patch(
        `/programme/access/memberships/${agent.id}`,
        { active: true },
        adminToken,
      ).expect(200);
      await get('/programme/parameters', agent.token).expect(200);
      await ds.query(
        `UPDATE program_memberships SET valid_until = now() - interval '1 minute' WHERE id = $1`,
        [agent.id],
      );
      await get('/programme/parameters', agent.token).expect(403);
    });

    it('a provincial administrator grants only within its own scope and rights', async () => {
      const adminCode = `PADM${digits}`;
      const provReader = `PLECT${digits}`;
      await post(
        '/programme/access/profiles',
        {
          code: adminCode,
          label: `Admin provincial ${digits}`,
          scopeKind: 'PROVINCES',
          matrix: {
            REGISTRE: ['CONSULTER'],
            ADMINISTRATION: ['CONSULTER', 'CREER', 'MODIFIER', 'ADMINISTRER'],
          },
        },
        adminToken,
      ).expect(201);
      await post(
        '/programme/access/profiles',
        {
          code: provReader,
          label: `Lecteur provincial ${digits}`,
          scopeKind: 'PROVINCES',
          matrix: { REGISTRE: ['CONSULTER'] },
        },
        adminToken,
      ).expect(201);
      const padm = (
        await createInstitution(adminCode, { provinceCodes: ['G1'] })
      ).token;
      const grant = (body: object) =>
        post(
          '/programme/access/memberships',
          { fullName: `Agent ${digits}`, phone: phone(), ...body },
          padm,
        );

      // Farms: only those of its provinces (farm A in G1, farm B in G2).
      const reader = await grant({
        profileCode: readerProfile,
        farmIds: [farmA],
      }).expect(201);
      const outFarm = await grant({
        profileCode: readerProfile,
        farmIds: [farmA, farmB],
      }).expect(403);
      expect(outFarm.body.message).toBe(
        'Accès refusé : une ferme demandée est hors de votre périmètre.',
      );
      // Provinces: a subset of its own.
      await grant({ profileCode: provReader, provinceCodes: ['G1'] }).expect(
        201,
      );
      const outProvince = await grant({
        profileCode: provReader,
        provinceCodes: ['G1', 'G2'],
      }).expect(403);
      expect(outProvince.body.message).toBe(
        'Accès refusé : province hors de votre périmètre (G2).',
      );
      // Scope kinds: nothing broader than PROVINCES, no special kind.
      const national = await grant({ profileCode: 'DGE' }).expect(403);
      expect(national.body.message).toContain('plus large que le vôtre');
      const aggregate = await grant({ profileCode: 'MAEDR' }).expect(403);
      expect(aggregate.body.message).toContain('périmètre national');

      // Editing: never an account broader than itself, nor out of scope.
      const broader = await patch(
        `/programme/access/memberships/${accounts.DGE.id}`,
        { active: false },
        padm,
      ).expect(403);
      expect(broader.body.message).toContain('plus larges que les vôtres');
      await patch(
        `/programme/access/memberships/${reader.body.id}`,
        { farmIds: [farmB] },
        padm,
      ).expect(403);
      await patch(
        `/programme/access/memberships/${reader.body.id}`,
        { profileCode: 'AGENT_TECHNIQUE' },
        padm,
      ).expect(403);
      await patch(
        `/programme/access/memberships/${reader.body.id}`,
        { active: false },
        padm,
      ).expect(200);

      // Profiles: none broader than itself, nor with rights it lacks.
      const profile = (body: object) =>
        post(
          '/programme/access/profiles',
          { code: `P${digits}${seq++}`, label: 'Profil', ...body },
          padm,
        );
      await profile({
        scopeKind: 'ALL',
        matrix: { REGISTRE: ['CONSULTER'] },
      }).expect(403);
      const rights = await profile({
        scopeKind: 'FARMS',
        matrix: { REGISTRE: ['CONSULTER'], TECHNIQUE: ['CONSULTER'] },
      }).expect(403);
      expect(rights.body.message).toContain('Suivi technique : Consulter');
      await profile({
        scopeKind: 'FARMS',
        matrix: { REGISTRE: ['CONSULTER'] },
      }).expect(201);
      const profiles = (
        await get('/programme/access/profiles', adminToken).expect(200)
      ).body as Array<{ id: string; code: string }>;
      const dge = profiles.find((p) => p.code === 'DGE')!;
      await patch(
        `/programme/access/profiles/${dge.id}`,
        { label: 'POUFA / DGE' },
        padm,
      ).expect(403);
    });

    it('changes a scope through the administration', async () => {
      const agent = await createInstitution('AGENT_TECHNIQUE', {
        farmIds: [farmB],
      });
      await get(`/farms/${farmA}/batches`, agent.token).expect(403);
      const res = await patch(
        `/programme/access/memberships/${agent.id}`,
        { farmIds: [farmA] },
        adminToken,
      ).expect(200);
      expect(res.body.farmIds).toEqual([farmA]);
      await get(`/farms/${farmA}/batches`, agent.token).expect(200);
      await get(`/farms/${farmB}/batches`, agent.token).expect(403);
    });

    it('refuses the reserved operator accounts', async () => {
      const { phone: p } = await registerBuyer(server, { phone: phone() });
      await ds.query(`UPDATE users SET role = 'OPERATEUR' WHERE phone = $1`, [
        p,
      ]);
      const res = await login(p, 'secret123').expect(401);
      expect(res.body.message).toContain('opérateurs');
    });
  });

  describe('parameters: owner profile', () => {
    async function current(key: string) {
      const all = (await get('/programme/parameters', adminToken).expect(200))
        .body as Array<{ key: string; value: unknown }>;
      return all.find((p) => p.key === key)!.value;
    }

    it('a veterinary threshold is changed by the vets or the admin only', async () => {
      const VET_KEY = 'SEUIL_ALERTE_MORTALITE_JOUR_PCT';
      const DGE_KEY = 'PESEE_FREQUENCE_J';
      const vetValue = await current(VET_KEY);
      const dgeValue = await current(DGE_KEY);
      const set = (key: string, value: unknown, token: string) =>
        post(
          `/programme/parameters/${key}`,
          { value, reason: `e2e accès ${digits}` },
          token,
        );
      const refused = await set(VET_KEY, vetValue, accounts.DGE.token).expect(
        403,
      );
      expect(refused.body.message).toContain('VETERINAIRE');
      await set(DGE_KEY, dgeValue, accounts.VETERINAIRE.token).expect(403);
      await set(VET_KEY, vetValue, accounts.VETERINAIRE.token).expect(201);
      await set(DGE_KEY, dgeValue, accounts.DGE.token).expect(201);
      await set(VET_KEY, vetValue, adminToken).expect(201);
      // A profile without PARAMETRES:MODIFIER never reaches the service.
      await set(DGE_KEY, dgeValue, accounts.MAEDR.token).expect(403);
    });
  });

  describe('audit journal', () => {
    it('opens to the ANINF profile and the platform admin only', async () => {
      const aninf = accounts.ANINF.token;
      await get('/audit/events?limit=5', aninf).expect(200);
      await get('/audit/row-changes?limit=5', aninf).expect(200);
      await get('/audit/seals', aninf).expect(200);
      const from = new Date(Date.now() - 60_000).toISOString();
      await get(`/audit/events/export?from=${from}`, aninf).expect(200);
      await request(server)
        .post('/audit/seals/verify')
        .set(auth(aninf))
        .send({})
        .expect(200);
      await get('/audit/events?limit=1', adminToken).expect(200);
      for (const code of ['DGE', 'VETERINAIRE', 'ADMIN', 'MAEDR']) {
        await get('/audit/events?limit=1', accounts[code].token).expect(403);
      }
    });

    it('journals the access changes at row level', async () => {
      const rows = await ds.query(
        `SELECT op FROM audit_row_changes WHERE table_name = 'program_memberships' AND row_id = $1`,
        [accounts.DGE.id],
      );
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe('platform admin: login codes', () => {
    it('regenerates a login code, shown once and never journaled', async () => {
      const res = await post(
        `/admin/users/${ownerId}/login-code`,
        {},
        adminToken,
      ).expect(201);
      const code: string = res.body.loginCode;
      expect(code).toMatch(/^\d{8}$/);
      const ownerPhone = res.body.user.phone;
      await login(ownerPhone, 'secret123').expect(401);
      await login(ownerPhone, code).expect(201);
      const journal = await ds.query(
        `SELECT summary::text AS s FROM audit_events WHERE route = '/admin/users/:userId/login-code' AND params->>'userId' = $1`,
        [ownerId],
      );
      expect(journal.length).toBeGreaterThan(0);
      for (const row of journal) expect(row.s ?? '').not.toContain(code);
      const changes = await ds.query(
        `SELECT after::text AS a FROM audit_row_changes WHERE table_name = 'users' AND row_id = $1 ORDER BY id DESC LIMIT 1`,
        [ownerId],
      );
      expect(changes[0].a).toContain('_redacted_changed');
      // An institutional agent too.
      const agent = await post(
        `/admin/users/${accounts.BCEG.userId}/login-code`,
        {},
        adminToken,
      ).expect(201);
      await login(accounts.BCEG.phone, agent.body.loginCode).expect(201);
      accounts.BCEG.code = agent.body.loginCode;
    });

    it('is for the platform admin, never on a platform admin account', async () => {
      const adminId = String(jwtPayload(adminToken).sub);
      await post(`/admin/users/${adminId}/login-code`, {}, adminToken).expect(
        400,
      );
      await post(`/admin/users/${ownerId}/login-code`, {}, ownerToken).expect(
        403,
      );
      await post(
        `/admin/users/${ownerId}/login-code`,
        {},
        accounts.ADMIN.token,
      ).expect(403);
    });
  });

  describe('programme login codes (no platform admin needed)', () => {
    it("regenerates a farm owner's code: matrix, scope, never one's own", async () => {
      const url = `/programme/farms/${farmC}/owner-login-code`;
      const first = await post(url, {}, adminToken).expect(201);
      expect(first.body).toMatchObject({
        farm: { id: farmC },
        owner: { id: ownerId },
      });
      expect(first.body.loginCode).toMatch(/^\d{8}$/);
      const ownerPhone: string = first.body.owner.phone;
      // The programme admin profile (ADMINISTRATION:ADMINISTRER, ALL).
      const second = await post(url, {}, accounts.ADMIN.token).expect(201);
      await login(ownerPhone, first.body.loginCode).expect(401);
      await login(ownerPhone, second.body.loginCode).expect(201);
      const journal = await ds.query(
        `SELECT summary::text AS s FROM audit_events WHERE route = '/programme/farms/:farmId/owner-login-code' AND params->>'farmId' = $1`,
        [farmC],
      );
      expect(journal.length).toBeGreaterThanOrEqual(2);
      for (const row of journal) {
        expect(row.s ?? '').not.toContain(second.body.loginCode);
      }
      // Without ADMINISTRATION, or as the owner himself: refused.
      await post(url, {}, accounts.DGE.token).expect(403);
      await post(url, {}, ownerToken).expect(403);
      // A farm without an owner account.
      const none = await post(
        `/programme/farms/${farmA}/owner-login-code`,
        {},
        adminToken,
      ).expect(409);
      expect(none.body).toMatchObject({ noOwnerAccount: true });

      // A provincial admin: its farms only, and not for an owner who also
      // holds a farm out of its scope.
      const code = `LCADM${digits}`;
      await post(
        '/programme/access/profiles',
        {
          code,
          label: `Admin codes ${digits}`,
          scopeKind: 'PROVINCES',
          matrix: { ADMINISTRATION: ['CONSULTER', 'ADMINISTRER'] },
        },
        adminToken,
      ).expect(201);
      const padm = (await createInstitution(code, { provinceCodes: ['G1'] }))
        .token;
      await post(url, {}, padm).expect(403); // farm C is in G3
      const solo = await createProgrammeFarm(server, adminToken, {
        provinceCode: 'G1',
        name: `Ferme codes ${tag}`,
      });
      const res = await post(
        `/programme/farms/${solo.farmId}/owner-login-code`,
        {},
        padm,
      ).expect(201);
      await login(solo.ownerPhone, res.body.loginCode).expect(201);
      await addProgrammeFarm(server, adminToken, solo.ownerPhone, {
        provinceCode: 'G2',
        name: `Ferme codes sud ${tag}`,
      });
      const split = await post(
        `/programme/farms/${solo.farmId}/owner-login-code`,
        {},
        padm,
      ).expect(403);
      expect(split.body.message).toContain('hors de votre périmètre');
    });

    it("regenerates an institutional account's code within the admin's own access", async () => {
      const agent = await createInstitution(readerProfile, {
        farmIds: [farmA],
      });
      const url = `/programme/access/memberships/${agent.id}/login-code`;
      const first = await post(url, {}, adminToken).expect(201);
      expect(first.body).toMatchObject({
        id: agent.id,
        user: { id: agent.userId },
      });
      expect(first.body.loginCode).toMatch(/^\d{8}$/);
      await login(agent.phone, agent.code).expect(401);
      await login(agent.phone, first.body.loginCode).expect(201);
      const second = await post(url, {}, accounts.ADMIN.token).expect(201);
      await login(agent.phone, second.body.loginCode).expect(201);
      // Never one's own, never an account it could not grant (the audit
      // account is the platform admin's alone; the national administrator may
      // reset the others, e.g. a technical agent), never without the rights.
      const tech = await createInstitution('AGENT_TECHNIQUE', {
        farmIds: [farmA],
      });
      await post(
        `/programme/access/memberships/${tech.id}/login-code`,
        {},
        accounts.ADMIN.token,
      ).expect(201);
      await post(
        `/programme/access/memberships/${accounts.ADMIN.id}/login-code`,
        {},
        accounts.ADMIN.token,
      ).expect(403);
      const broader = await post(
        `/programme/access/memberships/${accounts.ANINF.id}/login-code`,
        {},
        accounts.ADMIN.token,
      ).expect(403);
      expect(broader.body.message).toContain('plus larges que les vôtres');
      await post(url, {}, accounts.DGE.token).expect(403);
      await post(url, {}, ownerToken).expect(403);
      await post(
        '/programme/access/memberships/00000000-0000-4000-8000-0000000000d1/login-code',
        {},
        adminToken,
      ).expect(404);
    });
  });

  describe('strengthened login (INSTITUTION_OTP=sms)', () => {
    let sms: ConsoleSmsSender;

    beforeAll(() => {
      process.env.INSTITUTION_OTP = 'sms';
      sms = app.get(SMS_SENDER);
    });

    afterAll(() => {
      process.env.INSTITUTION_OTP = 'off';
    });

    function codeSentTo(p: string): string {
      const msg = sms.lastTo(p)?.message ?? '';
      const m = /(\d{6})/.exec(msg);
      if (!m) throw new Error(`Aucun code envoyé à ${p}`);
      return m[1];
    }

    it('refuses a token issued without the SMS step', async () => {
      await get('/programme/parameters', accounts.VETERINAIRE.token).expect(
        401,
      );
    });

    it('signs in with the code, then the SMS code (8 h session)', async () => {
      const dge = accounts.DGE;
      const step1 = await login(dge.phone, dge.code).expect(201);
      expect(step1.body.otpRequired).toBe(true);
      expect(step1.body.accessToken).toBeUndefined();
      expect(step1.body.sentTo).not.toBe(dge.phone);
      const code = codeSentTo(dge.phone);
      const wrong = code === '000000' ? '111111' : '000000';
      const bad = await request(server)
        .post('/auth/login/otp')
        .send({ challengeId: step1.body.challengeId, code: wrong })
        .expect(401);
      expect(bad.body.message).toContain('4 essais restants');
      const ok = await request(server)
        .post('/auth/login/otp')
        .send({ challengeId: step1.body.challengeId, code })
        .expect(201);
      const payload = jwtPayload(ok.body.accessToken);
      expect(payload.mfa).toBe(true);
      expect(Number(payload.exp) - Number(payload.iat)).toBe(8 * 3600);
      expect(ok.body.expiresIn).toBe(8 * 3600);
      await get('/programme/parameters', ok.body.accessToken).expect(200);
      // Used once.
      await request(server)
        .post('/auth/login/otp')
        .send({ challengeId: step1.body.challengeId, code })
        .expect(401);

      // Journal: both steps, never a code; the hash never in the row journal.
      const events = await ds.query(
        `SELECT action, summary::text AS s FROM audit_events WHERE route = '/auth/login/otp' AND summary->>'challengeId' = $1 ORDER BY id`,
        [step1.body.challengeId],
      );
      expect(events.map((e: { action: string }) => e.action)).toEqual([
        'LOGIN_FAILED',
        'LOGIN',
        'LOGIN_FAILED',
      ]);
      for (const e of events) expect(e.s).not.toContain(code);
      const rows = await ds.query(
        `SELECT after::text AS a FROM audit_row_changes WHERE table_name = 'login_challenges' AND row_id = $1`,
        [step1.body.challengeId],
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(r.a).not.toContain('code_hash');
      const [stored] = await ds.query(
        `SELECT code_hash FROM login_challenges WHERE id = $1`,
        [step1.body.challengeId],
      );
      expect(stored.code_hash).not.toContain(code);
    });

    it('burns a challenge after 5 wrong codes', async () => {
      const vet = accounts.VETERINAIRE;
      const step1 = await login(vet.phone, vet.code).expect(201);
      const code = codeSentTo(vet.phone);
      const wrong = code === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) {
        await request(server)
          .post('/auth/login/otp')
          .send({ challengeId: step1.body.challengeId, code: wrong })
          .expect(401);
      }
      await request(server)
        .post('/auth/login/otp')
        .send({ challengeId: step1.body.challengeId, code })
        .expect(401);
    });

    it('limits the codes per account (5 per 15 min)', async () => {
      const maedr = accounts.MAEDR;
      for (let i = 0; i < 5; i++) {
        await login(maedr.phone, maedr.code).expect(201);
      }
      const res = await login(maedr.phone, maedr.code).expect(429);
      expect(res.body.message).toContain('Trop de codes');
    });

    it('never sends a code on a wrong password', async () => {
      const bceg = accounts.BCEG;
      const before = sms.lastTo(bceg.phone);
      await login(bceg.phone, '99999999').expect(401);
      expect(sms.lastTo(bceg.phone)).toBe(before);
    });

    it('answers 400 on the SMS step while it is off', async () => {
      process.env.INSTITUTION_OTP = 'off';
      await request(server)
        .post('/auth/login/otp')
        .send({
          challengeId: '00000000-0000-4000-8000-000000000000',
          code: '123456',
        })
        .expect(400);
      process.env.INSTITUTION_OTP = 'sms';
    });
  });
});
