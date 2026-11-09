import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { dateFr } from './../src/common/utils/date.utils.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  uniquePhone,
} from './helpers/programme-farm.js';

function day(offset = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/**
 * POUFA lot A (sante): CDC §5.2 n° 22-23. Treatment register (end date,
 * reason, animals, product from PRODUIT_TRAITEMENT), vaccination completion
 * (animals, route) and the offline idempotency of both.
 *
 * PRODUIT_TRAITEMENT is a programme-wide list that other specs expect empty
 * (they record free-text treatments): this spec deactivates what it adds, and
 * gives back the items it found active.
 */
describe('Sanitaire conforme — traitements et vaccinations (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let ownerToken: string;
  let vetToken: string;
  let farmId: string;
  let batchId: string;
  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');
  const productCode = `E2E_AMOX_${tag}`;
  /** Active before this spec: deactivated during it, reactivated after. */
  let foundActive: string[] = [];
  let added = false;

  const post = (url: string, body: object, token = ownerToken) =>
    request(server).post(url).set(auth(token)).send(body);
  const patch = (url: string, body: object, token: string) =>
    request(server).patch(url).set(auth(token)).send(body);
  const get = (url: string, token = ownerToken) =>
    request(server).get(url).set(auth(token));
  const treatments = () => `/farms/${farmId}/batches/${batchId}/treatments`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    ds = app.get(DataSource);

    adminToken = (await createPlatformAdmin(server, ds)).token;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Conforme ${tag}`,
    });
    ownerToken = farm.ownerToken;
    farmId = farm.farmId;
    const vetPhone = uniquePhone('+2417');
    const vet = await post(
      '/programme/access/memberships',
      { fullName: `Vétérinaire ${tag}`, phone: vetPhone, profileCode: 'VETERINAIRE' },
      adminToken,
    ).expect(201);
    vetToken = await login(server, vetPhone, vet.body.loginCode as string);

    const band = await post(`/farms/${farmId}/batches`, {
      batchName: `Bande conforme ${tag}`,
      type: 'CHAIR',
      integrationDate: day(0),
      quantityAtStart: 500,
    }).expect(201);
    batchId = band.body.id as string;

    const active = await get('/programme/lists/PRODUIT_TRAITEMENT').expect(200);
    foundActive = (active.body as Array<{ code: string }>).map((i) => i.code);
    for (const code of foundActive) {
      await patch(`/surveillance/lists/PRODUIT_TRAITEMENT/${code}`, { active: false }, vetToken).expect(200);
    }
  });

  afterAll(async () => {
    if (added) {
      await patch(
        `/surveillance/lists/PRODUIT_TRAITEMENT/${productCode}`,
        { active: false },
        vetToken,
      );
    }
    for (const code of foundActive) {
      await patch(`/surveillance/lists/PRODUIT_TRAITEMENT/${code}`, { active: true }, vetToken);
    }
    await app.close();
  });

  describe('registre des traitements (n° 23)', () => {
    const key = `off-treatment-${tag}`;
    let firstId: string;

    it('enregistre dates de début et fin, motif et animaux ; le délai d’attente court depuis la fin', async () => {
      const res = await post(treatments(), {
        careType: 'ANTIBIOTIQUE',
        productName: 'Oxytétracycline',
        administeredAt: day(-2),
        endDate: day(0),
        reason: 'Coryza suspecté',
        animalCount: 480,
        withdrawalDays: 5,
        idempotencyKey: key,
      }).expect(201);
      firstId = res.body.id as string;
      expect(res.body).toMatchObject({
        productCode: null,
        productName: 'Oxytétracycline',
        endDate: day(0),
        reason: 'Coryza suspecté',
        animalCount: 480,
        withdrawalEndDate: day(5),
      });
      const journal: Array<{ n: number }> = await ds.query(
        `SELECT COUNT(*)::int AS n FROM audit_row_changes WHERE table_name = 'treatment_records' AND row_id = $1`,
        [firstId],
      );
      expect(journal[0].n).toBeGreaterThanOrEqual(1);
    });

    it('un rejeu hors ligne (même clé) rend le même traitement, une seule fois', async () => {
      const again = await post(treatments(), {
        careType: 'ANTIBIOTIQUE',
        productName: 'Oxytétracycline',
        administeredAt: day(-2),
        idempotencyKey: key,
      }).expect(201);
      expect(again.body.id).toBe(firstId);
      const list = await get(treatments()).expect(200);
      expect(list.body.filter((t: { id: string }) => t.id === firstId)).toHaveLength(1);
    });

    it('refuse une fin avant le début, trop d’animaux ou un code tant que la liste est vide', async () => {
      const base = { careType: 'VITAMINE', productName: 'Vitamines' };
      const before = await post(treatments(), {
        ...base,
        administeredAt: day(0),
        endDate: day(-1),
      }).expect(400);
      expect(before.body.message).toContain('précéder');
      const tooMany = await post(treatments(), { ...base, animalCount: 501 }).expect(400);
      expect(tooMany.body.message).toContain('501');
      const coded = await post(treatments(), { careType: 'VITAMINE', productCode: 'AMOX' }).expect(400);
      expect(coded.body.message).toContain('vide');
    });

    it('dès que les vétérinaires remplissent la liste, le produit vient de la liste', async () => {
      await post(
        '/surveillance/lists/PRODUIT_TRAITEMENT',
        { code: productCode, label: `Amoxicilline ${tag}` },
        vetToken,
      ).expect(201);
      added = true;
      const free = await post(treatments(), {
        careType: 'ANTIBIOTIQUE',
        productName: 'Produit libre',
      }).expect(400);
      expect(free.body.message).toContain('PRODUIT_TRAITEMENT');
      const unknown = await post(treatments(), {
        careType: 'ANTIBIOTIQUE',
        productCode: `${productCode}_X`,
      }).expect(400);
      expect(unknown.body.message).toContain('inconnu');
      const listed = await post(treatments(), {
        careType: 'ANTIBIOTIQUE',
        productCode,
        productName: 'ignoré',
        animalCount: 500,
        reason: 'Prévention',
      }).expect(201);
      expect(listed.body).toMatchObject({ productCode, productName: `Amoxicilline ${tag}` });
      // A care of the vets' calendar given before the band was opened keeps its name.
      const protocols = await get('/sanitary/protocols?species=POULET&type=CHAIR').expect(200);
      const reference = (protocols.body as Array<{ id: string; isDefault: boolean; farmId: string | null }>).find(
        (p) => p.isDefault && p.farmId === null,
      )!;
      const detail = await get(`/sanitary/protocols/${reference.id}`).expect(200);
      const step = detail.body.steps[0] as { id: string; name: string; careType: string };
      const fromStep = await post(treatments(), {
        careType: step.careType,
        protocolStepId: step.id,
        administeredAt: day(0),
        reason: 'Soin du calendrier sanitaire',
        animalCount: 500,
      }).expect(201);
      expect(fromStep.body).toMatchObject({ productCode: null, productName: step.name });
      await post(treatments(), {
        careType: 'VACCIN',
        protocolStepId: '00000000-0000-4000-8000-000000000000',
      }).expect(400);
      // A replay queued before the list was filled still returns its record.
      const replay = await post(treatments(), {
        careType: 'ANTIBIOTIQUE',
        productName: 'Oxytétracycline',
        idempotencyKey: key,
      }).expect(201);
      expect(replay.body.id).toBe(firstId);
      // Deactivated: the list is empty again, free text is back.
      await patch(`/surveillance/lists/PRODUIT_TRAITEMENT/${productCode}`, { active: false }, vetToken).expect(200);
      added = false;
      await post(treatments(), {
        careType: 'VITAMINE',
        productName: 'Vitamines',
        reason: 'Stress thermique',
        animalCount: 500,
      }).expect(201);
    });

    it('POUFA lot A2 : motif et nombre d’animaux obligatoires pour un nouveau traitement', async () => {
      const base = { careType: 'VITAMINE', productName: 'Vitamines', administeredAt: day(0) };
      const noReason = await post(treatments(), { ...base, animalCount: 500 }).expect(400);
      expect(noReason.body.message).toContain('motif');
      const noAnimals = await post(treatments(), { ...base, reason: 'Stress thermique' }).expect(400);
      expect(noAnimals.body.message).toContain('animaux');
    });
  });

  describe('réalisation d’une vaccination (n° 22)', () => {
    let events: Array<{ id: string; careType: string; status: string }>;

    beforeAll(async () => {
      const res = await post(`/farms/${farmId}/batches/${batchId}/prophylaxis/generate`, {}).expect(201);
      events = (res.body as typeof events).filter((e) => e.status !== 'ANNULE');
      expect(events.length).toBeGreaterThanOrEqual(2);
    });

    const complete = (eventId: string, body: object) =>
      post(`/farms/${farmId}/batches/${batchId}/prophylaxis/${eventId}/complete`, body);

    it('garde le nombre d’animaux et la voie réellement utilisée, une seule fois par clé', async () => {
      const [first] = events;
      const key = `off-prophylaxis-complete-${tag}`;
      const done = await complete(first.id, {
        completedAt: day(0),
        animalCount: 495,
        route: 'Nébulisation',
        idempotencyKey: key,
      }).expect(201);
      expect(done.body).toMatchObject({ status: 'FAIT', animalCount: 495, route: 'Nébulisation' });
      const replay = await complete(first.id, { completedAt: day(0), animalCount: 495, idempotencyKey: key }).expect(201);
      expect(replay.body).toMatchObject({ id: first.id, status: 'FAIT', animalCount: 495 });
      const other = await complete(first.id, { idempotencyKey: `${key}-autre` }).expect(400);
      expect(other.body.message).toContain('déjà été réalisé');
      await complete(first.id, {}).expect(400);
    });

    it('refuse plus d’animaux que l’effectif mis en place', async () => {
      const res = await complete(events[1].id, { animalCount: 900 }).expect(400);
      expect(res.body.message).toContain('900');
    });
  });

  // POUFA lot A2 sante: reference calendar at opening, reference steps kept,
  // postponement traced and still late, completion and manual treatment rules.
  describe('POUFA lot A2 — calendrier de référence et soins (n° 22-23)', () => {
    type Care = {
      id: string;
      name: string;
      status: string;
      careType: string;
      scheduledDate: string;
      originalDate: string | null;
      isReference: boolean;
      protocolStepId: string | null;
      productCode: string | null;
    };
    let referenceSteps: Array<{ id: string; dayFrom: number; name: string }>;

    const openBand = async (name: string, extra: object = {}) =>
      (
        await post(`/farms/${farmId}/batches`, {
          batchName: `${name} ${tag}`,
          type: 'CHAIR',
          integrationDate: day(0),
          quantityAtStart: 400,
          ...extra,
        }).expect(201)
      ).body.id as string;
    const calendar = async (band: string) =>
      (await get(`/farms/${farmId}/batches/${band}/prophylaxis`).expect(200)).body as Care[];
    const careUrl = (band: string, id: string) => `/farms/${farmId}/batches/${band}/prophylaxis/${id}`;

    beforeAll(async () => {
      const protocols = await get('/sanitary/protocols?species=POULET&type=CHAIR').expect(200);
      const reference = (protocols.body as Array<{ id: string; isDefault: boolean; farmId: string | null }>).find(
        (p) => p.isDefault && p.farmId === null,
      )!;
      const detail = await get(`/sanitary/protocols/${reference.id}`).expect(200);
      referenceSteps = (detail.body.steps as Array<{ id: string; dayFrom: number; name: string; active: boolean }>).filter(
        (s) => s.active,
      );
      expect(referenceSteps.length).toBeGreaterThan(1);
    });

    it('une bande ouverte à J0 reçoit d’office le calendrier de référence', async () => {
      const band = await openBand('Bande J0');
      const cares = await calendar(band);
      expect(cares).toHaveLength(referenceSteps.length);
      expect(cares.every((c) => c.isReference && c.status === 'PLANIFIE')).toBe(true);
      expect(new Set(cares.map((c) => c.protocolStepId))).toEqual(new Set(referenceSteps.map((s) => s.id)));
      // Generating again adds nothing.
      await post(`/farms/${farmId}/batches/${band}/prophylaxis/generate`, {}).expect(201);
      expect(await calendar(band)).toHaveLength(referenceSteps.length);
    });

    it('une bande en cours (J+x) : les étapes dont l’âge est passé ne sont pas planifiées', async () => {
      const age = Math.max(...referenceSteps.map((s) => s.dayFrom));
      const band = await openBand('Bande J+x', { initialAgeDays: age, quantityAlive: 400 });
      const cares = await calendar(band);
      const expected = referenceSteps.filter((s) => s.dayFrom >= age);
      expect(cares.map((c) => c.protocolStepId).sort()).toEqual(expected.map((s) => s.id).sort());
      expect(cares.every((c) => c.scheduledDate === day(0))).toBe(true);
    });

    it('la ferme ne peut ni annuler, ni supprimer, ni réécrire une étape de référence', async () => {
      const band = await openBand('Bande verrou');
      const [care] = await calendar(band);
      const cancel = await post(`${careUrl(band, care.id)}/cancel`, { reason: 'Pas de vaccin' }).expect(400);
      expect(cancel.body.message).toContain('calendrier de référence');
      const del = await request(server)
        .delete(`/farms/${farmId}/batches/${band}/vaccine-schedules/${care.id}`)
        .set(auth(ownerToken))
        .expect(400);
      expect(del.body.message).toContain('calendrier de référence');
      const rename = await patch(
        `/farms/${farmId}/batches/${band}/vaccine-schedules/${care.id}`,
        { name: 'Autre chose', careType: care.careType },
        ownerToken,
      ).expect(400);
      expect(rename.body.message).toContain('date (report) et les notes');
      // Its own extra care stays free.
      const [extra] = (
        await post(`/farms/${farmId}/vaccine-schedules/manual`, {
          lotIds: [band],
          careType: 'VACCIN',
          name: 'Rappel ND (ferme)',
          scheduledDate: day(2),
        }).expect(201)
      ).body as Care[];
      expect(extra.isReference).toBe(false);
      await post(`${careUrl(band, extra.id)}/cancel`, { reason: 'Doublon' }).expect(201);
      // The veterinary services (matrix SANITAIRE) may withdraw a step from a band.
      const vetCancel = await post(`${careUrl(band, care.id)}/cancel`, { reason: 'Rupture de vaccin' }, vetToken).expect(201);
      expect(vetCancel.body.status).toBe('ANNULE');
    });

    it('un report garde la date de référence et reste compté en retard', async () => {
      const band = await openBand('Bande report');
      const [care] = await calendar(band);
      // Time passes: the step was due five days ago.
      await ds.query(`UPDATE prophylaxis_events SET scheduled_date = $1 WHERE id = $2`, [day(-5), care.id]);
      const moved = await patch(careUrl(band, care.id), { scheduledDate: day(3) }, ownerToken).expect(200);
      expect(moved.body).toMatchObject({ scheduledDate: day(3), originalDate: day(-5) });
      const again = await patch(careUrl(band, care.id), { scheduledDate: day(4) }, ownerToken).expect(200);
      expect(again.body.originalDate).toBe(day(-5));
      const after = (await calendar(band)).find((c) => c.id === care.id)!;
      expect(after.status).toBe('EN_RETARD');
      const advisory = await get(`/farms/${farmId}/advisory/next-actions`).expect(200);
      const action = (
        advisory.body.actions as Array<{
          id: string;
          level: string;
          description: string;
          care?: { eventId: string; liveCount: number; isReference: boolean; originalDate: string | null };
        }>
      ).find((a) => a.id === `care:${care.id}`);
      expect(action?.level).toBe('ROUGE');
      expect(action?.description).toContain(dateFr(day(-5)));
      // The SOIN action carries what the « Fait » form needs.
      expect(action?.care).toMatchObject({ eventId: care.id, liveCount: 400, isReference: true, originalDate: day(-5) });
    });

    it('« Fait » : nombre d’animaux obligatoire ; un rejeu déjà enregistré passe', async () => {
      const band = await openBand('Bande fait');
      const [care] = await calendar(band);
      const missing = await post(`${careUrl(band, care.id)}/complete`, { completedAt: day(0) }).expect(400);
      expect(missing.body.message).toContain('nombre d');
      const key = `off-prophylaxis-complete-a2-${tag}`;
      await post(`${careUrl(band, care.id)}/complete`, { completedAt: day(0), animalCount: 400, idempotencyKey: key }).expect(201);
      // A replay queued without the count (older client) returns the care.
      const replay = await post(`${careUrl(band, care.id)}/complete`, { completedAt: day(0), idempotencyKey: key }).expect(201);
      expect(replay.body).toMatchObject({ id: care.id, status: 'FAIT', animalCount: 400 });
    });

    it('soin manuel avec délai d’attente : produit de la liste, motif et date de fin réels', async () => {
      const band = await openBand('Bande soin manuel');
      // List empty: the care's own name stands in for the product.
      const [free] = (
        await post(`/farms/${farmId}/vaccine-schedules/manual`, {
          lotIds: [band],
          careType: 'MEDICAMENT',
          name: 'Oxytétracycline (libre)',
          scheduledDate: day(0),
          withdrawalDays: 4,
        }).expect(201)
      ).body as Care[];
      const noReason = await post(`${careUrl(band, free.id)}/complete`, { animalCount: 380, endDate: day(0) }).expect(400);
      expect(noReason.body.message).toContain('motif');
      const noEnd = await post(`${careUrl(band, free.id)}/complete`, { animalCount: 380, reason: 'Coryza' }).expect(400);
      expect(noEnd.body.message).toContain('date de fin');
      await post(`${careUrl(band, free.id)}/complete`, {
        completedAt: day(0),
        animalCount: 380,
        reason: 'Coryza',
        endDate: day(2),
      }).expect(201);
      const records = (await get(`/farms/${farmId}/batches/${band}/treatments`).expect(200)).body as Array<{
        productName: string;
        productCode: string | null;
        reason: string;
        endDate: string;
        animalCount: number;
        withdrawalEndDate: string;
      }>;
      expect(records.find((t) => t.productName === 'Oxytétracycline (libre)')).toMatchObject({
        productCode: null,
        reason: 'Coryza',
        endDate: day(2),
        animalCount: 380,
        withdrawalEndDate: day(6),
      });

      // List filled by the vets: the product must come from it.
      const code = `E2E_DOXY_${tag}`;
      await post('/surveillance/lists/PRODUIT_TRAITEMENT', { code, label: `Doxycycline ${tag}` }, vetToken).expect(201);
      try {
        const refused = await post(`/farms/${farmId}/vaccine-schedules/manual`, {
          lotIds: [band],
          careType: 'MEDICAMENT',
          name: 'Produit libre',
          scheduledDate: day(1),
          withdrawalDays: 3,
        }).expect(400);
        expect(refused.body.message).toContain('PRODUIT_TRAITEMENT');
        const [listed] = (
          await post(`/farms/${farmId}/vaccine-schedules/manual`, {
            lotIds: [band],
            careType: 'MEDICAMENT',
            name: 'ignoré',
            productCode: code,
            scheduledDate: day(0),
            withdrawalDays: 3,
          }).expect(201)
        ).body as Care[];
        expect(listed).toMatchObject({ productCode: code, name: `Doxycycline ${tag}` });
        await post(`${careUrl(band, listed.id)}/complete`, {
          completedAt: day(0),
          animalCount: 380,
          reason: 'Colibacillose',
          endDate: day(1),
        }).expect(201);
        const after = (await get(`/farms/${farmId}/batches/${band}/treatments`).expect(200)).body as Array<{
          productCode: string | null;
          productName: string;
          reason: string;
        }>;
        expect(after.find((t) => t.productCode === code)).toMatchObject({
          productName: `Doxycycline ${tag}`,
          reason: 'Colibacillose',
        });
      } finally {
        await patch(`/surveillance/lists/PRODUIT_TRAITEMENT/${code}`, { active: false }, vetToken);
      }
    });
  });
});
