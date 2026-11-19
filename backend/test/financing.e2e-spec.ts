// Financer workspace (BCEG): files, steps, documents, tranches, schedule,
// repayments, consent (bank and farmer side), perimeter and Farm 360.
//
// The perimeter parameter FINANCEMENT_PERIMETRE is programme-wide and shared
// by every spec: the scenarios that change it restore PROGRAMME in a finally.
process.env.INSTITUTION_OTP = 'off';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { NotifyService } from './../src/modules/notify/notify.service.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  uniquePhone,
} from './helpers/programme-farm.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const ALL_CLAUSES = [
  'IDENTITE_RESPONSABLE',
  'FINALITE',
  'CATEGORIES_DONNEES',
  'DESTINATAIRES',
  'DUREE_CONSERVATION',
  'DROITS',
  'RETRAIT',
  'RECLAMATION_APDPVP',
  'DISTINCT_DU_CONTRAT',
  'TRANSFERT_HORS_GABON',
];

describe('Espace financeur (BCEG) — e2e', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let bceg: string;
  let dge: string;
  let farm: { farmId: string; farmCode: string; ownerToken: string };
  let farm2: { farmId: string; farmCode: string; ownerToken: string };
  let fileId: string;
  let notify: NotifyService;
  const digits = String(Date.now()).slice(-7);

  const get = (url: string, token: string) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token: string) =>
    request(server).post(url).set(auth(token)).send(body);
  const patch = (url: string, body: object, token: string) =>
    request(server).patch(url).set(auth(token)).send(body);
  const F = '/programme/financing';

  async function institution(profileCode: string): Promise<string> {
    const p = uniquePhone();
    const res = await post(
      '/programme/access/memberships',
      { fullName: `Agent ${profileCode} ${digits}`, phone: p, profileCode },
      adminToken,
    ).expect(201);
    return login(server, p, res.body.loginCode);
  }

  /** Files every missing required document of the file's current step. */
  async function fulfil(): Promise<void> {
    const file = (await get(`${F}/files/${fileId}`, bceg).expect(200)).body;
    for (const line of file.checklist as Array<{
      requirement: { id: string; step: string; required: boolean; active: boolean };
      state: string;
    }>) {
      if (
        line.requirement.step === file.step &&
        line.requirement.required &&
        line.requirement.active &&
        line.state === 'MANQUANTE'
      ) {
        await request(server)
          .post(`${F}/files/${fileId}/documents`)
          .set(auth(bceg))
          .field('requirementId', line.requirement.id)
          .attach('file', PDF, {
            filename: `piece-${line.requirement.id}.pdf`,
            contentType: 'application/pdf',
          })
          .expect(201);
      }
    }
  }

  async function setPerimeter(value: string): Promise<void> {
    await post(
      '/programme/parameters/FINANCEMENT_PERIMETRE',
      { value, reason: `Essai e2e financement ${digits}` },
      adminToken,
    ).expect(201);
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
    notify = app.get(NotifyService);
    adminToken = (await createPlatformAdmin(server, ds)).token;
    farm = await createProgrammeFarm(server, adminToken, { provinceCode: 'G2' });
    farm2 = await createProgrammeFarm(server, adminToken, { provinceCode: 'G1' });
    bceg = await institution('BCEG');
    dge = await institution('DGE');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('droits et sélecteur de fermes', () => {
    it('BCEG et DGE lisent, seule la BCEG écrit ; la ferme n’y a pas accès', async () => {
      await get(`${F}/portfolio`, bceg).expect(200);
      await get(`${F}/portfolio`, dge).expect(200);
      await get(`${F}/portfolio`, farm.ownerToken).expect(403);
      await post(`${F}/files`, { farmId: farm.farmId, purpose: 'x' }, dge).expect(
        403,
      );
    });

    it('le sélecteur renvoie l’identification de toutes les fermes (20 max)', async () => {
      const res = await get(
        `${F}/farms?q=${encodeURIComponent(farm.farmCode)}`,
        bceg,
      ).expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toEqual({
        id: farm.farmId,
        code: farm.farmCode,
        name: expect.any(String),
        provinceName: expect.any(String),
        exploitantName: expect.any(String),
      });
      expect(
        (await get(`${F}/farms`, bceg).expect(200)).body.length,
      ).toBeLessThanOrEqual(20);
      await get(`${F}/farms`, farm.ownerToken).expect(403);
    });
  });

  describe('modèle de consentement et consentement', () => {
    it('refuse un modèle incomplet, accepte un modèle complet (versionné)', async () => {
      const send = (clauses: string[]) =>
        request(server)
          .post(`${F}/consent-templates`)
          .set(auth(bceg))
          .field('title', 'Consentement BCEG')
          .field('purpose', 'Instruction des demandes de financement')
          .field('dataCategories', JSON.stringify(['Production', 'Ventes']))
          .field('retention', '5 ans après la clôture du dossier')
          .field('confirmedClauses', JSON.stringify(clauses))
          .attach('file', PDF, { filename: 'modele.pdf', contentType: 'application/pdf' });
      const bad = await send(ALL_CLAUSES.slice(1)).expect(400);
      expect(bad.body.message).toContain('mentions obligatoires');
      const ok = await send(ALL_CLAUSES).expect(201);
      expect(ok.body.active).toBe(true);
      const second = await send(ALL_CLAUSES).expect(201);
      expect(second.body.version).toBe(ok.body.version + 1);
      const view = (await get(`${F}/consent-templates`, bceg).expect(200)).body;
      expect(
        view.templates.filter((t: { active: boolean }) => t.active),
      ).toHaveLength(1);
      // Only the validator role files a template.
      await request(server)
        .post(`${F}/consent-templates`)
        .set(auth(dge))
        .attach('file', PDF, { filename: 'm.pdf', contentType: 'application/pdf' })
        .expect(403);
    });

    it('la ferme donne puis retire son consentement en ligne', async () => {
      const mine = `/farms/${farm.farmId}/financing`;
      const view = (await get(mine, farm.ownerToken).expect(200)).body;
      expect(view.canConsent).toBe(true);
      expect(view.consent).toBeNull();
      expect(view.recipient).toBe('BCEG');
      await post(
        `${mine}/consent`,
        { templateId: view.template.id, signerName: 'Exploitant E2E', accepted: false },
        farm.ownerToken,
      ).expect(400);
      const given = await post(
        `${mine}/consent`,
        { templateId: view.template.id, signerName: 'Exploitant E2E', accepted: true },
        farm.ownerToken,
      ).expect(201);
      expect(given.body.consent.status).toBe('ACTIF');
      // A second consent while one is active is refused.
      await post(
        `${mine}/consent`,
        { templateId: view.template.id, signerName: 'Exploitant E2E', accepted: true },
        farm.ownerToken,
      ).expect(409);
      // The bank sees it, with the farm code as search key.
      const list = await get(
        `${F}/consents?q=${encodeURIComponent(farm.farmCode)}`,
        bceg,
      ).expect(200);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0].status).toBe('ACTIF');
      // Another farm's owner cannot touch it.
      await get(mine, farm2.ownerToken).expect(403);
      const withdrawn = await post(
        `${mine}/consent/withdraw`,
        { reason: 'Je change de banque' },
        farm.ownerToken,
      ).expect(201);
      expect(withdrawn.body.consent.status).toBe('RETIRE');
      await post(`${mine}/consent/withdraw`, {}, farm.ownerToken).expect(409);
    });

    it('la banque enregistre un consentement papier (scan obligatoire)', async () => {
      const url = `${F}/farms/${farm.farmId}/consent`;
      await request(server)
        .post(url)
        .set(auth(bceg))
        .field('signerName', 'Exploitant E2E')
        .field('grantedOn', day(-1))
        .expect(400);
      await request(server)
        .post(url)
        .set(auth(bceg))
        .field('signerName', 'Exploitant E2E')
        .field('grantedOn', day(-1))
        .attach('file', PDF, { filename: 'signe.pdf', contentType: 'application/pdf' })
        .expect(201);
      const proof = await get(`${url}/proof`, bceg).expect(200);
      expect(proof.headers['content-type']).toContain('application/pdf');
    });
  });

  describe('dossier de financement', () => {
    it('ouvre un dossier et refuse un dossier sans objet', async () => {
      await post(`${F}/files`, { farmId: farm.farmId }, bceg).expect(400);
      const res = await post(
        `${F}/files`,
        { farmId: farm.farmId, purpose: 'Achat de poussins et d’aliment', requestedFcfa: 1_200_000 },
        bceg,
      ).expect(201);
      fileId = res.body.id;
      expect(res.body.reference).toMatch(/^BCEG-\d{4}-\d{4}$/);
      expect(res.body.step).toBe('DEMANDE');
      expect(res.body.rights).toMatchObject({ read: true, create: true, validate: true });
    });

    it('bloque le passage d’étape tant que les pièces obligatoires manquent', async () => {
      const blocked = await post(`${F}/files/${fileId}/step`, { to: 'INSTRUCTION' }, bceg).expect(409);
      expect(blocked.body.message).toBeTruthy();
      await fulfil();
      await post(`${F}/files/${fileId}/step`, { to: 'DECISION' }, bceg).expect(400);
      const ok = await post(`${F}/files/${fileId}/step`, { to: 'INSTRUCTION' }, bceg).expect(201);
      expect(ok.body.step).toBe('INSTRUCTION');
      expect(ok.body.history.length).toBeGreaterThanOrEqual(1);
    });

    it('ajourne puis accorde ; la décision exige les conditions', async () => {
      await fulfil();
      await post(`${F}/files/${fileId}/step`, { to: 'DECISION' }, bceg).expect(201);
      await post(`${F}/files/${fileId}/step`, { to: 'DECAISSEMENT' }, bceg).expect(400);
      const adjourned = await post(
        `${F}/files/${fileId}/step`,
        { to: 'DECISION', decision: 'AJOURNE', note: 'Pièces complémentaires' },
        bceg,
      ).expect(201);
      expect(adjourned.body.step).toBe('DECISION');
      expect(adjourned.body.history.some((h: { decision: string }) => h.decision === 'AJOURNE')).toBe(true);
      await fulfil();
      // Granted without an amount: refused.
      await post(
        `${F}/files/${fileId}/step`,
        { to: 'DECAISSEMENT', decision: 'ACCORDE' },
        bceg,
      ).expect(400);
      await patch(
        `${F}/files/${fileId}`,
        { grantedFcfa: 1_200_000, ratePct: 12, durationMonths: 12, graceMonths: 0, periodicity: 'MENSUELLE' },
        bceg,
      ).expect(200);
      const granted = await post(
        `${F}/files/${fileId}/step`,
        { to: 'DECAISSEMENT', decision: 'ACCORDE' },
        bceg,
      ).expect(201);
      expect(granted.body.step).toBe('DECAISSEMENT');
      expect(granted.body.decision).toBe('ACCORDE');
    });

    it('prévoit et débloque une tranche (visite d’une autre ferme refusée)', async () => {
      await fulfil();
      const added = await post(
        `${F}/files/${fileId}/disbursements`,
        { amountFcfa: 1_200_000, plannedDate: day(-100) },
        bceg,
      ).expect(201);
      const did = added.body.disbursements[0].id;
      await post(
        `${F}/files/${fileId}/disbursements/${did}/release`,
        { releasedOn: day(-100), visitId: '00000000-0000-4000-8000-0000000000aa' },
        bceg,
      )
        .expect(400)
        .expect((r) => expect(r.body.message).toContain('visite'));
      const released = await post(
        `${F}/files/${fileId}/disbursements/${did}/release`,
        { releasedOn: day(-100) },
        bceg,
      ).expect(201);
      expect(released.body.amounts.disbursedFcfa).toBe(1_200_000);
    });

    it('génère l’échéancier à annuités constantes, en entiers FCFA', async () => {
      const res = await post(
        `${F}/files/${fileId}/schedule`,
        { firstDueDate: day(-70) },
        bceg,
      ).expect(201);
      const inst = res.body.instalments as Array<{ principalFcfa: number; interestFcfa: number; dueFcfa: number }>;
      expect(inst).toHaveLength(12);
      expect(inst.every((i) => Number.isInteger(i.dueFcfa))).toBe(true);
      expect(inst.reduce((s, i) => s + i.principalFcfa, 0)).toBe(1_200_000);
      expect(res.body.claimClass).not.toBe('SAIN'); // first instalment 70 days late
      expect(res.body.daysLate).toBeGreaterThan(0);
      // A second generation is refused while an instalment has been paid.
    });

    it('enregistre un remboursement, l’annule avec motif, jamais supprimé', async () => {
      const first = (await get(`${F}/files/${fileId}`, bceg).expect(200)).body.instalments[0];
      const paid = await post(
        `${F}/files/${fileId}/repayments`,
        { paidOn: day(-1), amountFcfa: first.dueFcfa, method: 'VIREMENT', reference: 'VIR-1' },
        bceg,
      ).expect(201);
      expect(paid.body.amounts.repaidFcfa).toBe(first.dueFcfa);
      const rid = paid.body.repayments[0].id;
      await post(`${F}/files/${fileId}/repayments/${rid}/cancel`, {}, bceg).expect(400);
      const cancelled = await post(
        `${F}/files/${fileId}/repayments/${rid}/cancel`,
        { reason: 'Saisie en double' },
        bceg,
      ).expect(201);
      expect(cancelled.body.amounts.repaidFcfa).toBe(0);
      expect(cancelled.body.repayments).toHaveLength(1);
      // Re-record it: kept.
      await post(
        `${F}/files/${fileId}/repayments`,
        { paidOn: day(-1), amountFcfa: first.dueFcfa, method: 'VIREMENT' },
        bceg,
      ).expect(201);
    });

    it('liste, filtre par province (code) et classe, exporte en Excel', async () => {
      const all = (await get(`${F}/files?q=${encodeURIComponent(farm.farmCode)}`, bceg).expect(200)).body;
      expect(all.total).toBe(1);
      const portfolio = (await get(`${F}/portfolio`, bceg).expect(200)).body;
      expect(portfolio.totals.files).toBeGreaterThanOrEqual(1);
      const bucket = portfolio.byProvince.find((b: { key: string }) => b.key === 'G2');
      expect(bucket).toBeTruthy();
      const byProvince = await get(`${F}/files?province=G2&q=${encodeURIComponent(farm.farmCode)}`, bceg).expect(200);
      expect(byProvince.body.total).toBe(1);
      const other = await get(`${F}/files?province=G1&q=${encodeURIComponent(farm.farmCode)}`, bceg).expect(200);
      expect(other.body.total).toBe(0);
      const xlsx = await get(`${F}/portfolio/export`, bceg).expect(200);
      expect(xlsx.headers['content-type']).toContain('spreadsheetml');
      expect(xlsx.headers['content-disposition']).toContain('.xlsx');
    });

    it('gère la liste de pièces (code généré, jamais supprimée)', async () => {
      const created = await post(
        `${F}/requirements`,
        { label: `Pièce e2e ${digits}`, step: 'SUIVI', required: false, legalBasis: null, help: null, active: true },
        bceg,
      ).expect(201);
      expect(created.body.code).toMatch(/^SUIVI_/);
      const off = await patch(`${F}/requirements/${created.body.id}`, { active: false }, bceg).expect(200);
      expect(off.body.active).toBe(false);
    });
  });

  describe('ferme à 360° et périmètre', () => {
    it('lit la ferme à 360° par la matrice', async () => {
      const res = await get(`${F}/farms/${farm.farmId}/overview`, bceg).expect(200);
      expect(res.body.farm.code).toBe(farm.farmCode);
      expect(res.body.production).not.toBeNull();
      expect(res.body.economics).not.toBeNull();
      expect(res.body.financing.files).toHaveLength(1);
      expect(res.body.financing.consent.status).toBe('ACTIF');
      await get(`${F}/farms/${farm.farmId}/overview`, farm.ownerToken).expect(403);
    });

    it('CONSENTEMENT : seules les fermes avec un consentement actif sont lues', async () => {
      try {
        await setPerimeter('CONSENTEMENT');
        await get(`${F}/farms/${farm.farmId}/overview`, bceg).expect(200);
        await get(`${F}/farms/${farm2.farmId}/overview`, bceg).expect(403);
        const mine = (await get('/farms', bceg).expect(200)).body.map((f: { id: string }) => f.id);
        expect(mine).toContain(farm.farmId);
        expect(mine).not.toContain(farm2.farmId);
        // The file routes still reach every farm: the bank opens a file first.
        await post(`${F}/files`, { farmId: farm2.farmId, purpose: 'Premier contact' }, bceg).expect(201);
        // The picker is not bound to the perimeter either.
        const pick = await get(`${F}/farms?q=${encodeURIComponent(farm2.farmCode)}`, bceg).expect(200);
        expect(pick.body[0].id).toBe(farm2.farmId);
        // Withdrawal is immediate.
        await post(`${F}/farms/${farm.farmId}/consent/withdraw`, { reason: 'Demande de l’exploitant' }, bceg).expect(201);
        await get(`${F}/farms/${farm.farmId}/overview`, bceg).expect(403);
      } finally {
        await setPerimeter('PROGRAMME');
      }
    });

    it('DOSSIERS : les fermes qui ont un dossier', async () => {
      try {
        await setPerimeter('DOSSIERS');
        await get(`${F}/farms/${farm2.farmId}/overview`, bceg).expect(200);
        const farm3 = await createProgrammeFarm(server, adminToken, { provinceCode: 'G3' });
        await get(`${F}/farms/${farm3.farmId}/overview`, bceg).expect(403);
      } finally {
        await setPerimeter('PROGRAMME');
      }
    });

    it('refuse une valeur de périmètre inconnue', async () => {
      await post(
        '/programme/parameters/FINANCEMENT_PERIMETRE',
        { value: 'TOUT', reason: 'Essai' },
        adminToken,
      ).expect(400);
    });
  });

  describe('pièces de l’exploitation, configuration et notifications', () => {
    let fz: { farmId: string; farmCode: string; ownerToken: string };
    let other: { farmId: string; farmCode: string; ownerToken: string };
    let zFile: string;
    let otherFile: string;
    let agent: string;
    let formReq: string; // DEMANDE_FORMULAIRE
    let pdfOnly: { id: string };
    let expiring: { id: string };
    let committeeReq: string; // BCEG-side requirement
    const PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    const pdfOf = (n: string) => Buffer.from(`%PDF-1.4 ${n} ${digits}\n%%EOF\n`);
    const farmView = (token: string, farmId = fz.farmId) => get(`/farms/${farmId}/financing`, token);
    const upload = (token: string, farmId: string, id: string, fields: Record<string, string>, buf: Buffer, mime = 'application/pdf', name = 'piece.pdf') => {
      let r = request(server).post(`/farms/${farmId}/financing/files/${id}/documents`).set(auth(token));
      for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
      return r.attach('file', buf, { filename: name, contentType: mime });
    };
    const bankUpload = (id: string, fields: Record<string, string>, buf: Buffer) => {
      let r = request(server).post(`${F}/files/${id}/documents`).set(auth(bceg));
      for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
      return r.attach('file', buf, { filename: 'interne.pdf', contentType: 'application/pdf' });
    };
    const line = (view: { body: any }, requirementId: string) =>
      view.body.files[0].checklist.find((l: { requirementId: string }) => l.requirementId === requirementId);
    async function inbox(token: string, event: string) {
      await notify.flush();
      const box = (await get('/notifications?limit=200', token).expect(200)).body as {
        items: Array<{ event: string; title: string; body: string }>;
      };
      return box.items.filter((n) => n.event === event);
    }

    beforeAll(async () => {
      fz = await createProgrammeFarm(server, adminToken, { provinceCode: 'G2' });
      other = await createProgrammeFarm(server, adminToken, { provinceCode: 'G3' });
      zFile = (await post(`${F}/files`, { farmId: fz.farmId, purpose: 'Pièces de l’exploitation' }, bceg).expect(201)).body.id;
      otherFile = (await post(`${F}/files`, { farmId: other.farmId, purpose: 'Autre ferme' }, bceg).expect(201)).body.id;
      const reqs = (await get(`${F}/requirements`, bceg).expect(200)).body as Array<{
        id: string; code: string; providedBy: string; validityMonths: number | null; templateFileName: string | null;
      }>;
      formReq = reqs.find((r) => r.code === 'DEMANDE_FORMULAIRE')!.id;
      committeeReq = reqs.find((r) => r.code === 'DECISION_FICHE_COMITE')!.id;
      const seeded = (code: string) => reqs.find((r) => r.code === code)!;
      expect(seeded('DEMANDE_FORMULAIRE').providedBy).toBe('EXPLOITANT');
      expect(seeded('DEMANDE_IDENTITE').providedBy).toBe('EXPLOITANT');
      expect(seeded('DECISION_FICHE_COMITE').providedBy).toBe('BCEG');
      expect(seeded('DEMANDE_CONSENTEMENT').providedBy).toBe('BCEG');
      expect(seeded('DECAISSEMENT_ASSURANCE').providedBy).toBe('EXPLOITANT');
      expect(seeded('DECAISSEMENT_ASSURANCE').validityMonths).toBe(12);
      pdfOnly = (
        await post(
          `${F}/requirements`,
          { label: `Pièce PDF seulement ${digits}`, step: 'DEMANDE', required: false, providedBy: 'EXPLOITANT', formats: ['PDF'] },
          bceg,
        ).expect(201)
      ).body;
      expiring = (
        await post(
          `${F}/requirements`,
          { label: `Pièce à validité courte ${digits}`, step: 'DEMANDE', required: true, providedBy: 'EXPLOITANT', validityMonths: 1 },
          bceg,
        ).expect(201)
      ).body;
      agent = await (async () => {
        const p = uniquePhone();
        const res = await post(
          '/programme/access/memberships',
          { fullName: `Agent technique ${digits}`, phone: p, profileCode: 'AGENT_TECHNIQUE', farmIds: [fz.farmId] },
          adminToken,
        ).expect(201);
        return login(server, p, res.body.loginCode);
      })();
    });

    afterAll(async () => {
      // Leave the shared checklist as found.
      for (const r of [pdfOnly, expiring]) {
        if (r) await patch(`${F}/requirements/${r.id}`, { active: false }, bceg);
      }
    });

    it('la configuration de l’exigence est lue et modifiée (formats, validité, fournisseur)', async () => {
      const got = (await get(`${F}/requirements`, bceg).expect(200)).body.find((r: { id: string }) => r.id === pdfOnly.id);
      expect(got).toMatchObject({ providedBy: 'EXPLOITANT', formats: ['PDF'], validityMonths: null, templateFileName: null });
      const patched = await patch(`${F}/requirements/${pdfOnly.id}`, { validityMonths: 3, formats: ['PDF', 'IMAGE'] }, bceg).expect(200);
      expect(patched.body).toMatchObject({ validityMonths: 3, formats: ['PDF', 'IMAGE'] });
      await patch(`${F}/requirements/${pdfOnly.id}`, { validityMonths: null, formats: ['PDF'] }, bceg).expect(200);
      await patch(`${F}/requirements/${pdfOnly.id}`, { formats: ['DOC'] }, bceg).expect(400);
      await patch(`${F}/requirements/${pdfOnly.id}`, { providedBy: 'X' }, bceg).expect(400);
    });

    it('le formulaire vierge se joint, se télécharge côté ferme, se retire', async () => {
      const url = `${F}/requirements/${formReq}/template`;
      await request(server).post(url).set(auth(bceg)).attach('file', pdfOf('form'), { filename: 'demande.pdf', contentType: 'application/pdf' }).expect(201)
        .expect((r) => expect(r.body.templateFileName).toBe('demande.pdf'));
      await request(server).post(url).set(auth(bceg)).attach('file', Buffer.from('x'), { filename: 'x.exe', contentType: 'application/x-msdownload' }).expect(400);
      expect((await get(url, bceg).expect(200)).headers['content-type']).toContain('application/pdf');
      const farmSide = await get(`/farms/${fz.farmId}/financing/requirements/${formReq}/template`, fz.ownerToken).expect(200);
      expect(farmSide.headers['content-type']).toContain('application/pdf');
      // A bank-side item has no form for the farm.
      await get(`/farms/${fz.farmId}/financing/requirements/${committeeReq}/template`, fz.ownerToken).expect(404);
      expect((await farmView(fz.ownerToken)).body.files[0].checklist.find((l: { requirementId: string }) => l.requirementId === formReq).templateFileName).toBe('demande.pdf');
      await request(server).delete(url).set(auth(bceg)).expect(200).expect((r) => expect(r.body.templateFileName).toBeNull());
      await get(url, bceg).expect(404);
      await request(server).post(url).set(auth(dge)).attach('file', pdfOf('x'), { filename: 'x.pdf', contentType: 'application/pdf' }).expect(403);
    });

    it('la liste de l’exploitant ne montre que ses pièces, jamais celles de la banque', async () => {
      const view = await farmView(fz.ownerToken).expect(200);
      expect(view.body.canFile).toBe(true);
      const f = view.body.files[0];
      const ids = f.checklist.map((l: { requirementId: string }) => l.requirementId);
      expect(ids).toContain(formReq);
      expect(ids).not.toContain(committeeReq);
      expect(f.checklist.every((l: { step: string; label: string }) => !l.label.includes('comité'))).toBe(true);
      expect(f.toFile).toBeGreaterThan(0);
      // The bank's profile is not the farmer side.
      await farmView(bceg).expect(403);
      await farmView(dge).expect(403);
    });

    it('l’exploitant dépose une pièce : la banque est prévenue, le format est contrôlé', async () => {
      await upload(fz.ownerToken, fz.farmId, zFile, { requirementId: pdfOnly.id }, PNG, 'image/png', 'scan.png')
        .expect(400)
        .expect((r) => expect(r.body.message).toContain('Format non accepté'));
      // A BCEG-side requirement is not his to fill.
      await upload(fz.ownerToken, fz.farmId, zFile, { requirementId: committeeReq }, pdfOf('c')).expect(400);
      const filed = await upload(fz.ownerToken, fz.farmId, zFile, { requirementId: formReq, issuedOn: day(-2) }, pdfOf('form1')).expect(201);
      const l = line(filed, formReq);
      expect(l.state).toBe('DEPOSEE');
      expect(l.documents[0].source).toBe('EXPLOITANT');
      // Another farm's owner cannot file on this farm.
      await upload(other.ownerToken, fz.farmId, zFile, { requirementId: formReq }, pdfOf('form2')).expect(403);
      // The file of another farm is not reachable through this farm.
      await upload(fz.ownerToken, fz.farmId, otherFile, { requirementId: formReq }, pdfOf('form3')).expect(404);
      const notes = await inbox(bceg, 'FINANCING_DOCUMENT_FILED');
      expect(notes.some((n) => n.body.includes('Dossier') || n.body.includes('dossier'))).toBe(true);
      const detail = (await get(`${F}/files/${zFile}`, bceg).expect(200)).body;
      const doc = detail.checklist.find((c: { requirement: { id: string } }) => c.requirement.id === formReq).documents[0];
      expect(doc).toMatchObject({ source: 'EXPLOITANT', issuedOn: day(-2), expired: false });
    });

    it('le rejet puis la validation préviennent l’exploitation, qui redépose ; le validé se verrouille', async () => {
      const detail = (await get(`${F}/files/${zFile}`, bceg).expect(200)).body;
      const doc = detail.checklist.find((c: { requirement: { id: string } }) => c.requirement.id === formReq).documents[0];
      await post(`${F}/files/${zFile}/documents/${doc.id}/review`, { status: 'REJETE', reason: 'Illisible, scannez de nouveau' }, bceg).expect(201);
      const rejected = await inbox(fz.ownerToken, 'FINANCING_DOCUMENT_REVIEWED');
      expect(rejected.some((n) => n.body.includes('a été refusée : Illisible, scannez de nouveau') && n.body.includes('Déposez-la de nouveau'))).toBe(true);
      const afterReject = await farmView(fz.ownerToken).expect(200);
      expect(line(afterReject, formReq)).toMatchObject({ state: 'REJETEE', rejectReason: 'Illisible, scannez de nouveau', canFile: true });
      const again = await upload(fz.ownerToken, fz.farmId, zFile, { requirementId: formReq }, pdfOf('form-bis')).expect(201);
      expect(line(again, formReq).state).toBe('DEPOSEE');
      const second = (await get(`${F}/files/${zFile}`, bceg).expect(200)).body.checklist
        .find((c: { requirement: { id: string } }) => c.requirement.id === formReq).documents.at(-1);
      await post(`${F}/files/${zFile}/documents/${second.id}/review`, { status: 'VALIDE' }, bceg).expect(201);
      expect((await inbox(fz.ownerToken, 'FINANCING_DOCUMENT_REVIEWED')).some((n) => n.body.includes('a été validée'))).toBe(true);
      const validated = await farmView(fz.ownerToken).expect(200);
      expect(line(validated, formReq)).toMatchObject({ state: 'VALIDEE', canFile: false });
      await upload(fz.ownerToken, fz.farmId, zFile, { requirementId: formReq }, pdfOf('form-ter')).expect(409);
    });

    it('l’exploitant ne télécharge que ses pièces, jamais celles de la banque', async () => {
      const own = line(await farmView(fz.ownerToken).expect(200), formReq).documents[0];
      const got = await get(`/farms/${fz.farmId}/financing/files/${zFile}/documents/${own.id}/file`, fz.ownerToken).expect(200);
      expect(got.headers['content-type']).toContain('application/pdf');
      const internal = await bankUpload(zFile, { requirementId: committeeReq }, pdfOf('comite')).expect(201);
      const internalDoc = internal.body.checklist.find((c: { requirement: { id: string } }) => c.requirement.id === committeeReq).documents[0];
      expect(internalDoc.source).toBe('BCEG');
      await get(`/farms/${fz.farmId}/financing/files/${zFile}/documents/${internalDoc.id}/file`, fz.ownerToken).expect(404);
      await get(`/farms/${other.farmId}/financing/files/${zFile}/documents/${own.id}/file`, fz.ownerToken).expect(403);
    });

    it('une pièce périmée compte comme manquante (EXPIREE) et bloque l’étape', async () => {
      const filed = await upload(fz.ownerToken, fz.farmId, zFile, { requirementId: expiring.id, issuedOn: day(-90) }, pdfOf('vieux')).expect(201);
      const l = line(filed, expiring.id);
      expect(l.state).toBe('EXPIREE');
      expect(l.canFile).toBe(true);
      const detail = (await get(`${F}/files/${zFile}`, bceg).expect(200)).body;
      const c = detail.checklist.find((x: { requirement: { id: string } }) => x.requirement.id === expiring.id);
      expect(c.state).toBe('EXPIREE');
      expect(c.documents[0]).toMatchObject({ expired: true });
      expect(c.documents[0].expiresOn < day(0)).toBe(true);
      expect(detail.blockers).toContain(c.requirement.label);
      // A fresh one satisfies it.
      const fresh = await upload(fz.ownerToken, fz.farmId, zFile, { requirementId: expiring.id, issuedOn: day(-1) }, pdfOf('frais')).expect(201);
      expect(line(fresh, expiring.id).state).toBe('DEPOSEE');
      await upload(fz.ownerToken, fz.farmId, zFile, { requirementId: expiring.id, issuedOn: day(5) }, pdfOf('futur')).expect(400);
    });

    it('le consentement actif satisfait seul l’exigence de consentement ; le retrait la rouvre et prévient la banque', async () => {
      const consentLine = async () =>
        (await get(`${F}/files/${zFile}`, bceg).expect(200)).body.checklist.find(
          (c: { requirement: { code: string } }) => c.requirement.code === 'DEMANDE_CONSENTEMENT',
        );
      const before = await consentLine();
      expect(before.state).toBe('MANQUANTE');
      const tpl = (await farmView(fz.ownerToken).expect(200)).body.template;
      await post(
        `/farms/${fz.farmId}/financing/consent`,
        { templateId: tpl.id, signerName: 'Exploitant', accepted: true },
        fz.ownerToken,
      ).expect(201);
      const active = await consentLine();
      expect(active.state).toBe('VALIDEE');
      expect(active.documents).toHaveLength(0);
      await post(`/farms/${fz.farmId}/financing/consent/withdraw`, { reason: 'Test' }, fz.ownerToken).expect(201);
      expect((await consentLine()).state).toBe('MANQUANTE');
      expect((await inbox(bceg, 'CONSENT_WITHDRAWN')).some((n) => n.title.includes('Consentement retiré'))).toBe(true);
    });

    it('le changement d’étape arrive dans la boîte de l’exploitant', async () => {
      const fresh = (await post(`${F}/files`, { farmId: other.farmId, purpose: 'Notification d’étape' }, bceg).expect(201)).body.id;
      // Fulfil the DEMANDE step through the API, as the bank would.
      const detail = (await get(`${F}/files/${fresh}`, bceg).expect(200)).body;
      for (const c of detail.checklist as Array<{ requirement: { id: string; step: string; required: boolean; active: boolean }; state: string }>) {
        if (c.requirement.step === 'DEMANDE' && c.requirement.required && c.requirement.active && c.state === 'MANQUANTE') {
          await bankUpload(fresh, { requirementId: c.requirement.id }, pdfOf(`d-${c.requirement.id}`)).expect(201);
        }
      }
      await post(`${F}/files/${fresh}/step`, { to: 'INSTRUCTION' }, bceg).expect(201);
      const notes = await inbox(other.ownerToken, 'FINANCING_STEP_CHANGED');
      expect(notes.some((n) => n.body.includes('Instruction'))).toBe(true);
    });

    it('un agent technique dépose pour l’exploitant (source AGENT, nom conservé), dans son périmètre seulement', async () => {
      const view = await farmView(agent).expect(200);
      expect(view.body.canFile).toBe(true);
      expect(view.body.canConsent).toBe(false);
      const filed = await upload(agent, fz.farmId, zFile, { requirementId: pdfOnly.id }, pdfOf('par-agent')).expect(201);
      expect(line(filed, pdfOnly.id).documents[0].source).toBe('AGENT');
      const detail = (await get(`${F}/files/${zFile}`, bceg).expect(200)).body;
      const doc = detail.checklist.find((c: { requirement: { id: string } }) => c.requirement.id === pdfOnly.id).documents[0];
      expect(doc.source).toBe('AGENT');
      expect(doc.uploadedByName).toContain('Agent technique');
      // The agent never consents for the farmer, nor reaches another farm.
      await post(`/farms/${fz.farmId}/financing/consent`, { templateId: '00000000-0000-4000-8000-000000000000', signerName: 'x', accepted: true }, agent).expect(403);
      await farmView(agent, other.farmId).expect(403);
      await get(`${F}/portfolio`, agent).expect(403);
    });

    it('un profil à périmètre FERMES avec FINANCEMENT ne travaille que sur les fermes de son périmètre', async () => {
      const code = `FER${digits}`;
      await post(
        '/programme/access/profiles',
        { code, label: `Délégué fermes ${digits}`, scopeKind: 'FARMS', matrix: { FINANCEMENT: ['CONSULTER', 'CREER', 'MODIFIER'], REGISTRE: ['CONSULTER'] } },
        adminToken,
      ).expect(201);
      const p = uniquePhone();
      const m = await post(
        '/programme/access/memberships',
        { fullName: `Délégué ${digits}`, phone: p, profileCode: code, farmIds: [fz.farmId] },
        adminToken,
      ).expect(201);
      const limited = await login(server, p, m.body.loginCode);
      const own = await get(`${F}/files?pageSize=200`, limited).expect(200);
      expect(own.body.items.length).toBeGreaterThan(0);
      expect(own.body.items.every((i: { farmId: string }) => i.farmId === fz.farmId)).toBe(true);
      await get(`${F}/files/${zFile}`, limited).expect(200);
      await get(`${F}/files/${otherFile}`, limited).expect(403);
      await post(`${F}/files`, { farmId: other.farmId, purpose: 'Hors périmètre' }, limited).expect(403);
      await post(`${F}/files`, { farmId: fz.farmId, purpose: 'Dans le périmètre' }, limited).expect(201);
      const portfolio = (await get(`${F}/portfolio`, limited).expect(200)).body;
      expect(portfolio.totals.files).toBe(
        (await get(`${F}/files?pageSize=200`, limited).expect(200)).body.total,
      );
      const consents = (await get(`${F}/consents`, limited).expect(200)).body;
      expect(consents.items.map((i: { farmId: string }) => i.farmId)).toEqual([fz.farmId]);
      const pick = (await get(`${F}/farms?q=${encodeURIComponent(other.farmCode)}`, limited).expect(200)).body;
      expect(pick).toEqual([]);
      await get(`${F}/farms/${other.farmId}/overview`, limited).expect(403);
      await post(`${F}/farms/${other.farmId}/consent/withdraw`, { reason: 'x' }, limited).expect(403);
      // The bank (FINANCED) and the national profile still see the whole programme.
      expect((await get(`${F}/files?pageSize=200`, bceg).expect(200)).body.total).toBeGreaterThan(own.body.total);
    });
  });

  describe('états financiers SYSCOHADA', () => {
    let books: { farmId: string; farmCode: string; ownerToken: string };
    let booksFile: string;

    beforeAll(async () => {
      books = await createProgrammeFarm(server, adminToken, { provinceCode: 'G1' });
      const own = (token: string) => ({ Authorization: `Bearer ${token}` });
      const batch = await request(server)
        .post(`/farms/${books.farmId}/batches`)
        .set(own(books.ownerToken))
        .send({
          batchName: 'Lot états',
          integrationDate: day(-20),
          quantityAtStart: 300,
          type: 'CHAIR',
          couvoirSupplier: 'Canabec',
          chickLotNumber: `CL-${digits}`,
          hatchDate: day(-20),
        })
        .expect(201);
      await request(server)
        .post(`/farms/${books.farmId}/caisse/open`)
        .set(own(books.ownerToken))
        .send({ openingBalanceFcfa: 100000 })
        .expect(201);
      await request(server)
        .post(`/farms/${books.farmId}/sales`)
        .set(own(books.ownerToken))
        .send({
          customerName: 'Client états',
          items: [{ productType: 'POULET_PIECE', quantity: 2, unit: 'PIECE', unitPriceFcfa: 5000, batchId: batch.body.id }],
          payments: [{ method: 'CASH', amountFcfa: 5000 }],
        })
        .expect(201);
      await request(server)
        .post(`/farms/${books.farmId}/expenses`)
        .set(own(books.ownerToken))
        .send({ category: 'ALIMENTS', amountFcfa: 8000, label: 'Provende', paidByCaisse: true })
        .expect(201);
      booksFile = (
        await post(`${F}/files`, { farmId: books.farmId, purpose: 'Fonds de roulement' }, bceg).expect(201)
      ).body.id;
    });

    it('une ferme avec comptabilité donne le compte de résultat, le bilan, la trésorerie et les ratios', async () => {
      const res = await get(`${F}/farms/${books.farmId}/financials`, bceg).expect(200);
      expect(res.body.initialized).toBe(true);
      expect(res.body.incomeStatement.revenueFcfa).toBe(10000);
      expect(res.body.incomeStatement.chargesFcfa).toBeGreaterThanOrEqual(8000);
      expect(res.body.balanceSheet).not.toBeNull();
      expect(res.body.balanceSheet.totalAssetsFcfa).toBe(
        res.body.balanceSheet.totalLiabilitiesFcfa,
      );
      expect(res.body.cash.closingFcfa).toBe(
        res.body.cash.openingFcfa + res.body.cash.inflowsFcfa - res.body.cash.outflowsFcfa,
      );
      expect(res.body.ratios.map((r: { code: string }) => r.code)).toHaveLength(7);
      const margin = res.body.ratios.find((r: { code: string }) => r.code === 'MARGE_NETTE');
      expect(margin.value).not.toBeNull();
      // No loan yet: the debt service coverage is not computable.
      expect(res.body.ratios.find((r: { code: string }) => r.code === 'SERVICE_DETTE').value).toBeNull();
      expect(res.body.reliability.journalEntries).toBeGreaterThan(0);
      expect(res.body.reliability.daysWithEntries).toBeGreaterThan(0);
      expect(res.body.beforeAfter).toBeNull();
      // Reads are journaled and never write on the farm's books.
      await get(`${F}/farms/${books.farmId}/financials?from=2026-02-30`, bceg).expect(400);
    });

    it('une ferme sans comptabilité répond « non ouverte » sans rien créer', async () => {
      const res = await get(`${F}/farms/${farm2.farmId}/financials`, bceg).expect(200);
      expect(res.body.initialized).toBe(false);
      expect(res.body.incomeStatement).toBeNull();
      expect(res.body.balanceSheet).toBeNull();
      expect(res.body.cash).toBeNull();
      expect(res.body.beforeAfter).toBeNull();
      expect(res.body.ratios.every((r: { value: number | null }) => r.value === null)).toBe(true);
      const [{ n }] = await ds.query(
        `SELECT COUNT(*)::int AS n FROM accounting_accounts WHERE farm_id = $1`,
        [farm2.farmId],
      );
      expect(n).toBe(0);
    });

    it('exige COMPTABILITE:CONSULTER en plus de FINANCEMENT', async () => {
      const code = `FIN${digits}`;
      await post(
        '/programme/access/profiles',
        { code, label: `Financeur sans compta ${digits}`, scopeKind: 'ALL', matrix: { FINANCEMENT: ['CONSULTER'] } },
        adminToken,
      ).expect(201);
      const noBooks = await institution(code);
      await get(`${F}/portfolio`, noBooks).expect(200);
      const refused = await get(`${F}/farms/${books.farmId}/financials`, noBooks).expect(403);
      expect(refused.body.message).toContain('Comptabilité');
      await get(`${F}/farms/${books.farmId}/financials/pdf`, noBooks).expect(403);
      // The farm itself has no door here.
      await get(`${F}/farms/${books.farmId}/financials`, books.ownerToken).expect(403);
    });

    it('produit le PDF et le classe dans le dossier, une seule fois', async () => {
      const pdf = await get(`${F}/farms/${books.farmId}/financials/pdf`, bceg)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      const body = { from: day(-30), to: day(0) };
      const first = await post(`${F}/files/${booksFile}/financial-statements`, body, bceg).expect(201);
      const line = (r: { body: { checklist: Array<{ requirement: { code: string }; documents: unknown[]; state: string }> } }) =>
        r.body.checklist.find((c) => c.requirement.code === 'INSTRUCTION_ETATS_FINANCIERS')!;
      expect(line(first).documents).toHaveLength(1);
      expect(line(first).state).toBe('DEPOSEE');
      const again = await post(`${F}/files/${booksFile}/financial-statements`, body, bceg).expect(201);
      expect(line(again).documents).toHaveLength(1);
      await post(`${F}/files/${booksFile}/financial-statements`, body, dge).expect(403);
    }, 30_000);
  });

  it('expose les références juridiques', async () => {
    const res = await get(`${F}/legal-basis`, bceg).expect(200);
    expect(res.body).toBeTruthy();
  });
});
