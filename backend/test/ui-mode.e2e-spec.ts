// Jury lot 3: display mode of an account (SIMPLE | COMPLET). The exploitant and
// the ELEVEUR staff start SIMPLE; the exploitant switches himself, the staff is
// switched by the owner or by an agent technique with the farm in scope.
process.env.INSTITUTION_OTP = 'off';

import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  uniquePhone,
} from './helpers/programme-farm.js';

describe('Mode d’affichage Simple / Complet — jury lot 3 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let adminToken: string;
  let farmId: string;
  let otherFarmId: string;
  let ownerId: string;
  let ownerToken: string;
  let staffId: string;
  let staffToken: string;
  let teamAdminToken: string;
  let agentToken: string;

  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');

  const me = (token: string) =>
    request(server).get(`/farms/${farmId}/me`).set(auth(token));
  const setMember = (token: string, userId: string, uiMode: string, farm = farmId) =>
    request(server)
      .patch(`/farms/${farm}/members/${userId}/ui-mode`)
      .set(auth(token))
      .send({ uiMode });
  const setOwn = (token: string, uiMode: string) =>
    request(server).patch('/auth/me/ui-mode').set(auth(token)).send({ uiMode });

  async function addStaff(role: 'ELEVEUR' | 'ADMIN', permissions?: string[]) {
    const phone = uniquePhone();
    const res = await request(server)
      .post(`/farms/${farmId}/eleveurs`)
      .set(auth(ownerToken))
      .send({
        phone,
        fullName: `${role} ${tag}`,
        code: 'secret456',
        role,
        ...(permissions ? { permissions } : {}),
      })
      .expect(201);
    return {
      userId: res.body.user.id as string,
      uiMode: res.body.user.uiMode as string,
      token: await login(server, phone, 'secret456'),
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    adminToken = (await createPlatformAdmin(server, app.get(DataSource))).token;

    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Mode ${tag}`,
      exploitantName: 'Exploitant Mode',
    });
    farmId = farm.farmId;
    ownerId = farm.ownerId;
    ownerToken = farm.ownerToken;
    otherFarmId = (
      await createProgrammeFarm(server, adminToken, {
        name: `Ferme Mode Autre ${tag}`,
        exploitantName: 'Exploitant Mode 2',
      })
    ).farmId;

    const staff = await addStaff('ELEVEUR');
    staffId = staff.userId;
    staffToken = staff.token;
    expect(staff.uiMode).toBe('SIMPLE');
    const teamAdmin = await addStaff('ADMIN', ['equipe:gerer']);
    expect(teamAdmin.uiMode).toBe('COMPLET');
    teamAdminToken = teamAdmin.token;

    const agentPhone = uniquePhone();
    const membership = await request(server)
      .post('/programme/access/memberships')
      .set(auth(adminToken))
      .send({
        fullName: `Agent Mode ${tag}`,
        phone: agentPhone,
        profileCode: 'AGENT_TECHNIQUE',
        farmIds: [farmId],
      })
      .expect(201);
    agentToken = await login(server, agentPhone, membership.body.loginCode as string);
  }, 180_000);

  afterAll(async () => {
    await app.close();
  });

  it('a freshly activated exploitant is SIMPLE and may switch himself', async () => {
    const before = await me(ownerToken).expect(200);
    expect(before.body.uiMode).toBe('SIMPLE');
    expect(before.body.canChangeOwnUiMode).toBe(true);

    const res = await setOwn(ownerToken, 'COMPLET').expect(200);
    expect(res.body).toEqual({ uiMode: 'COMPLET' });
    expect((await me(ownerToken).expect(200)).body.uiMode).toBe('COMPLET');
    await setOwn(ownerToken, 'SIMPLE').expect(200);
    expect((await me(ownerToken).expect(200)).body.uiMode).toBe('SIMPLE');
  });

  it('refuses an unknown mode', async () => {
    const res = await setOwn(ownerToken, 'GRAND').expect(400);
    expect(JSON.stringify(res.body.message)).toContain('Mode d’affichage invalide');
  });

  it('an ELEVEUR employee is SIMPLE, cannot switch himself, the owner does', async () => {
    const mine = await me(staffToken).expect(200);
    expect(mine.body.uiMode).toBe('SIMPLE');
    expect(mine.body.canChangeOwnUiMode).toBe(false);

    const refused = await setOwn(staffToken, 'COMPLET').expect(403);
    expect(String(refused.body.message)).toContain('responsable de la ferme');
    await setMember(staffToken, staffId, 'COMPLET').expect(403);

    const res = await setMember(ownerToken, staffId, 'COMPLET').expect(200);
    expect(res.body).toEqual({ userId: staffId, uiMode: 'COMPLET' });
    expect((await me(staffToken).expect(200)).body.uiMode).toBe('COMPLET');

    // The owner's team list shows each member's mode.
    const team = await request(server)
      .get(`/farms/${farmId}/eleveurs`)
      .set(auth(ownerToken))
      .expect(200);
    const row = (team.body as Array<{ user: { id: string; uiMode: string } }>).find(
      (m) => m.user.id === staffId,
    );
    expect(row?.user.uiMode).toBe('COMPLET');
    await setMember(ownerToken, staffId, 'SIMPLE').expect(200);
  });

  it('a team administrator holding equipe:gerer sets a member, never the owner nor himself', async () => {
    await setMember(teamAdminToken, staffId, 'COMPLET').expect(200);
    await setMember(teamAdminToken, staffId, 'SIMPLE').expect(200);
    await setMember(teamAdminToken, ownerId, 'COMPLET').expect(403);
  });

  it('an unknown person or a stranger to the farm is a 404', async () => {
    await setMember(ownerToken, '00000000-0000-4000-8000-000000000000', 'SIMPLE').expect(404);
    // The owner of the other farm is not a member of this one.
    const otherOwner = await request(server)
      .get(`/programme/farms/${otherFarmId}`)
      .set(auth(adminToken))
      .expect(200);
    await setMember(ownerToken, otherOwner.body.owner.id as string, 'SIMPLE').expect(404);
  });

  it('an agent technique with the farm in scope sets the owner, not a farm out of scope', async () => {
    await setMember(agentToken, ownerId, 'COMPLET').expect(200);
    expect((await me(ownerToken).expect(200)).body.uiMode).toBe('COMPLET');

    // The programme sheet and the team list carry the modes.
    const sheet = await request(server)
      .get(`/programme/farms/${farmId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(sheet.body.owner.uiMode).toBe('COMPLET');
    const team = await request(server)
      .get(`/programme/farms/${farmId}/team`)
      .set(auth(adminToken))
      .expect(200);
    expect(
      (team.body as Array<{ userId: string; uiMode: string }>).find(
        (m) => m.userId === staffId,
      )?.uiMode,
    ).toBe('SIMPLE');

    await setMember(agentToken, staffId, 'COMPLET').expect(200);
    await setMember(agentToken, staffId, 'SIMPLE').expect(200);
    await setMember(agentToken, ownerId, 'SIMPLE').expect(200);

    await setMember(agentToken, ownerId, 'COMPLET', otherFarmId).expect(403);
    // The agent has no own setting (COMPTE is closed to institutions).
    await setOwn(agentToken, 'SIMPLE').expect(403);
    const profile = await me(agentToken).expect(200);
    expect(profile.body).toMatchObject({ uiMode: 'COMPLET', canChangeOwnUiMode: false });
  });
});
