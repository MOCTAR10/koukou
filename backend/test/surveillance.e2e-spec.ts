import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  ConsoleSmsSender,
  SMS_SENDER,
} from './../src/modules/auth/sms/sms-sender.js';
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

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Account {
  token: string;
  userId: string;
  phone: string;
  membershipId: string;
}

describe('Surveillance sanitaire et notifications — lot L5 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let alerts: SanitaryAlertsService;
  let notify: NotifyService;
  let sms: ConsoleSmsSender;
  let adminToken: string;
  let ownerToken: string;
  let farmId: string;
  let farmCode: string;
  let otherFarmId: string;
  let batchId: string;
  let vet: Account;
  let vet2: Account;
  let dge: Account;
  /** Custom profile: SANITAIRE CONSULTER only, province G5, no REGISTRE. */
  let reader: Account;
  const memberships: string[] = [];
  let ruleId: string;

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

  /** Bus listeners run after commit: wait for the whole chain. */
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
      phone,
      membershipId: res.body.id as string,
    };
  }

  const inbox = async (token: string) =>
    (await get('/notifications?limit=200', token).expect(200)).body as {
      items: Array<{
        id: string;
        event: string;
        subjectId: string | null;
        title: string;
        readAt: string | null;
      }>;
      unread: number;
    };

  const declare = (body: object, token = ownerToken) =>
    post(`/farms/${farmId}/batches/${batchId}/health-events`, body, token);

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
    sms = app.get<ConsoleSmsSender>(SMS_SENDER);

    adminToken = (await createPlatformAdmin(server, ds)).token;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Veille ${tag}`,
      provinceCode: 'G5',
    });
    ownerToken = farm.ownerToken;
    farmId = farm.farmId;
    farmCode = farm.farmCode;
    otherFarmId = (
      await createProgrammeFarm(server, adminToken, {
        name: `Ferme Autre ${tag}`,
        provinceCode: 'G2',
      })
    ).farmId;

    const band = await post(
      `/farms/${farmId}/batches`,
      {
        batchName: `Bande veille ${stamp}`,
        type: 'CHAIR',
        integrationDate: day(-5),
        quantityAtStart: 1000,
      },
      ownerToken,
    ).expect(201);
    batchId = band.body.id;

    vet = await institution('VETERINAIRE');
    vet2 = await institution('VETERINAIRE');
    dge = await institution('DGE');
    const readerCode = `LECTSAN${String(stamp).slice(-6)}`;
    await post(
      '/programme/access/profiles',
      {
        code: readerCode,
        label: `Lecteur sanitaire ${tag}`,
        scopeKind: 'PROVINCES',
        matrix: { SANITAIRE: ['CONSULTER'] },
      },
      adminToken,
    ).expect(201);
    reader = await institution(readerCode, { provinceCodes: ['G5'] });

    // vet2 has a phone registered for push; vet has none.
    await post(
      '/push/devices',
      { token: `ExponentPushToken[vet2-${stamp}]` },
      vet2.token,
    ).expect(204);
  });

  afterAll(async () => {
    if (ruleId) {
      await patch(
        `/programme/notification-rules/${ruleId}`,
        { escalateAfterMin: null },
        adminToken,
      );
    }
    // Later runs on the same DB must not notify these accounts again.
    for (const id of memberships) {
      await patch(`/programme/access/memberships/${id}`, { active: false }, adminToken);
    }
    await settle();
    await app.close();
  });

  describe('déclaration sanitaire', () => {
    let eventId: string;
    let alertId: string;

    it('enregistre signes cliniques et suspicion, une seule fois hors ligne', async () => {
      await declare({
        kind: 'MALADIE',
        occurredAt: day(0),
        severity: 'ROUGE',
        title: 'Suspicion test',
        clinicalSigns: ['INCONNU_XYZ'],
      }).expect(400);
      const body = {
        kind: 'MALADIE',
        occurredAt: day(0),
        severity: 'ROUGE',
        title: `Suspicion ${tag}`,
        quantity: 12,
        clinicalSigns: ['DIARRHEE', 'ABATTEMENT', 'DIARRHEE'],
        suspicion: true,
        idempotencyKey: `op-${stamp}`,
      };
      const first = await declare(body).expect(201);
      expect(first.body).toMatchObject({
        suspicion: true,
        clinicalSigns: ['DIARRHEE', 'ABATTEMENT'],
      });
      const replay = await declare(body).expect(201);
      expect(replay.body.id).toBe(first.body.id);
      eventId = first.body.id;
      await settle();
    });

    it('ouvre une alerte officielle NOUVELLE, visible de la ferme et des vétérinaires', async () => {
      const farmList = await get(
        `/farms/${farmId}/sanitary-alerts`,
        ownerToken,
      ).expect(200);
      const mine = farmList.body.items.filter(
        (a: { healthEventId: string }) => a.healthEventId === eventId,
      );
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({
        origin: 'DECLARATION',
        statusFamily: 'NOUVELLE',
        farmCode,
        published: false,
        clinicalSigns: ['DIARRHEE', 'ABATTEMENT'],
      });
      expect(mine[0].code).toMatch(/^AS-\d{4}-\d{4,}$/);
      alertId = mine[0].id;

      const vetList = await get(
        `/surveillance/alerts?farmId=${farmId}`,
        vet.token,
      ).expect(200);
      expect(vetList.body.items.map((a: { id: string }) => a.id)).toContain(
        alertId,
      );
      const detail = await get(`/surveillance/alerts/${alertId}`, vet.token).expect(200);
      expect(detail.body.transitions).toHaveLength(1);
      expect(detail.body.transitions[0]).toMatchObject({ kind: 'CREATION' });

      // Unpublished: hidden from a non-veterinary profile, even with SANITAIRE.
      const hidden = await get(`/surveillance/alerts?farmId=${farmId}`, reader.token).expect(200);
      expect(hidden.body.items).toHaveLength(0);
      await get(`/surveillance/alerts/${alertId}`, reader.token).expect(404);
      // DGE holds no SANITAIRE at all.
      await get('/surveillance/alerts', dge.token).expect(403);
      // Farm owners use the farm route, not the programme one.
      await get('/surveillance/alerts', ownerToken).expect(403);
    });

    it('photos : envoi après le texte, contrôle du format, lecture réservée', async () => {
      const url = `/farms/${farmId}/batches/${batchId}/health-events/${eventId}/photos`;
      const bytes = Buffer.concat([PNG, randomBytes(64)]);
      const up = await request(server)
        .post(url)
        .set(auth(ownerToken))
        .attach('file', bytes, { filename: 'p.png', contentType: 'image/png' })
        .expect(201);
      expect(up.body).toMatchObject({ mimeType: 'image/png', sizeBytes: bytes.length });
      // An offline retry of the same file stores nothing new.
      const again = await request(server)
        .post(url)
        .set(auth(ownerToken))
        .attach('file', bytes, { filename: 'p.png', contentType: 'image/png' })
        .expect(201);
      expect(again.body.id).toBe(up.body.id);
      const fake = await request(server)
        .post(url)
        .set(auth(ownerToken))
        .attach('file', randomBytes(64), { filename: 'x.png', contentType: 'image/png' })
        .expect(400);
      expect(fake.body.message).toContain('PNG');

      const list = await get(
        `/farms/${farmId}/batches/${batchId}/health-events`,
        ownerToken,
      ).expect(200);
      const ev = list.body.find((e: { id: string }) => e.id === eventId);
      expect(ev.photos).toHaveLength(1);

      const photoUrl = `${url}/${up.body.id}`;
      const asVet = await get(photoUrl, vet.token)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(asVet.headers['content-type']).toContain('image/png');
      expect((asVet.body as Buffer).equals(bytes)).toBe(true);
      // The declarations rule, whatever the matrix.
      const refused = await get(photoUrl, reader.token).expect(403);
      expect(refused.body.message).toContain('services vétérinaires');
      await get(photoUrl, dge.token).expect(403);
    });

    it('circuit de qualification, puis publication par les vétérinaires', async () => {
      const move = (body: object, token = vet.token) =>
        post(`/surveillance/alerts/${alertId}/transitions`, body, token);
      const skip = await move({ statusCode: 'CONFIRMEE', comment: 'trop tôt' }).expect(400);
      expect(skip.body.message).toContain('EN_ANALYSE');
      await move({ statusCode: 'EN_ANALYSE' }, reader.token).expect(403);
      await move({ statusCode: 'EN_ANALYSE' }, ownerToken).expect(403);
      await move({ statusCode: 'EN_ANALYSE', comment: 'Prélèvements' }).expect(201);
      const noComment = await move({ statusCode: 'CONFIRMEE' }).expect(400);
      expect(noComment.body.message).toContain('commentaire');
      await post(`/surveillance/alerts/${alertId}/publish`, {}, vet.token).expect(400);
      const confirmed = await move({
        statusCode: 'CONFIRMEE',
        comment: 'Laboratoire positif',
      }).expect(201);
      expect(confirmed.body).toMatchObject({ statusFamily: 'CONFIRMEE', outcome: 'CONFIRMEE' });

      await post(`/surveillance/alerts/${alertId}/publish`, {}, reader.token).expect(403);
      const published = await post(
        `/surveillance/alerts/${alertId}/publish`,
        { comment: 'Publication officielle' },
        vet.token,
      ).expect(201);
      expect(published.body.published).toBe(true);
      expect(published.body.transitions.map((t: { kind: string }) => t.kind)).toEqual([
        'CREATION',
        'STATUT',
        'STATUT',
        'PUBLICATION',
      ]);
      await post(`/surveillance/alerts/${alertId}/publish`, {}, vet.token).expect(409);
      await settle();

      // Published: readable by the other SANITAIRE profile and the dashboards.
      const seen = await get(`/surveillance/alerts?farmId=${farmId}&published=true`, reader.token).expect(200);
      expect(seen.body.items.map((a: { id: string }) => a.id)).toContain(alertId);
      const forL6 = await alerts.publishedCountsByProvince({ from: day(-1), to: day(0) });
      expect(
        forL6.find((p) => p.provinceCode === 'G5')?.published ?? 0,
      ).toBeGreaterThanOrEqual(1);
      expect(
        (await alerts.publishedAlerts({ from: day(0) })).map((a) => a.id),
      ).toContain(alertId);

      await move({ statusCode: 'CLOSE' }).expect(201);
      await move({ statusCode: 'EN_ANALYSE' }).expect(400);
    });

    it('notifie : vétérinaires et ferme à la création, DGE seulement à la publication', async () => {
      const vetBox = await inbox(vet.token);
      const forAlert = vetBox.items.filter((n) => n.subjectId === alertId);
      expect(forAlert.map((n) => n.event)).toEqual(
        expect.arrayContaining([
          'SANITARY_ALERT_CREATED',
          'SANITARY_ALERT_STATUS_CHANGED',
        ]),
      );
      expect(
        vetBox.items.some(
          (n) => n.event === 'DECLARATION_RECEIVED' && n.subjectId === eventId,
        ),
      ).toBe(true);
      const ownerBox = await inbox(ownerToken);
      expect(
        ownerBox.items.some(
          (n) => n.event === 'SANITARY_ALERT_CREATED' && n.subjectId === alertId,
        ),
      ).toBe(true);
      const dgeBox = await inbox(dge.token);
      const dgeEvents = dgeBox.items
        .filter((n) => n.subjectId === alertId || n.subjectId === eventId)
        .map((n) => n.event);
      expect(dgeEvents).toEqual(['SANITARY_ALERT_PUBLISHED']);

      // Reading.
      const before = (await get('/notifications/unread-count', vet.token).expect(200)).body
        .count as number;
      const one = forAlert[0];
      const read = await post(`/notifications/${one.id}/read`, {}, vet.token).expect(201);
      expect(read.body.readAt).not.toBeNull();
      const after = (await get('/notifications/unread-count', vet.token).expect(200)).body
        .count as number;
      expect(after).toBe(before - 1);
      await post(`/notifications/${one.id}/read`, {}, dge.token).expect(404);
      await post('/notifications/read-all', {}, vet.token).expect(201);
      expect((await inbox(vet.token)).unread).toBe(0);
    });
  });

  describe('seuil de mortalité journalière', () => {
    it('ouvre une alerte quand la mortalité du jour dépasse le seuil vétérinaire, une fois par épisode', async () => {
      const params = (await get('/programme/parameters', adminToken).expect(200)).body as Array<{
        key: string;
        value: number;
      }>;
      const threshold = params.find((p) => p.key === 'SEUIL_ALERTE_MORTALITE_JOUR_PCT')!.value;
      const band = await post(
        `/farms/${farmId}/batches`,
        {
          batchName: `Bande mortalité ${stamp}`,
          type: 'CHAIR',
          integrationDate: day(-3),
          quantityAtStart: 1000,
        },
        ownerToken,
      ).expect(201);
      const deaths = Math.min(900, Math.floor(threshold * 10) + 20);
      const entry = (body: object) =>
        post(`/farms/${farmId}/batches/${band.body.id}/daily-entries`, body, ownerToken);
      await entry({ entryDate: day(-1), deaths, feedQuantity: 20, feedUnit: 'KG' }).expect(201);
      await settle();
      const list = async () =>
        (
          await get(`/farms/${farmId}/sanitary-alerts?origin=MORTALITE`, ownerToken).expect(200)
        ).body.items.filter((a: { batchId: string }) => a.batchId === band.body.id);
      const opened = await list();
      expect(opened).toHaveLength(1);
      expect(opened[0]).toMatchObject({
        statusFamily: 'NOUVELLE',
        factDay: day(-1),
        severity: 'ROUGE',
        thresholdPct: threshold,
        deaths,
        presentStart: 1000,
      });
      // Re-evaluations and a new day of the same episode: still one alert.
      await entry({ entryDate: day(-1), deaths, feedQuantity: 25, feedUnit: 'KG' }).expect(201);
      await entry({ entryDate: day(0), deaths, feedQuantity: 20, feedUnit: 'KG' }).expect(201);
      await settle();
      const still = await list();
      expect(still).toHaveLength(1);
      expect(still[0].lastFactDay).toBe(day(0));
    });
  });

  describe('escalade par SMS', () => {
    it('refuse une règle qui ferait sortir des données sanitaires non publiées', async () => {
      const events = await get('/programme/notification-rules/events', adminToken).expect(200);
      expect(
        events.body.find((e: { event: string }) => e.event === 'SANITARY_ALERT_CREATED'),
      ).toMatchObject({ confidential: true });
      const bad = await post(
        '/programme/notification-rules',
        {
          code: `DGE_FUITE_${tag}`,
          label: 'Fuite',
          event: 'SANITARY_ALERT_CREATED',
          audience: 'PROFILE',
          profileCode: 'DGE',
          channels: ['IN_APP'],
        },
        adminToken,
      ).expect(400);
      expect(bad.body.message).toContain('services vétérinaires');
      await post(
        '/programme/notification-rules',
        {
          code: `SANS_INAPP_${tag}`,
          label: 'Sans boîte',
          event: 'WEIGHING_LATE',
          audience: 'FARM_MANAGERS',
          channels: ['PUSH'],
        },
        adminToken,
      ).expect(400);
      await get('/programme/notification-rules', ownerToken).expect(403);
      await get('/programme/notification-rules', vet.token).expect(403);
    });

    it('envoie un SMS minimal quand la notification reste non lue, ou sans téléphone enregistré', async () => {
      const rules = (await get('/programme/notification-rules', adminToken).expect(200)).body as Array<{
        id: string;
        code: string;
      }>;
      ruleId = rules.find((r) => r.code === 'VET_ALERTE_SANITAIRE_NOUVELLE')!.id;
      await patch(
        `/programme/notification-rules/${ruleId}`,
        { escalateAfterMin: 5 },
        adminToken,
      ).expect(200);

      const created = await declare({
        kind: 'SYMPTOME',
        occurredAt: day(0),
        severity: 'JAUNE',
        title: `Seconde suspicion ${tag}`,
        suspicion: true,
      }).expect(201);
      await settle();
      const alert = (
        await get(`/farms/${farmId}/sanitary-alerts`, ownerToken).expect(200)
      ).body.items.find((a: { healthEventId: string }) => a.healthEventId === created.body.id);

      // vet: no device → the push fails and the SMS leaves at once.
      const vetSms = sms.lastTo(vet.phone);
      expect(vetSms?.message).toBe(
        `POUFA : nouvelle alerte sanitaire ${farmCode}. Ouvrez l'application.`,
      );
      // vet2: pushed; nothing yet, then the sweep escalates after 5 minutes.
      expect(sms.lastTo(vet2.phone)).toBeNull();
      await notify.sweep(new Date(Date.now() + 2 * 60_000));
      expect(sms.lastTo(vet2.phone)).toBeNull();
      await notify.sweep(new Date(Date.now() + 6 * 60_000));
      expect(sms.lastTo(vet2.phone)?.message).toContain(farmCode);
      // One alert = one SMS: a later sweep sends nothing more.
      const rows = await ds.query(
        `SELECT channel, status, escalated_from_id FROM notifications
          WHERE user_id = $1 AND subject_id = $2 ORDER BY channel`,
        [vet2.userId, alert.id],
      );
      expect(rows.map((r: { channel: string }) => r.channel)).toEqual(['IN_APP', 'PUSH', 'SMS']);
      expect(rows.find((r: { channel: string }) => r.channel === 'SMS').escalated_from_id).not.toBeNull();
      await notify.sweep(new Date(Date.now() + 60 * 60_000));
      const smsCount = await ds.query(
        `SELECT COUNT(*)::int AS n FROM notifications
          WHERE user_id = $1 AND subject_id = $2 AND channel = 'SMS'`,
        [vet2.userId, alert.id],
      );
      expect(smsCount[0].n).toBe(1);
    });

    it('la lecture arrête l’escalade', async () => {
      const created = await declare({
        kind: 'SYMPTOME',
        occurredAt: day(0),
        severity: 'JAUNE',
        title: `Troisième suspicion ${tag}`,
        suspicion: true,
      }).expect(201);
      await settle();
      const alert = (
        await get(`/farms/${farmId}/sanitary-alerts`, ownerToken).expect(200)
      ).body.items.find((a: { healthEventId: string }) => a.healthEventId === created.body.id);
      const box = await inbox(vet2.token);
      const item = box.items.find(
        (n) => n.subjectId === alert.id && n.event === 'SANITARY_ALERT_CREATED',
      )!;
      const smsBefore = sms.lastTo(vet2.phone);
      await post(`/notifications/${item.id}/read`, {}, vet2.token).expect(201);
      await notify.sweep(new Date(Date.now() + 10 * 60_000));
      expect(sms.lastTo(vet2.phone)).toEqual(smsBefore);
      const smsRows = await ds.query(
        `SELECT COUNT(*)::int AS n FROM notifications
          WHERE user_id = $1 AND subject_id = $2 AND channel = 'SMS'`,
        [vet2.userId, alert.id],
      );
      expect(smsRows[0].n).toBe(0);
    });
  });

  describe('listes et calendrier des vétérinaires', () => {
    it('les vétérinaires gèrent les listes sanitaires seulement', async () => {
      const code = `SIGNE_${tag}`;
      await post(
        '/surveillance/lists/SIGNE_CLINIQUE',
        { code, label: `Signe e2e ${tag}` },
        vet.token,
      ).expect(201);
      await declare({
        kind: 'SYMPTOME',
        occurredAt: day(0),
        severity: 'VERT',
        title: 'Signe nouveau',
        clinicalSigns: [code],
      }).expect(201);
      await patch(`/surveillance/lists/SIGNE_CLINIQUE/${code}`, { active: false }, vet.token).expect(200);
      await declare({
        kind: 'SYMPTOME',
        occurredAt: day(0),
        severity: 'VERT',
        title: 'Signe désactivé',
        clinicalSigns: [code],
      }).expect(400);
      await post(
        '/surveillance/lists/MOTIF_SORTIE',
        { code: `M_${tag}`, label: 'x', family: 'AUTRE' },
        vet.token,
      ).expect(400);
      await post('/surveillance/lists/SIGNE_CLINIQUE', { code: `D_${tag}`, label: 'x' }, dge.token).expect(403);
      await post('/surveillance/lists/SIGNE_CLINIQUE', { code: `R_${tag}`, label: 'x' }, reader.token).expect(403);
      const last = await patch(
        '/surveillance/lists/STATUT_ALERTE/NOUVELLE',
        { active: false },
        vet.token,
      ).expect(400);
      expect(last.body.message).toContain('Dernier statut actif');
    });

    it('les vétérinaires tiennent le calendrier vaccinal de référence', async () => {
      const created = await post(
        '/surveillance/vaccination-calendars',
        {
          name: `Calendrier faisan ${tag}`,
          species: 'FAISAN',
          type: 'PONDEUSE',
          reference: true,
          steps: [
            {
              stepOrder: 1,
              dayFrom: 1,
              dayTo: 1,
              careType: 'VACCIN',
              name: 'Marek',
            },
          ],
        },
        vet.token,
      ).expect(201);
      expect(created.body).toMatchObject({ farmId: null, isDefault: true });
      const id = created.body.id as string;
      const added = await post(
        `/surveillance/vaccination-calendars/${id}/steps`,
        { stepOrder: 2, dayFrom: 10, dayTo: 12, careType: 'VACCIN', name: 'Gumboro' },
        vet.token,
      ).expect(201);
      expect(added.body.steps).toHaveLength(2);
      await post(
        `/surveillance/vaccination-calendars/${id}/steps`,
        { stepOrder: 3, dayFrom: 12, dayTo: 10, careType: 'VACCIN', name: 'Inversé' },
        vet.token,
      ).expect(400);
      const step = added.body.steps.find((s: { name: string }) => s.name === 'Gumboro');
      const off = await patch(
        `/surveillance/vaccination-calendars/${id}/steps/${step.id}`,
        { active: false },
        vet.token,
      ).expect(200);
      expect(off.body.steps.find((s: { id: string }) => s.id === step.id).active).toBe(false);
      // Only one reference per species and type.
      const second = await post(
        '/surveillance/vaccination-calendars',
        {
          name: `Calendrier faisan bis ${tag}`,
          species: 'FAISAN',
          type: 'PONDEUSE',
          reference: true,
          steps: [{ stepOrder: 1, dayFrom: 2, dayTo: 2, careType: 'VACCIN', name: 'Newcastle' }],
        },
        vet.token,
      ).expect(201);
      const first = await get(`/sanitary/protocols/${id}`, vet.token).expect(200);
      expect(first.body.isDefault).toBe(false);
      expect(second.body.isDefault).toBe(true);
      await post(
        '/surveillance/vaccination-calendars',
        { name: 'x', type: 'CHAIR', steps: [{ stepOrder: 1, dayFrom: 1, dayTo: 1, careType: 'VACCIN', name: 'x' }] },
        ownerToken,
      ).expect(403);
      await post(
        '/surveillance/vaccination-calendars',
        { name: 'x', type: 'CHAIR', steps: [{ stepOrder: 1, dayFrom: 1, dayTo: 1, careType: 'VACCIN', name: 'x' }] },
        dge.token,
      ).expect(403);
    });
  });

  describe('accès des vétérinaires aux bandes et à leur session', () => {
    it('liste minimale des bandes sous le domaine SANITAIRE', async () => {
      await get(`/farms/${farmId}/batches`, vet.token).expect(403);
      const lots = await get(`/farms/${farmId}/sanitary/lots`, vet.token).expect(200);
      const lot = lots.body.find((l: { id: string }) => l.id === batchId);
      expect(lot).toMatchObject({
        code: expect.stringMatching(/-B\d+$/),
        type: 'CHAIR',
        species: 'POULET',
        integrationDate: day(-5),
        ageDays: 5,
        quantityAtStart: 1000,
        building: null,
        closedAt: null,
      });
      expect(Object.keys(lot).sort()).toEqual(
        [
          'ageDays',
          'building',
          'closedAt',
          'code',
          'id',
          'integrationDate',
          'name',
          'quantityAlive',
          'quantityAtStart',
          'species',
          'status',
          'type',
        ].sort(),
      );
      const open = await get(`/farms/${farmId}/sanitary/lots?open=true`, ownerToken).expect(200);
      expect(open.body.map((l: { id: string }) => l.id)).toContain(batchId);
      await get(`/farms/${farmId}/sanitary/lots`, dge.token).expect(403);
      // reader: SANITAIRE, province G5 only.
      await get(`/farms/${otherFarmId}/sanitary/lots`, reader.token).expect(403);
    });

    it('GET /farms et /farms/:farmId/me relèvent de la session, dans le périmètre', async () => {
      const farms = await get('/farms', reader.token).expect(200);
      const ids = farms.body.map((f: { id: string }) => f.id);
      expect(ids).toContain(farmId);
      expect(ids).not.toContain(otherFarmId);
      const me = await get(`/farms/${farmId}/me`, reader.token).expect(200);
      expect(me.body).toMatchObject({ farmId, role: 'INSTITUTION' });
      await get(`/farms/${otherFarmId}/me`, reader.token).expect(403);
      // Other farm routes keep their domain.
      await get(`/farms/${farmId}/permissions`, reader.token).expect(403);
    });
  });
});
