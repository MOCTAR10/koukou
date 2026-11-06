import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { toXlsx, XLSX_MIME } from './../src/common/utils/spreadsheet.js';
import { parseCsv } from './../src/modules/programme/farms/csv.js';
import {
  createPlatformAdmin,
  createProgrammeFarm,
  registerBuyer,
  uniquePhone,
} from './helpers/programme-farm.js';

/** `YYYY-MM-DD`, `n` days from today (UTC). */
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** `JJ/MM/AAAA`, `n` days from today (UTC). */
const frDay = (n: number) => day(n).split('-').reverse().join('/');

describe('Programme POUFA — reprise des données (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let ownerToken: string;
  let farmId: string;
  let farmCode: string;

  /** Letters unlike any earlier run's names (duplicate detection). */
  const tag = Array.from(randomBytes(8), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');
  const EXISTING = `Ferme Reprise ${tag} Existante`;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (url: string, token = adminToken) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object = {}, token = adminToken) =>
    request(server).post(url).set(auth(token)).send(body);
  const deposit = (
    type: string,
    content: Buffer,
    token = adminToken,
    fields: Record<string, string> = {},
  ) => {
    const req = request(server)
      .post('/programme/imports')
      .set(auth(token))
      .field('type', type);
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    return req.attach('file', content, {
      filename: 'reprise.csv',
      contentType: 'text/csv',
    });
  };
  const rowOf = async (jobId: string, line: number) =>
    (
      await get(`/programme/imports/${jobId}/rows?pageSize=500`).expect(200)
    ).body.items.find((r: { line: number }) => r.line === line);

  async function createInstitution(
    profileCode: string,
    scope: { farmIds?: string[] } = {},
  ) {
    const phone = uniquePhone();
    const res = await post('/programme/access/memberships', {
      fullName: `Agent ${profileCode} ${tag}`,
      phone,
      profileCode,
      ...scope,
    }).expect(201);
    const logged = await request(server)
      .post('/auth/login')
      .send({ phone, code: res.body.loginCode })
      .expect(201);
    return {
      token: logged.body.accessToken as string,
      userId: res.body.user.id as string,
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
    adminToken = (await createPlatformAdmin(server, ds)).token;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: EXISTING,
    });
    farmId = farm.farmId;
    farmCode = farm.farmCode;
    ownerToken = farm.ownerToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('templates', () => {
    it('lists the types and serves a CSV template per type', async () => {
      const list = await get('/programme/imports/templates').expect(200);
      expect(list.body.map((t: { type: string }) => t.type)).toEqual([
        'AMI',
        'BANDES_HISTORIQUES',
        'OUTIL_TRANSITOIRE',
      ]);
      expect(
        list.body[1].fields.find((f: { key: string }) => f.key === 'bandRef'),
      ).toMatchObject({
        header: 'ref_bande',
        required: true,
      });
      const csv = await get('/programme/imports/templates/AMI').expect(200);
      expect(csv.headers['content-type']).toMatch(/text\/csv/);
      const text = csv.text;
      expect(text.charCodeAt(0)).toBe(0xfeff);
      expect(text.slice(1).split('\r\n')[0]).toBe(
        'ref_ami;nom;province;localite;exploitant;telephone;cohorte;capacite;latitude;longitude;statut',
      );
      expect(text.split('\r\n')).toHaveLength(2);
      const [{ action }] = await ds.query(
        `SELECT action FROM audit_events WHERE request_id = $1`,
        [csv.headers['x-request-id']],
      );
      expect(action).toBe('EXPORT');
      await get('/programme/imports/templates/INCONNU').expect(404);
    });
  });

  describe('access', () => {
    it('is closed to owners and buyers, and to non-national or read-only profiles', async () => {
      const buyer = await registerBuyer(server);
      await get('/programme/imports', buyer.token).expect(403);
      await get('/programme/imports', ownerToken).expect(403);
      const agent = await createInstitution('AGENT_TECHNIQUE', {
        farmIds: [farmId],
      });
      const res = await get('/programme/imports', agent.token).expect(403);
      expect(res.body.message).toMatch(/périmètre national/);
      await deposit(
        'AMI',
        Buffer.from('nom,province\nX,G1\n'),
        agent.token,
      ).expect(403);
      const admin = await createInstitution('ADMIN');
      await get('/programme/imports', admin.token).expect(200);
      await deposit(
        'AMI',
        Buffer.from('nom,province\nX,G1\n'),
        admin.token,
      ).expect(403);
    });
  });

  describe('AMI sheets', () => {
    let jobId: string;
    let content: Buffer;
    const ALPHA = `Reprise ${tag} Alpha`;
    const BETA = `Reprise ${tag} Bêta`;
    // A point of its own per run: an earlier run's Alpha sits at a resembling
    // name, and the same GPS point would make it a probable duplicate.
    const [lat, lng] = [
      0.2 + Math.random() * 0.4,
      9.3 + Math.random() * 0.3,
    ].map((v) => v.toFixed(5).replace('.', ','));

    it('deposits a Latin-1 « ; » file, analyses and controls every line', async () => {
      const lines = [
        'Réf AMI;Nom de la ferme;Province;Localité;Exploitant;Téléphone;Cohorte;Capacité;Latitude;Longitude;Remarques',
        `AMI-${tag}-1;${ALPHA};Estuaire;Komo-Mondah;Jean Mba;${uniquePhone('07')};1;1500;${lat};${lng};premier`,
        `AMI-${tag}-3;${BETA};Atlantide;;;;;;;;province fausse`,
        `AMI-${tag}-2;${EXISTING};G1;Komo;;;COHORTE_2;;;;déjà au registre`,
        `AMI-${tag}-1;${ALPHA};Estuaire;;;;;;;;doublon du fichier`,
        `;Reprise ${tag} Gamma;G1;;;;COHORTE_9;;;;cohorte fausse`,
      ];
      content = Buffer.from(lines.join('\r\n'), 'latin1');
      const res = await deposit('AMI', content, adminToken, {
        note: 'Campagne AMI 2025',
      }).expect(201);
      jobId = res.body.id;
      expect(res.body).toMatchObject({
        type: 'AMI',
        status: 'CONTROLE',
        encoding: 'latin1',
        delimiter: ';',
        mappingError: null,
        unknownColumns: [],
        note: 'Campagne AMI 2025',
      });
      expect(res.body.columnMapping['Nom de la ferme']).toBe('name');
      expect(res.body.columnMapping['Remarques']).toBeNull();
      expect(res.body.counts).toMatchObject({
        read: 5,
        errors: 2,
        integrated: 1,
        enriched: 1,
        alreadyPresent: 1,
      });
      expect(res.body.allowedSteps).toEqual([
        'SETTINGS',
        'CORRECT',
        'DRY_RUN',
        'REJECT',
      ]);
      const errors = await get(
        `/programme/imports/${jobId}/rows?status=ERREUR`,
      ).expect(200);
      expect(errors.body.total).toBe(2);
      expect(errors.body.items[0]).toMatchObject({
        line: 3,
        plannedOutcome: 'REJETEE',
      });
      expect(errors.body.items[0].errors[0]).toMatch(
        /Province inconnue : « Atlantide »/,
      );
      expect(errors.body.items[0].raw['Nom de la ferme']).toBe(BETA);
      const existing = await rowOf(jobId, 4);
      expect(existing.plannedOutcome).toBe('ENRICHIE');
      expect(existing.details).toMatchObject({ farmId, code: farmCode });
      expect(existing.details.completes).toEqual([
        'référence AMI',
        'localité',
        'cohorte',
      ]);
      expect((await rowOf(jobId, 5)).warnings.join(' ')).toMatch(
        /plus haut dans le fichier/,
      );
    });

    it('needs a dry run before validation', async () => {
      const res = await post(`/programme/imports/${jobId}/validate`).expect(
        409,
      );
      expect(res.body.message).toMatch(/suit un essai à blanc/);
      await post(`/programme/imports/${jobId}/integrate`).expect(409);
    });

    it('records manual corrections and exclusions, then controls again', async () => {
      await request(server)
        .patch(`/programme/imports/${jobId}/rows/3`)
        .set(auth(adminToken))
        .send({ values: { province: 'G1' } })
        .expect(400);
      const fixed = await request(server)
        .patch(`/programme/imports/${jobId}/rows/3`)
        .set(auth(adminToken))
        .send({
          values: { province: 'G1' },
          reason: 'Province corrigée selon le formulaire papier',
        })
        .expect(200);
      expect(fixed.body.row).toMatchObject({
        status: 'VALIDE',
        plannedOutcome: 'INTEGREE',
        errors: [],
      });
      expect(fixed.body.row.corrections[0].changes).toEqual([
        { field: 'province', before: 'Atlantide', after: 'G1' },
      ]);
      await request(server)
        .patch(`/programme/imports/${jobId}/rows/3`)
        .set(auth(adminToken))
        .send({ values: { province: 'G1' }, reason: 'rien de neuf ici' })
        .expect(400);
      await request(server)
        .patch(`/programme/imports/${jobId}/rows/99`)
        .set(auth(adminToken))
        .send({ exclude: true, reason: 'ligne absente' })
        .expect(404);
      const excluded = await request(server)
        .patch(`/programme/imports/${jobId}/rows/6`)
        .set(auth(adminToken))
        .send({ exclude: true, reason: 'Ferme hors programme' })
        .expect(200);
      expect(excluded.body.row).toMatchObject({
        status: 'EXCLUE',
        excluded: true,
      });
      expect(excluded.body.job.counts).toMatchObject({
        errors: 0,
        excluded: 1,
        corrected: 2,
        integrated: 2,
      });
    });

    it('dry runs the whole integration and rolls it back', async () => {
      const res = await post(`/programme/imports/${jobId}/dry-run`).expect(201);
      expect(res.body.status).toBe('ESSAI');
      expect(res.body.counts).toMatchObject({
        integrated: 2,
        enriched: 1,
        alreadyPresent: 1,
        rejected: 0,
        excluded: 1,
      });
      const alpha = await rowOf(jobId, 2);
      expect(alpha.dryRunOutcome).toBe('INTEGREE');
      expect(alpha.dryRunCode).toMatch(/^G1-\d{4,}$/);
      expect((await rowOf(jobId, 6)).dryRunMessage).toMatch(
        /Ligne exclue : Ferme hors programme/,
      );
      const [{ n }] = await ds.query(
        `SELECT count(*)::int AS n FROM farms WHERE name = $1`,
        [ALPHA],
      );
      expect(n).toBe(0);
      const [farm] = await ds.query(
        `SELECT ami_ref, cohort FROM farms WHERE id = $1`,
        [farmId],
      );
      expect(farm).toEqual({ ami_ref: null, cohort: null });
      const report = await get(`/programme/imports/${jobId}/report`).expect(
        200,
      );
      expect(report.body.phase).toBe('ESSAI');
    });

    it('validates, integrates in one go and reports', async () => {
      const validated = await post(`/programme/imports/${jobId}/validate`, {
        comment: 'Conforme aux formulaires',
      }).expect(201);
      expect(validated.body).toMatchObject({
        status: 'VALIDE',
        validationComment: 'Conforme aux formulaires',
      });
      await request(server)
        .patch(`/programme/imports/${jobId}/rows/2`)
        .set(auth(adminToken))
        .send({ exclude: true, reason: 'trop tard maintenant' })
        .expect(409);
      const done = await post(`/programme/imports/${jobId}/integrate`).expect(
        201,
      );
      expect(done.body).toMatchObject({ status: 'INTEGRE', allowedSteps: [] });
      expect(done.body.counts).toMatchObject({
        integrated: 2,
        enriched: 1,
        alreadyPresent: 1,
        rejected: 0,
      });
      const alpha = await rowOf(jobId, 2);
      expect(alpha).toMatchObject({ outcome: 'INTEGREE' });
      const [created] = await ds.query(
        `SELECT code, ami_ref, cohort, capacity_places, latitude, exploitant_name FROM farms WHERE id = $1`,
        [alpha.targetId],
      );
      expect(created).toMatchObject({
        ami_ref: `AMI-${tag}-1`,
        cohort: 'COHORTE_1',
        capacity_places: 1500,
        exploitant_name: 'Jean Mba',
      });
      expect(created.code).toBe(alpha.targetCode);
      const [enriched] = await ds.query(
        `SELECT ami_ref, cohort, localite_id FROM farms WHERE id = $1`,
        [farmId],
      );
      expect(enriched.ami_ref).toBe(`AMI-${tag}-2`);
      expect(enriched.cohort).toBe('COHORTE_2');
      expect(enriched.localite_id).not.toBeNull();
      await post(`/programme/imports/${jobId}/integrate`).expect(409);
      await post(`/programme/imports/${jobId}/reject`, {
        reason: 'trop tard',
      }).expect(409);

      const report = await get(`/programme/imports/${jobId}/report`).expect(
        200,
      );
      expect(report.body).toMatchObject({
        phase: 'REPRISE',
        title: 'Rapport de reprise des données',
      });
      expect(report.body.counts).toMatchObject({
        read: 5,
        integrated: 2,
        enriched: 1,
        corrected: 2,
        excluded: 1,
      });
      expect(report.body.corrections).toHaveLength(2);
      expect(report.body.corrections[0].changes[0]).toBe(
        'province : « Atlantide » → « G1 »',
      );
      expect(
        report.body.targets.map((t: { code: string }) => t.code),
      ).toContain(farmCode);
      expect(report.body.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      const again = await get(`/programme/imports/${jobId}/report`).expect(200);
      expect(again.body.fingerprint).toBe(report.body.fingerprint);

      const pdf = await get(`/programme/imports/${jobId}/report/pdf`).expect(
        200,
      );
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(pdf.headers['x-report-fingerprint']).toBe(report.body.fingerprint);
      expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      const [{ action }] = await ds.query(
        `SELECT action FROM audit_events WHERE request_id = $1`,
        [pdf.headers['x-request-id']],
      );
      expect(action).toBe('EXPORT');
      const csv = await get(`/programme/imports/${jobId}/report/csv`).expect(
        200,
      );
      const csvLines = csv.text.split('\r\n');
      expect(csvLines[0]).toContain(
        'ligne;libelle;cle_source;controle;resultat;code;message',
      );
      expect(csvLines).toHaveLength(6);
    });

    it('re-running the same file creates nothing', async () => {
      const res = await deposit('AMI', content).expect(201);
      expect(res.body.warnings[0]).toMatch(/déjà été intégré/);
      expect(res.body.counts).toMatchObject({
        integrated: 0,
        alreadyPresent: 3,
        errors: 2,
      });
      const alpha = await rowOf(res.body.id, 2);
      expect(alpha.plannedOutcome).toBe('DEJA_PRESENTE');
      const rejected = await post(`/programme/imports/${res.body.id}/reject`, {
        reason: 'Fichier déjà repris',
      }).expect(201);
      expect(rejected.body).toMatchObject({
        status: 'REJETE',
        rejectionReason: 'Fichier déjà repris',
      });
      await post(`/programme/imports/${res.body.id}/dry-run`).expect(409);
      const list = await get(
        '/programme/imports?type=AMI&status=REJETE',
      ).expect(200);
      expect(list.body.some((j: { id: string }) => j.id === res.body.id)).toBe(
        true,
      );
    });

    it('keeps a file with an unknown layout in analysis until it is mapped', async () => {
      const res = await deposit(
        'AMI',
        Buffer.from(`Exploitation,Région\nReprise ${tag} Delta,G2\n`),
      ).expect(201);
      expect(res.body.status).toBe('ANALYSE');
      expect(res.body.mappingError).toMatch(/obligatoire\(s\) absente\(s\)/);
      expect(res.body.unknownColumns).toEqual(['Exploitation', 'Région']);
      await post(`/programme/imports/${res.body.id}/dry-run`).expect(409);
      await request(server)
        .put(`/programme/imports/${res.body.id}/settings`)
        .set(auth(adminToken))
        .send({ mapping: { Inconnue: 'name' } })
        .expect(400);
      const mapped = await request(server)
        .put(`/programme/imports/${res.body.id}/settings`)
        .set(auth(adminToken))
        .send({ mapping: { Exploitation: 'name', Région: 'province' } })
        .expect(200);
      expect(mapped.body).toMatchObject({
        status: 'CONTROLE',
        mappingError: null,
      });
      expect(mapped.body.counts).toMatchObject({ integrated: 1, errors: 0 });
    });

    it('reads the same sheets from an Excel .xlsx, and refuses .xls with a French hint', async () => {
      const [header, ...rows] = parseCsv(content.toString('latin1'), ';');
      const upload = (buffer: Buffer, filename: string, contentType: string) =>
        request(server)
          .post('/programme/imports')
          .set(auth(adminToken))
          .field('type', 'AMI')
          .attach('file', buffer, { filename, contentType });
      const xlsx = await upload(
        await toXlsx(header, rows, { sheetName: 'Fiches AMI' }),
        'fiches.xlsx',
        XLSX_MIME,
      ).expect(201);
      expect(xlsx.body).toMatchObject({
        type: 'AMI',
        status: 'CONTROLE',
        encoding: 'xlsx',
        delimiter: '',
        mappingError: null,
      });
      expect(xlsx.body.columnMapping['Nom de la ferme']).toBe('name');
      // Same lines as the CSV, already integrated by the tests above.
      expect(xlsx.body.counts).toMatchObject({
        read: 5,
        alreadyPresent: 3,
        errors: 2,
        integrated: 0,
      });
      await post(`/programme/imports/${xlsx.body.id}/reject`, {
        reason: 'Essai du format Excel',
      }).expect(201);

      const broken = await upload(
        Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]),
        'fiches.xlsx',
        XLSX_MIME,
      ).expect(400);
      expect(broken.body.message).toMatch(/Fichier Excel illisible/);
      const xls = await upload(
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]),
        'fiches.xls',
        'application/octet-stream',
      ).expect(400);
      expect(xls.body.message).toMatch(/format Excel .xlsx ou CSV/);
    });
  });

  describe('historical bands', () => {
    let jobId: string;
    const H = `H${tag}`;
    const K = `K${tag}`;
    const Z = `Z${tag}`;
    const header =
      'ref_bande,code_ferme,date_mise_en_place,age_initial_j,effectif_initial,souche,date_cloture,date_saisie,morts,aliment_kg,eau_l,poids_moyen_g,sujets_peses';
    /** Replaced by the farm code once the farm exists (beforeAll). */
    const F = '@FARM@';
    const bandLines = [
      `${H},${F},${frDay(-30)},3,500,Cobb 500,${frDay(-25)},${frDay(-29)},2,20,40,,`,
      `${H},${F},,,,,,${frDay(-28)},1,22,41,120,30`,
      `${K},${F},${day(-10)},0,800,,,${day(-9)},4,15,30,,`,
      `${K},${F},,,,,,${day(-8)},0,16,31,,`,
      `${Z},${F},${day(-5)},0,300,,,${day(-7)},1,,,,`,
      `${Z},${F},,,,,,${day(-4)},1,,,,`,
    ];
    const csvOf = (lines: string[]) =>
      Buffer.from(
        [header, ...lines].join('\n').replaceAll('@FARM@', farmCode),
        'utf8',
      );

    it('deposits bands and their daily entries, and blocks a band with a wrong line', async () => {
      const res = await deposit('BANDES_HISTORIQUES', csvOf(bandLines)).expect(
        201,
      );
      jobId = res.body.id;
      expect(res.body).toMatchObject({
        status: 'CONTROLE',
        encoding: 'utf-8',
        delimiter: ',',
      });
      expect(res.body.counts).toMatchObject({
        read: 6,
        errors: 2,
        integrated: 4,
      });
      const z1 = await rowOf(jobId, 6);
      expect(z1.errors[0]).toMatch(/antérieure à la mise en place/);
      const z2 = await rowOf(jobId, 7);
      expect(z2.errors[0]).toMatch(
        /non reprise tant que la ligne 6 est en erreur/,
      );
      expect((await rowOf(jobId, 2)).sourceKey).toBe(`${farmCode}|${H}`);
    });

    it('dry runs with simulated band codes and writes nothing', async () => {
      const res = await post(`/programme/imports/${jobId}/dry-run`).expect(201);
      expect(res.body.counts).toMatchObject({ integrated: 4, rejected: 2 });
      const h = await rowOf(jobId, 2);
      expect(h.dryRunCode).toMatch(new RegExp(`^${farmCode}-B\\d+$`));
      expect(h.dryRunMessage).toMatch(/\(simulé\)/);
      const [{ n }] = await ds.query(
        `SELECT count(*)::int AS n FROM production_batches WHERE farm_id = $1 AND batch_name = $2`,
        [farmId, `Reprise ${H}`],
      );
      expect(n).toBe(0);
    });

    it('integrates through the band services: J+x, catch-up entries, closure', async () => {
      await post(`/programme/imports/${jobId}/validate`).expect(201);
      const done = await post(`/programme/imports/${jobId}/integrate`).expect(
        201,
      );
      expect(done.body.counts).toMatchObject({ integrated: 4, rejected: 2 });
      const h = await rowOf(jobId, 2);
      expect(h.targetCode).toMatch(new RegExp(`^${farmCode}-B\\d+$`));
      const [band] = await ds.query(
        `SELECT id, code, status, initial_age_days, quantity_at_start, quantity_alive,
                to_char(closed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS closed_on, closure_kind, breed_id
           FROM production_batches WHERE id = $1`,
        [h.targetId],
      );
      expect(band).toMatchObject({
        code: h.targetCode,
        status: 'CLOTURE',
        initial_age_days: 3,
        quantity_at_start: 500,
        quantity_alive: 497,
        closed_on: day(-25),
        closure_kind: null,
      });
      expect(band.breed_id).not.toBeNull();
      const entries = await ds.query(
        `SELECT to_char(entry_date, 'YYYY-MM-DD') AS d, deaths, feed_quantity, avg_weight_kg, sample_size, catch_up, skip_stock_deduction
           FROM daily_entries WHERE batch_id = $1 ORDER BY entry_date`,
        [band.id],
      );
      expect(entries).toEqual([
        {
          d: day(-29),
          deaths: 2,
          feed_quantity: 20,
          avg_weight_kg: null,
          sample_size: null,
          catch_up: true,
          skip_stock_deduction: true,
        },
        {
          d: day(-28),
          deaths: 1,
          feed_quantity: 22,
          avg_weight_kg: 0.12,
          sample_size: 30,
          catch_up: true,
          skip_stock_deduction: true,
        },
      ]);
      const [{ n: stats }] = await ds.query(
        `SELECT count(*)::int AS n FROM bande_daily_stats WHERE batch_id = $1`,
        [band.id],
      );
      expect(stats).toBeGreaterThan(0);
      const [link] = await ds.query(
        `SELECT source_key, job_id FROM import_source_links WHERE target_id = $1`,
        [band.id],
      );
      expect(link).toEqual({ source_key: `${farmCode}|${H}`, job_id: jobId });
      const k = await rowOf(jobId, 4);
      const [open] = await ds.query(
        `SELECT status FROM production_batches WHERE id = $1`,
        [k.targetId],
      );
      expect(open.status).toBe('ACTIF');
      // The frozen bilan of the closed band (BATCH_CLOSED after commit).
      let snapshots = 0;
      for (let i = 0; i < 20 && snapshots === 0; i++) {
        [{ n: snapshots }] = await ds.query(
          `SELECT count(*)::int AS n FROM bande_snapshots WHERE batch_id = $1`,
          [band.id],
        );
        if (snapshots === 0) await new Promise((r) => setTimeout(r, 100));
      }
      expect(snapshots).toBe(1);
    });

    it('a re-run only adds the new days of a band already recovered', async () => {
      const res = await deposit(
        'BANDES_HISTORIQUES',
        csvOf([
          ...bandLines.slice(0, 4),
          `${K},${F},,,,,,${day(-7)},1,17,32,,`,
        ]),
      ).expect(201);
      expect(res.body.counts).toMatchObject({
        read: 5,
        errors: 0,
        alreadyPresent: 4,
        integrated: 1,
      });
      await post(`/programme/imports/${res.body.id}/dry-run`).expect(201);
      await post(`/programme/imports/${res.body.id}/validate`).expect(201);
      const done = await post(
        `/programme/imports/${res.body.id}/integrate`,
      ).expect(201);
      expect(done.body.counts).toMatchObject({
        integrated: 1,
        alreadyPresent: 4,
      });
      const [{ n }] = await ds.query(
        `SELECT count(*)::int AS n FROM production_batches WHERE farm_id = $1 AND batch_name = $2`,
        [farmId, `Reprise ${K}`],
      );
      expect(n).toBe(1);
      const k = await rowOf(res.body.id, 6);
      const [{ n: days }] = await ds.query(
        `SELECT count(*)::int AS n FROM daily_entries WHERE batch_id = $1`,
        [k.targetId],
      );
      expect(days).toBe(3);
    });

    it('the transitional tool export finds the farm by name and province', async () => {
      const [{ name, province }] = await ds.query(
        `SELECT f.name, p.code AS province FROM farms f JOIN provinces p ON p.id = f.province_id WHERE f.id = $1`,
        [farmId],
      );
      const csv = Buffer.from(
        [
          'id_bande_outil;nom_ferme;province;date_mise_en_place;effectif_initial;date_saisie;morts',
          `T${tag};${name};${province};${day(-6)};250;${day(-5)};1`,
        ].join('\n'),
      );
      const res = await deposit('OUTIL_TRANSITOIRE', csv).expect(201);
      expect(res.body.counts).toMatchObject({ errors: 0, integrated: 1 });
      expect((await rowOf(res.body.id, 2)).sourceKey).toBe(
        `${farmCode}|T${tag}`,
      );
    });

    it('an authorised institutional profile validates (REGISTRE / VALIDER)', async () => {
      const csv = Buffer.from(
        [header, `V${tag},${farmCode},${day(-3)},0,100,,,,,,,,`].join('\n'),
      );
      const res = await deposit('BANDES_HISTORIQUES', csv).expect(201);
      await post(`/programme/imports/${res.body.id}/dry-run`).expect(201);
      const admin = await createInstitution('ADMIN');
      await post(
        `/programme/imports/${res.body.id}/validate`,
        {},
        admin.token,
      ).expect(403);
      const dge = await createInstitution('DGE');
      const ok = await post(
        `/programme/imports/${res.body.id}/validate`,
        {},
        dge.token,
      ).expect(201);
      expect(ok.body.validatedBy).toEqual({
        id: dge.userId,
        fullName: `Agent DGE ${tag}`,
      });
      const done = await post(
        `/programme/imports/${res.body.id}/integrate`,
        {},
        dge.token,
      ).expect(201);
      expect(done.body.status).toBe('INTEGRE');
    });
  });
});
