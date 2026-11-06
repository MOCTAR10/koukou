import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { DEFAULT_PROFILES } from './../src/modules/access/data/default-profiles.js';
import { NotifyService } from './../src/modules/notify/notify.service.js';
import { SanitaryAlertsService } from './../src/modules/surveillance/sanitary-alerts.service.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  uniquePhone,
} from './helpers/programme-farm.js';

function day(offset = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

interface Account {
  token: string;
  userId: string;
}

/**
 * POUFA lot A2 vet: the veterinary authority comes from the matrix (SANITAIRE
 * rights), never from the profile code `VETERINAIRE`; the vets' settings are
 * read-only for the platform admin; a declaration without alert is reviewed
 * by the vets (CDC n° 26).
 */
describe('POUFA lot A2 vet — autorité vétérinaire par la matrice (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let alerts: SanitaryAlertsService;
  let notify: NotifyService;
  let adminToken: string;
  let ownerToken: string;
  let farmId: string;
  let batchId: string;
  let vet: Account;
  let dge: Account;
  /** Custom profile created by the admin with the VETERINAIRE rights. */
  let custom: Account;
  let vetProfileId: string;
  let vetMatrix: Record<string, string[]>;
  const memberships: string[] = [];

  const stamp = Date.now();
  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');

  const get = (url: string, token: string) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token: string) =>
    request(server).post(url).set(auth(token)).send(body);
  const patch = (url: string, body: object, token: string) =>
    request(server).patch(url).set(auth(token)).send(body);

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await alerts.flush();
      await notify.flush();
    }
  }

  async function institution(
    profileCode: string,
    scope: Record<string, unknown> = {},
  ): Promise<Account> {
    const phone = uniquePhone('+2417');
    const res = await post(
      '/programme/access/memberships',
      { fullName: `${profileCode} ${tag}`, phone, profileCode, ...scope },
      adminToken,
    ).expect(201);
    memberships.push(res.body.id as string);
    const logged = await request(server)
      .post('/auth/login')
      .send({ phone, code: res.body.loginCode })
      .expect(201);
    return {
      token: logged.body.accessToken as string,
      userId: res.body.user.id as string,
    };
  }

  const declare = (body: object) =>
    post(
      `/farms/${farmId}/batches/${batchId}/health-events`,
      { kind: 'SYMPTOME', occurredAt: day(0), severity: 'JAUNE', ...body },
      ownerToken,
    );

  async function parameter(key: string): Promise<unknown> {
    const all = (await get('/programme/parameters', adminToken).expect(200))
      .body as Array<{ key: string; value: unknown }>;
    return all.find((p) => p.key === key)!.value;
  }

  const setParameter = (key: string, value: unknown, token: string) =>
    post(
      `/programme/parameters/${key}`,
      { value, reason: `E2E lot A2 vet ${stamp}` },
      token,
    );

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    alerts = app.get(SanitaryAlertsService);
    notify = app.get(NotifyService);

    adminToken = (await createPlatformAdmin(server, ds)).token;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Vet A2 ${tag}`,
      provinceCode: 'G3',
    });
    ownerToken = farm.ownerToken;
    farmId = farm.farmId;
    const band = await post(
      `/farms/${farmId}/batches`,
      {
        batchName: `Bande vet A2 ${stamp}`,
        type: 'CHAIR',
        integrationDate: day(-5),
        quantityAtStart: 1000,
      },
      ownerToken,
    ).expect(201);
    batchId = band.body.id;

    vet = await institution('VETERINAIRE');
    dge = await institution('DGE');
    const vetDefault = DEFAULT_PROFILES.find((p) => p.code === 'VETERINAIRE')!;
    const customCode = `VETO${String(stamp).slice(-6)}`;
    await post(
      '/programme/access/profiles',
      {
        code: customCode,
        label: `Vétérinaires provinciaux ${tag}`,
        scopeKind: 'ALL',
        matrix: vetDefault.matrix,
      },
      adminToken,
    ).expect(201);
    custom = await institution(customCode);
    const profiles = (await get('/programme/access/profiles', adminToken).expect(200))
      .body as Array<{ id: string; code: string; matrix: Record<string, string[]> }>;
    const vetProfile = profiles.find((p) => p.code === 'VETERINAIRE')!;
    vetProfileId = vetProfile.id;
    vetMatrix = vetProfile.matrix;
    expect(vetMatrix.SANITAIRE).toEqual(
      expect.arrayContaining(['CONSULTER', 'MODIFIER', 'VALIDER']),
    );
  });

  afterAll(async () => {
    if (vetProfileId) {
      await patch(
        `/programme/access/profiles/${vetProfileId}`,
        { matrix: vetMatrix },
        adminToken,
      );
    }
    for (const id of memberships) {
      await patch(`/programme/access/memberships/${id}`, { active: false }, adminToken);
    }
    await settle();
    await app.close();
  });

  describe('un profil créé par l’admin avec les droits SANITAIRE agit comme les vétérinaires', () => {
    it('qualifie et publie une alerte', async () => {
      const declared = await declare({
        title: `Suspicion custom ${tag}`,
        suspicion: true,
      }).expect(201);
      await settle();
      const unpublished = await get(
        `/surveillance/alerts?published=false&farmId=${farmId}`,
        custom.token,
      ).expect(200);
      const alert = unpublished.body.items.find(
        (a: { healthEventId: string }) => a.healthEventId === declared.body.id,
      );
      expect(alert).toBeDefined();
      // The DGE holds no SANITAIRE right: the alerts are closed to it.
      await get(`/surveillance/alerts/${alert.id}`, dge.token).expect(403);
      await post(
        `/surveillance/alerts/${alert.id}/transitions`,
        { statusCode: 'EN_ANALYSE' },
        custom.token,
      ).expect(201);
      await post(
        `/surveillance/alerts/${alert.id}/transitions`,
        { statusCode: 'CONFIRMEE', comment: 'Confirmée par un profil provincial' },
        custom.token,
      ).expect(201);
      const published = await post(
        `/surveillance/alerts/${alert.id}/publish`,
        {},
        custom.token,
      ).expect(201);
      expect(published.body.published).toBe(true);
    });

    it('règle les seuils vétérinaires et la formule de mortalité du jour', async () => {
      const threshold = await parameter('SEUIL_ALERTE_MORTALITE_JOUR_PCT');
      await setParameter('SEUIL_ALERTE_MORTALITE_JOUR_PCT', threshold, custom.token).expect(201);
      const formula = await parameter('FORMULE_MORTALITE_JOUR_PCT');
      await setParameter('FORMULE_MORTALITE_JOUR_PCT', formula, custom.token).expect(201);
      const constants = (await get('/reference-constants', custom.token).expect(200))
        .body as Array<{ key: string; value: number; ownerProfile: string }>;
      const vide = constants.find((c) => c.key === 'vide_sanitaire_min_days')!;
      expect(vide.ownerProfile).toBe('VETERINAIRE');
      await patch(
        '/reference-constants/vide_sanitaire_min_days',
        { value: vide.value },
        custom.token,
      ).expect(200);
    });

    it('tient les listes sanitaires et les calendriers vaccinaux', async () => {
      await post(
        '/surveillance/lists/SIGNE_CLINIQUE',
        { code: `SIGNE_A2_${tag}`, label: `Signe A2 ${tag}` },
        custom.token,
      ).expect(201);
      await patch(
        `/surveillance/lists/SIGNE_CLINIQUE/SIGNE_A2_${tag}`,
        { active: false },
        custom.token,
      ).expect(200);
      const calendar = await post(
        '/surveillance/vaccination-calendars',
        {
          name: `Calendrier A2 ${tag}`,
          species: 'DINDE',
          type: 'CHAIR',
          steps: [{ stepOrder: 1, dayFrom: 1, dayTo: 1, careType: 'VACCIN', name: 'Newcastle' }],
        },
        custom.token,
      ).expect(201);
      expect(calendar.body.farmId).toBeNull();
    });

    it('lit et valide les déclarations', async () => {
      const declared = await declare({ title: `Déclaration custom ${tag}` }).expect(201);
      const list = await get(
        `/surveillance/declarations?farmId=${farmId}&state=A_EXAMINER`,
        custom.token,
      ).expect(200);
      expect(list.body.items.map((d: { id: string }) => d.id)).toContain(declared.body.id);
      const reviewed = await post(
        `/surveillance/declarations/${declared.body.id}/review`,
        { decision: 'VALIDEE' },
        custom.token,
      ).expect(201);
      expect(reviewed.body).toMatchObject({ reviewState: 'VALIDEE', reviewedById: custom.userId });
    });
  });

  describe('le profil VETERINAIRE privé de ses droits SANITAIRE ne peut plus rien', () => {
    let alertId: string;
    let declarationId: string;

    beforeAll(async () => {
      const declared = await declare({
        title: `Suspicion avant retrait ${tag}`,
        suspicion: true,
      }).expect(201);
      await settle();
      alertId = (
        await get(`/farms/${farmId}/sanitary-alerts`, ownerToken).expect(200)
      ).body.items.find(
        (a: { healthEventId: string }) => a.healthEventId === declared.body.id,
      ).id;
      declarationId = (await declare({ title: `Sans alerte ${tag}` }).expect(201)).body.id;
      await patch(
        `/programme/access/profiles/${vetProfileId}`,
        {
          matrix: {
            ...vetMatrix,
            SANITAIRE: ['CONSULTER'],
          },
        },
        adminToken,
      ).expect(200);
    });

    afterAll(async () => {
      await patch(
        `/programme/access/profiles/${vetProfileId}`,
        { matrix: vetMatrix },
        adminToken,
      ).expect(200);
    });

    it('refuse déclarations, qualification, publication, seuils et listes', async () => {
      const refused = await get('/surveillance/declarations', vet.token).expect(403);
      expect(refused.body.message).toContain('Sanitaire : Valider');
      await get(
        `/farms/${farmId}/batches/${batchId}/health-events`,
        vet.token,
      ).expect(403);
      // The unpublished alert is out of its sight.
      await get(`/surveillance/alerts/${alertId}`, vet.token).expect(404);
      await post(
        `/surveillance/alerts/${alertId}/transitions`,
        { statusCode: 'EN_ANALYSE' },
        vet.token,
      ).expect(403);
      await post(`/surveillance/alerts/${alertId}/publish`, {}, vet.token).expect(403);
      await post(
        `/surveillance/declarations/${declarationId}/review`,
        { decision: 'VALIDEE' },
        vet.token,
      ).expect(403);
      const threshold = await parameter('SEUIL_ALERTE_MORTALITE_JOUR_PCT');
      const param = await setParameter(
        'SEUIL_ALERTE_MORTALITE_JOUR_PCT',
        threshold,
        vet.token,
      ).expect(403);
      expect(param.body.message).toContain('Sanitaire : Modifier');
      await post(
        '/surveillance/lists/SIGNE_CLINIQUE',
        { code: `STRIP_${tag}`, label: 'x' },
        vet.token,
      ).expect(403);
    });
  });

  describe('l’administrateur plateforme lit les réglages vétérinaires sans les changer', () => {
    it('refuse listes sanitaires, calendriers et formule de mortalité du jour', async () => {
      const lists = await post(
        '/surveillance/lists/PRODUIT_TRAITEMENT',
        { code: `ADM_${tag}`, label: 'x' },
        adminToken,
      ).expect(403);
      expect(lists.body.message).toContain('consulte seulement');
      await patch('/surveillance/lists/STATUT_ALERTE/NOUVELLE', { label: 'Nouvelle' }, adminToken).expect(403);
      // Nor through the generic programme lists.
      await post(
        '/programme/lists/SIGNE_CLINIQUE',
        { code: `ADM_${tag}`, label: 'x' },
        adminToken,
      ).expect(403);
      await patch('/programme/lists/PRODUIT_TRAITEMENT/X', { label: 'x' }, adminToken).expect(403);
      const calendar = {
        name: `Calendrier admin ${tag}`,
        type: 'CHAIR',
        steps: [{ stepOrder: 1, dayFrom: 1, dayTo: 1, careType: 'VACCIN', name: 'x' }],
      };
      await post('/surveillance/vaccination-calendars', calendar, adminToken).expect(403);
      await post('/sanitary/protocols', calendar, adminToken).expect(403);
      const protocols = (await get('/sanitary/protocols', adminToken).expect(200)).body as Array<{
        id: string;
      }>;
      await patch(
        `/surveillance/vaccination-calendars/${protocols[0].id}`,
        { name: 'x' },
        adminToken,
      ).expect(403);
      const formula = await parameter('FORMULE_MORTALITE_JOUR_PCT');
      const refused = await setParameter('FORMULE_MORTALITE_JOUR_PCT', formula, adminToken).expect(403);
      expect(refused.body.message).toContain('VETERINAIRE');
      // The DGE no longer owns it either; it keeps its own formulas.
      await setParameter('FORMULE_MORTALITE_JOUR_PCT', formula, dge.token).expect(403);
      const viability = await parameter('FORMULE_VIABILITE');
      await setParameter('FORMULE_VIABILITE', viability, dge.token).expect(201);
      await setParameter('FORMULE_MORTALITE_JOUR_PCT', formula, vet.token).expect(201);
      const all = (await get('/programme/parameters', adminToken).expect(200)).body as Array<{
        key: string;
        ownerProfile: string;
        ownerRight: { domain: string; action: string } | null;
      }>;
      expect(all.find((p) => p.key === 'FORMULE_MORTALITE_JOUR_PCT')).toMatchObject({
        ownerProfile: 'VETERINAIRE',
        ownerRight: { domain: 'SANITAIRE', action: 'MODIFIER' },
      });
    });
  });

  describe('validation vétérinaire d’une déclaration sans alerte (CDC n° 26)', () => {
    it('registre réservé aux vétérinaires, lu par l’admin plateforme', async () => {
      await get('/surveillance/declarations', dge.token).expect(403);
      await get('/surveillance/declarations', ownerToken).expect(403);
      const byAdmin = await get(`/surveillance/declarations?farmId=${farmId}`, adminToken).expect(200);
      expect(byAdmin.body.total).toBeGreaterThan(0);
    });

    it('valide, infirme (commentaire obligatoire) une fois, journalisé et notifié à la ferme', async () => {
      const declared = await declare({ title: `Toux ${tag}`, quantity: 0 }).expect(201);
      const id = declared.body.id as string;
      const before = await get(`/surveillance/declarations/${id}`, vet.token).expect(200);
      expect(before.body).toMatchObject({
        reviewState: 'A_EXAMINER',
        reviewStatus: null,
        alertId: null,
        farmId,
        batchId,
      });
      await post(`/surveillance/declarations/${id}/review`, { decision: 'VALIDEE' }, adminToken).expect(403);
      const noComment = await post(
        `/surveillance/declarations/${id}/review`,
        { decision: 'INFIRMEE' },
        vet.token,
      ).expect(400);
      expect(noComment.body.message).toContain('commentaire');
      await post(`/surveillance/declarations/${id}/review`, { decision: 'AUTRE' }, vet.token).expect(400);
      const ruledOut = await post(
        `/surveillance/declarations/${id}/review`,
        { decision: 'INFIRMEE', comment: 'Toux passagère, sans signe infectieux' },
        vet.token,
      ).expect(201);
      expect(ruledOut.body).toMatchObject({
        reviewState: 'INFIRMEE',
        reviewComment: 'Toux passagère, sans signe infectieux',
        reviewedById: vet.userId,
      });
      expect(ruledOut.body.reviewedAt).not.toBeNull();
      expect(ruledOut.body.reviewedByName).toContain('VETERINAIRE');
      const again = await post(
        `/surveillance/declarations/${id}/review`,
        { decision: 'VALIDEE' },
        vet.token,
      ).expect(409);
      expect(again.body.message).toContain('déjà été examinée');
      await settle();

      // The farm sees the decision on its declaration and is notified.
      const events = await get(
        `/farms/${farmId}/batches/${batchId}/health-events`,
        ownerToken,
      ).expect(200);
      expect(events.body.find((e: { id: string }) => e.id === id)).toMatchObject({
        vetReviewStatus: 'INFIRMEE',
        vetReviewComment: 'Toux passagère, sans signe infectieux',
      });
      const box = (await get('/notifications?limit=200', ownerToken).expect(200)).body as {
        items: Array<{ event: string; subjectId: string; body: string }>;
      };
      const note = box.items.find((n) => n.event === 'DECLARATION_REVIEWED' && n.subjectId === id);
      expect(note?.body).toContain('infirmée');
      // DGE never hears it (confidential event).
      const dgeBox = (await get('/notifications?limit=200', dge.token).expect(200)).body as {
        items: Array<{ subjectId: string }>;
      };
      expect(dgeBox.items.some((n) => n.subjectId === id)).toBe(false);
      // Journaled like any POST.
      const journal = await ds.query(
        `SELECT method, status_code FROM audit_events
          WHERE actor_user_id = $1 AND route = $2 AND params->>'declarationId' = $3`,
        [vet.userId, '/surveillance/declarations/:declarationId/review', id],
      );
      expect(journal.length).toBeGreaterThan(0);
    });

    it('convertit une déclaration en alerte officielle, qui suit alors le circuit', async () => {
      const declared = await declare({ title: `Mortalité suspecte ${tag}` }).expect(201);
      const id = declared.body.id as string;
      const converted = await post(
        `/surveillance/declarations/${id}/review`,
        { decision: 'ALERTE', comment: 'À investiguer : signes respiratoires' },
        vet.token,
      ).expect(201);
      expect(converted.body).toMatchObject({ reviewState: 'ALERTE', alertStatusFamily: 'NOUVELLE' });
      expect(converted.body.alertCode).toMatch(/^AS-\d{4}-\d{4}$/);
      const alert = await get(`/surveillance/alerts/${converted.body.alertId}`, vet.token).expect(200);
      expect(alert.body).toMatchObject({ origin: 'DECLARATION', healthEventId: id, published: false });
      expect(alert.body.transitions[0]).toMatchObject({
        kind: 'CREATION',
        authorId: vet.userId,
        comment: 'À investiguer : signes respiratoires',
      });
      await settle();
      const box = (await get('/notifications?limit=200', ownerToken).expect(200)).body as {
        items: Array<{ event: string; subjectId: string }>;
      };
      expect(box.items.some((n) => n.event === 'DECLARATION_REVIEWED' && n.subjectId === id)).toBe(true);
      expect(
        box.items.some((n) => n.event === 'SANITARY_ALERT_CREATED' && n.subjectId === converted.body.alertId),
      ).toBe(true);

      // A suspicion already opened its alert: qualified in the alert's circuit.
      const suspicion = await declare({ title: `Suspicion ${tag}`, suspicion: true }).expect(201);
      await settle();
      const inCircuit = await post(
        `/surveillance/declarations/${suspicion.body.id}/review`,
        { decision: 'VALIDEE' },
        vet.token,
      ).expect(409);
      expect(inCircuit.body.message).toContain('circuit de l’alerte');
      const states = await get(
        `/surveillance/declarations?farmId=${farmId}&state=ALERTE`,
        vet.token,
      ).expect(200);
      const ids = states.body.items.map((d: { id: string }) => d.id);
      expect(ids).toEqual(expect.arrayContaining([id, suspicion.body.id]));
    });
  });
});
