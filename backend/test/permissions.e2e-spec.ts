import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

/**
 * M10 — Permissions & gestion d'équipe (create/update member, catalogue,
 * profile « me », règles de rôle fixe ADMIN/ELEVEUR, suspension, gates @Permissions).
 */
describe('Équipe & permissions — rôles ADMIN/ELEVEUR (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ownerToken: string;
  let adminToken: string;
  let eleveurToken: string;
  let farmId: string;
  let adminEmploymentId: string;
  let eleveurEmploymentId: string;
  let eleveurUserId: string;

  const stamp = Date.now();
  const phone = (n: number) => `+24170${stamp}${n}`;
  const login = async (p: string, code: string) => {
    const res = await request(server)
      .post('/auth/login')
      .send({ phone: p, code })
      .expect(201);
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();

    const ownerPhone = phone(1);
    await request(server)
      .post('/auth/register')
      .send({ phone: ownerPhone, fullName: 'Proprio Perms', code: 'secret123' })
      .expect(201);
    ownerToken = await login(ownerPhone, 'secret123');

    const farm = await request(server)
      .post('/farms')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Ferme Perms ${Date.now()}`,
        administrativeCity: 'Libreville',
        capacityPerBuilding: 1000,
      })
      .expect(201);
    farmId = farm.body.id;

    const admin = await request(server)
      .post(`/farms/${farmId}/eleveurs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        phone: phone(2),
        fullName: 'Admin KouKou',
        code: 'secret456',
        role: 'ADMIN',
        jobTitle: 'Comptable',
        buildingAssignment: 'B1',
      })
      .expect(201);
    adminEmploymentId = admin.body.employment.id;
    adminToken = await login(phone(2), 'secret456');

    const eleveur = await request(server)
      .post(`/farms/${farmId}/eleveurs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        phone: phone(3),
        fullName: 'Éleveur Terrain',
        code: 'secret789',
        role: 'ELEVEUR',
        jobTitle: 'Éleveur',
      })
      .expect(201);
    eleveurEmploymentId = eleveur.body.employment.id;
    eleveurUserId = eleveur.body.user.id;
    eleveurToken = await login(phone(3), 'secret789');
  });

  it('profil /me : Propriétaire → droits totaux, ADMIN → défauts admin, ÉLEVEUR → bloc fixe', async () => {
    const ownerMe = await request(server)
      .get(`/farms/${farmId}/me`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(ownerMe.body.role).toBe('PROPRIETAIRE');
    expect(ownerMe.body.permissions).toContain('*');

    const adminMe = await request(server)
      .get(`/farms/${farmId}/me`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(adminMe.body.role).toBe('ADMIN');
    expect(adminMe.body.jobTitle).toBe('Comptable');
    expect(adminMe.body.buildingAssignment).toBe('B1');
    expect(adminMe.body.permissions.sort()).toEqual(['caisse:lire', 'saisie:creer', 'sanitaire:lecture']);

    const eleveurMe = await request(server)
      .get(`/farms/${farmId}/me`)
      .set('Authorization', `Bearer ${eleveurToken}`)
      .expect(200);
    expect(eleveurMe.body.role).toBe('ELEVEUR');
    expect(eleveurMe.body.jobTitle).toBe('Éleveur');
    expect(eleveurMe.body.permissions.sort()).toEqual([
      'caisse:lire',
      'saisie:creer',
      'sanitaire:lecture',
      'vente:creer',
    ]);
  });

  it('gestion d’équipe : Éleveur 403 ; Admin (sans equipe:gerer) 403 ; Propriétaire 200', async () => {
    await request(server)
      .get(`/farms/${farmId}/eleveurs`)
      .set('Authorization', `Bearer ${eleveurToken}`)
      .expect(403);
    await request(server)
      .get(`/farms/${farmId}/permissions`)
      .set('Authorization', `Bearer ${eleveurToken}`)
      .expect(403);

    await request(server)
      .get(`/farms/${farmId}/eleveurs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    await request(server)
      .post(`/farms/${farmId}/eleveurs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone: phone(4), fullName: 'Sans droit', code: 'secret456' })
      .expect(403);

    const list = await request(server)
      .get(`/farms/${farmId}/eleveurs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect((list.body as any[]).length).toBe(2);
  });

  it('catalogue : 200 pour le Propriétaire, contient equipe:gerer et saisie:creer', async () => {
    const catalog = await request(server)
      .get(`/farms/${farmId}/permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const codes = (catalog.body as any[]).flatMap((g: any) =>
      g.items.map((i: any) => i.code),
    );
    expect(codes).toContain('equipe:gerer');
    expect(codes).toContain('equipe:taches');
    expect(codes).toContain('caisse:ouvrir');
    expect(codes).toContain('saisie:creer');
    expect(codes).toContain('vente:creer');
  });

  it('octroi de droits par le Propriétaire → l’Admin devient gestionnaire d’équipe', async () => {
    await request(server)
      .patch(`/farms/${farmId}/eleveurs/${adminEmploymentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permissions: ['equipe:gerer', 'equipe:taches', 'caisse:ouvrir'] })
      .expect(200);

    await request(server)
      .get(`/farms/${farmId}/eleveurs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(server)
      .get(`/farms/${farmId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const edit = await request(server)
      .patch(`/farms/${farmId}/eleveurs/${eleveurEmploymentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ jobTitle: 'Éleveur responsable ponte' })
      .expect(200);
    expect(edit.body.jobTitle).toBe('Éleveur responsable ponte');
  });

  it('permissions invalides → 400, avec message listant les codes inconnus', async () => {
    const res = await request(server)
      .patch(`/farms/${farmId}/eleveurs/${adminEmploymentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permissions: ['equipe:gerer', 'truc:bidule'] })
      .expect(400);
    expect(res.body.message).toContain('truc:bidule');
  });

  it('les permissions d’un Éleveur restent fixes : PATCH permissions rejeté (400)', async () => {
    const res = await request(server)
      .patch(`/farms/${farmId}/eleveurs/${eleveurEmploymentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permissions: ['equipe:gerer'] })
      .expect(400);
    expect(res.body.message).toBe(
      'Les permissions ne se règlent que pour un Administrateur KouKou (rôle Éleveur = droits fixes).',
    );
  });

  it('POST eleveurs : permissions explicites à la création → l’Admin les reçoit (pas les défauts)', async () => {
    const created = await request(server)
      .post(`/farms/${farmId}/eleveurs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        phone: phone(5),
        fullName: 'Admin Sur Mesure',
        code: 'secret555',
        role: 'ADMIN',
        permissions: ['equipe:gerer', 'caisse:ouvrir', 'vente:annuler', 'sanitaire:lecture'],
      })
      .expect(201);
    expect(created.body.employment.permissions.sort()).toEqual([
      'caisse:ouvrir',
      'equipe:gerer',
      'sanitaire:lecture',
      'vente:annuler',
    ]);

    const token = await login(phone(5), 'secret555');
    const me = await request(server)
      .get(`/farms/${farmId}/me`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.role).toBe('ADMIN');
    expect(me.body.permissions.sort()).toEqual([
      'caisse:ouvrir',
      'equipe:gerer',
      'sanitaire:lecture',
      'vente:annuler',
    ]);
  });

  it('POST eleveurs : permissions refusées pour un rôle Éleveur (droits fixes)', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/eleveurs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        phone: phone(6),
        fullName: 'Éleveur Fixe',
        code: 'secret666',
        role: 'ELEVEUR',
        permissions: ['equipe:gerer'],
      })
      .expect(400);
    expect(res.body.message).toBe(
      'Les permissions ne se règlent que pour un Administrateur KouKou (rôle Éleveur = droits fixes).',
    );
  });

  it('POST eleveurs : permissions inconnues → 400 listant les codes', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/eleveurs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        phone: phone(7),
        fullName: 'Admin Bogué',
        code: 'secret777',
        role: 'ADMIN',
        permissions: ['equipe:gerer', 'truc:bidule'],
      })
      .expect(400);
    expect(res.body.message).toContain('truc:bidule');
  });

  it('basculer Éleveur → Admin réinitialise les droits sur le bloc admin', async () => {
    await request(server)
      .patch(`/farms/${farmId}/eleveurs/${eleveurEmploymentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'ADMIN' })
      .expect(200);

    const me = await request(server)
      .get(`/farms/${farmId}/me`)
      .set('Authorization', `Bearer ${eleveurToken}`)
      .expect(200);
    expect(me.body.role).toBe('ADMIN');
    expect(me.body.permissions.sort()).toEqual(['caisse:lire', 'saisie:creer', 'sanitaire:lecture']);
  });

  it('basculer Admin → Éleveur, puis tenter de re-gruder des droits fixes', async () => {
    await request(server)
      .patch(`/farms/${farmId}/eleveurs/${adminEmploymentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'ELEVEUR' })
      .expect(200);

    const me = await request(server)
      .get(`/farms/${farmId}/me`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(me.body.role).toBe('ELEVEUR');
    expect(me.body.permissions.sort()).toEqual([
      'caisse:lire',
      'saisie:creer',
      'sanitaire:lecture',
      'vente:creer',
    ]);

    const res = await request(server)
      .patch(`/farms/${farmId}/eleveurs/${adminEmploymentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permissions: ['equipe:gerer'] })
      .expect(400);
    expect(res.body.message).toContain('droits fixes');
  });

  it('membre inactif : accès complètement refusé, réactivation restore', async () => {
    await request(server)
      .patch(`/farms/${farmId}/eleveurs/${adminEmploymentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ active: false })
      .expect(200);

    await request(server)
      .get(`/farms/${farmId}/me`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    await request(server)
      .get(`/farms/${farmId}/tasks`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);

    await request(server)
      .patch(`/farms/${farmId}/eleveurs/${adminEmploymentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ active: true, role: 'ADMIN', permissions: ['equipe:taches', 'vente:creer'] })
      .expect(200);

    await request(server)
      .get(`/farms/${farmId}/me`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('gates @Permissions par module : caisse open requiert caisse:ouvrir, tâches requiert equipe:taches', async () => {
    const openCaisse = {
      openingBalanceFcfa: 0,
    };

    await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(openCaisse)
      .expect(403);

    await request(server)
      .post(`/farms/${farmId}/tasks`)
      .set('Authorization', `Bearer ${eleveurToken}`)
      .send({ title: 'Tâche interdite', dueDate: '2099-01-01' })
      .expect(403);

    const okTask = await request(server)
      .post(`/farms/${farmId}/tasks`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Tâche autorisée', dueDate: '2099-01-02', assigneeId: eleveurUserId })
      .expect(201);
    expect(okTask.body.status).toBe('A_FAIRE');
  });

  it('caisse : l’Admin avec caisse:ouvrir ET caisse:fermer ouvre puis clôture', async () => {
    await request(server)
      .patch(`/farms/${farmId}/eleveurs/${adminEmploymentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permissions: ['equipe:taches', 'caisse:ouvrir', 'caisse:fermer'] })
      .expect(200);

    const open = await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ openingBalanceFcfa: 5000 })
      .expect(201);
    expect(open.body.openingBalanceFcfa).toBe(5000);

    const close = await request(server)
      .post(`/farms/${farmId}/caisse/close`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ declaredBalanceFcfa: 5000 })
      .expect(201);
    expect(close.body.closingBalanceFcfa).toBe(5000);
    expect(close.body.closingDifferenceFcfa).toBe(0);
  });

  it('/team : équipe assignable pour un gestionnaire de tâches, 403 sans equipe:taches', async () => {
    // À ce stade, adminToken possède equipe:taches (et pas forcément equipe:gerer).
    const team = await request(server)
      .get(`/farms/${farmId}/team`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(team.body)).toBe(true);
    const member = (team.body as any[]).find((m: any) => m.userId === eleveurUserId);
    expect(member).toBeTruthy();
    expect(member.fullName).toBe('Éleveur Terrain');
    expect(member.active).toBe(true);

    // eleveurToken est devenu ADMIN sans equipe:taches → 403.
    await request(server)
      .get(`/farms/${farmId}/team`)
      .set('Authorization', `Bearer ${eleveurToken}`)
      .expect(403);
  });

  it('autre ferme → 403 pour membres et liste', async () => {
    const otherPhone = phone(9);
    await request(server)
      .post('/auth/register')
      .send({ phone: otherPhone, fullName: 'Autre Proprio', code: 'secret123' })
      .expect(201);
    const otherToken = await login(otherPhone, 'secret123');

    await request(server)
      .get(`/farms/${farmId}/eleveurs`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
    await request(server)
      .get(`/farms/${farmId}/me`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });
});