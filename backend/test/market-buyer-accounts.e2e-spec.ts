import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  createPlatformAdmin,
  createProgrammeFarm,
  uniquePhone,
} from './helpers/programme-farm.js';

describe('Comptes acheteurs du Market (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let adminToken: string;

  const phone = () => uniquePhone('+24176');
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const registerBuyer = (over: Record<string, unknown> = {}) =>
    request(server)
      .post('/auth/register-buyer')
      .send({
        phone: phone(),
        fullName: 'Acheteur Test',
        code: 'secret123',
        ...over,
      });

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
    adminToken = (await createPlatformAdmin(server, app.get(DataSource))).token;
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('inscrit un hôtel sans créer de ferme, puis le connecte', async () => {
    const number = phone();
    const res = await registerBuyer({
      phone: number,
      type: 'HOTEL',
      organizationName: 'Hôtel du Port',
      city: 'Port-Gentil',
    }).expect(201);
    expect(res.body.user.role).toBe('ACHETEUR');

    const login = await request(server)
      .post('/auth/login')
      .send({ phone: number, code: 'secret123' })
      .expect(201);
    expect(login.body.user.role).toBe('ACHETEUR');

    const farms = await request(server)
      .get('/farms')
      .set(bearer(login.body.accessToken))
      .expect(200);
    expect(farms.body).toEqual([]);

    const profile = await request(server)
      .get('/auth/buyer-profile')
      .set(bearer(login.body.accessToken))
      .expect(200);
    expect(profile.body).toMatchObject({
      type: 'HOTEL',
      organizationName: 'Hôtel du Port',
      city: 'Port-Gentil',
    });
  });

  it('ne se laisse pas donner un autre rôle à l’inscription', async () => {
    const res = await registerBuyer({ role: 'PLATFORM_ADMIN' }).expect(201);
    expect(res.body.user.role).toBe('ACHETEUR');
  });

  it('refuse un numéro déjà pris, même en concurrence', async () => {
    const number = phone();
    await registerBuyer({ phone: number }).expect(201);
    await registerBuyer({ phone: number }).expect(409);
    // An exploitant's account holds its phone too.
    const owner = await createProgrammeFarm(server, adminToken);
    await registerBuyer({ phone: owner.ownerPhone }).expect(409);

    const racing = phone();
    const answers = await Promise.all([
      registerBuyer({ phone: racing }),
      registerBuyer({ phone: racing }),
    ]);
    expect(answers.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('refuse un type inconnu et un code trop court', async () => {
    await registerBuyer({ type: 'ESPION' }).expect(400);
    await registerBuyer({ code: '123' }).expect(400);
  });

  describe('accès aux fermes', () => {
    let buyerToken: string;
    let ownerToken: string;
    let farmId: string;

    beforeAll(async () => {
      const buyer = await registerBuyer().expect(201);
      buyerToken = buyer.body.accessToken;
      const owner = await createProgrammeFarm(server, adminToken, {
        exploitantName: 'Proprio',
      });
      ownerToken = owner.ownerToken;
      farmId = owner.farmId;
    }, 60_000);

    it.each([
      ['get', () => `/farms/${farmId}/batches`],
      ['get', () => `/farms/${farmId}/orders`],
      ['get', () => `/farms/${farmId}/sales`],
      ['get', () => `/farms/${farmId}/customers`],
      ['get', () => `/farms/${farmId}/caisse/current`],
      ['get', () => `/farms/${farmId}/dashboard`],
      ['post', () => `/farms/${farmId}/orders`],
      ['get', () => '/admin/metrics'],
    ] as const)('%s %s : 403 pour un acheteur', async (method, path) => {
      await request(server)
        [method](path())
        .set(bearer(buyerToken))
        .send({})
        .expect(403);
    });

    it('ne voit pas la ferme d’autrui par la liste', async () => {
      const res = await request(server)
        .get('/farms')
        .set(bearer(buyerToken))
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('ne peut pas être rattaché à une ferme comme employé', async () => {
      const number = phone();
      await registerBuyer({ phone: number }).expect(201);
      const res = await request(server)
        .post(`/farms/${farmId}/eleveurs`)
        .set(bearer(ownerToken))
        .send({ phone: number, fullName: 'Employé', code: 'secret123' });
      expect(res.status).toBe(409);
    });
  });

  describe('profil', () => {
    it('un propriétaire peut aussi avoir un profil d’acheteur', async () => {
      const { ownerToken: token } = await createProgrammeFarm(
        server,
        adminToken,
        { exploitantName: 'Proprio Acheteur' },
      );
      const none = await request(server)
        .get('/auth/buyer-profile')
        .set(bearer(token))
        .expect(200);
      expect(none.body).toEqual({});

      await request(server)
        .put('/auth/buyer-profile')
        .set(bearer(token))
        .send({ type: 'RESTAURANT', organizationName: 'Chez Maman' })
        .expect(200);
      const updated = await request(server)
        .put('/auth/buyer-profile')
        .set(bearer(token))
        .send({ type: 'TRAITEUR' })
        .expect(200);
      expect(updated.body.type).toBe('TRAITEUR');
      expect(updated.body.organizationName).toBeNull();
    });

    it('exige une connexion', async () => {
      await request(server).get('/auth/buyer-profile').expect(401);
    });
  });

  describe('un acheteur ne devient pas éleveur par lui-même', () => {
    it('become-farmer n’existe plus (404) : le compte reste acheteur, sans ferme', async () => {
      const buyer = await registerBuyer().expect(201);
      const token = buyer.body.accessToken;
      await request(server)
        .post('/auth/become-farmer')
        .set(bearer(token))
        .send({ farmName: 'Ferme Nouvelle', farmCity: 'Oyem' })
        .expect(404);
      const login = await request(server)
        .post('/auth/login')
        .send({ phone: buyer.body.user.phone, code: 'secret123' })
        .expect(201);
      expect(login.body.user.role).toBe('ACHETEUR');
      const farms = await request(server)
        .get('/farms')
        .set(bearer(login.body.accessToken))
        .expect(200);
      expect(farms.body).toEqual([]);
    });

    it('le registre ne rattache pas une ferme au compte acheteur du même numéro', async () => {
      const number = phone();
      await registerBuyer({ phone: number }).expect(201);
      const created = await request(server)
        .post('/programme/farms')
        .set(bearer(adminToken))
        .send({
          name: `Ferme Acheteur ${number}`,
          provinceCode: 'G1',
          capacityPlaces: 2000,
          exploitantName: 'Acheteur Exploitant',
          exploitantPhone: number,
          confirmDuplicate: true,
        })
        .expect(201);
      const activate = (linkExistingUser: boolean) =>
        request(server)
          .post(`/programme/farms/${created.body.id}/activate-owner`)
          .set(bearer(adminToken))
          .send({ linkExistingUser });
      expect((await activate(false)).body.existingAccount).toBe(true);
      const refused = await activate(true).expect(409);
      expect(String(refused.body.message)).toMatch(
        /pas un compte Propriétaire/,
      );
    });
  });
});
