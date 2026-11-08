// Regression wave 5: HTTP hardening (headers, body limits, uploads, timeouts,
// error bodies), JWT pinning, LIKE/SQL inputs with quotes, CSV formula
// escaping, hot-path indexes.
import { randomBytes } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { applyBodyLimits } from './../src/common/http/body-limits.js';
import { CsvService } from './../src/common/services/csv.service.js';
import {
  applyServerTimeouts,
  securityHeaders,
  swaggerEnabled,
} from './../src/common/utils/http-exposure.js';
import { toXlsx } from './../src/common/utils/spreadsheet.js';
import { resolveJwtSecret } from './../src/modules/auth/auth.secret.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
} from './helpers/programme-farm.js';
import ExcelJS from 'exceljs';

describe('Regression wave 5 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let farmId: string;
  let token: string;
  const tag = randomBytes(3).toString('hex');

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    // Same HTTP setup as main.ts.
    applyBodyLimits(app);
    app.use(securityHeaders(false));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    await app.listen(0);
    server = app.getHttpServer();
    ds = app.get(DataSource);
    adminToken = (await createPlatformAdmin(server, ds)).token;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Wave5 ${tag}`,
    });
    farmId = farm.farmId;
    token = farm.ownerToken;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('security headers', () => {
    it('are present and X-Powered-By is gone', async () => {
      const res = await request(server).get('/farms').set(auth(token));
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['strict-transport-security']).toBeUndefined();
    });

    it('add HSTS in production', () => {
      const headers: Record<string, string> = {};
      securityHeaders(true)(
        {},
        {
          setHeader: (k: string, v: string) => (headers[k] = v),
          removeHeader: () => undefined,
        },
        () => undefined,
      );
      expect(headers['Strict-Transport-Security']).toMatch(/max-age=\d+/);
    });

    it('Swagger is off in production unless asked', () => {
      expect(swaggerEnabled('production', undefined)).toBe(false);
      expect(swaggerEnabled('production', 'true')).toBe(true);
      expect(swaggerEnabled('development', undefined)).toBe(true);
    });

    it('server timeouts are bounded', () => {
      const s = { requestTimeout: 0, headersTimeout: 0, keepAliveTimeout: 0 };
      applyServerTimeouts(s);
      expect(s.requestTimeout).toBeGreaterThan(0);
      expect(s.headersTimeout).toBeLessThanOrEqual(s.requestTimeout);
      expect(s.keepAliveTimeout).toBeGreaterThan(60_000);
    });
  });

  describe('body and upload limits', () => {
    it('an oversized JSON body is refused with 413', async () => {
      const res = await request(server)
        .post('/auth/login')
        .send({ phone: '+24160000000', code: 'x'.repeat(300_000) });
      expect(res.status).toBe(413);
      expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules/);
    });

    it('a logo that is not an image is a 400', async () => {
      await request(server)
        .post(`/farms/${farmId}/logo`)
        .set(auth(token))
        .attach('file', Buffer.from('<script>alert(1)</script>'), {
          filename: 'logo.png',
          contentType: 'image/png',
        })
        .expect(400);
    });

    it('a logo over 2 MiB is a 413', async () => {
      await request(server)
        .post(`/farms/${farmId}/logo`)
        .set(auth(token))
        .attach('file', Buffer.alloc(3 * 1024 * 1024, 1), {
          filename: 'logo.png',
          contentType: 'image/png',
        })
        .expect(413);
    });

    it('a corrupt xlsx registry import is a 4xx, never a 5xx', async () => {
      const res = await request(server)
        .post('/programme/farms/import')
        .set(auth(adminToken))
        .attach(
          'file',
          Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), randomBytes(64)]),
          { filename: 'x.xlsx' },
        );
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('a registry import over 5 MiB is a 413', async () => {
      await request(server)
        .post('/programme/farms/import')
        .set(auth(adminToken))
        .attach('file', Buffer.alloc(6 * 1024 * 1024, 65), {
          filename: 'big.csv',
        })
        .expect(413);
    });
  });

  describe('error bodies', () => {
    it('malformed JSON is a clean 400', async () => {
      const res = await request(server)
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"phone": ');
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules|at /);
    });

    it('a non-uuid path param never leaks SQL', async () => {
      const res = await request(server)
        .get(`/farms/not-a-uuid'--/customers`)
        .set(auth(token));
      expect(res.status).toBeLessThan(500);
      expect(JSON.stringify(res.body)).not.toMatch(
        /select |from "|QueryFailed|syntax error|stack/i,
      );
    });
  });

  describe('JWT', () => {
    it('refuses alg=none', async () => {
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
        sub: '00000000-0000-4000-8000-000000000000',
        role: 'PLATFORM_ADMIN',
      })}.`;
      await request(server).get('/farms').set(auth(forged)).expect(401);
    });

    it('refuses a token signed with another algorithm', async () => {
      const jwt = app.get(JwtService, { strict: false });
      const payload = { sub: '00000000-0000-4000-8000-000000000000', role: 'PROPRIETAIRE' };
      const hs512 = jwt.sign(payload, { algorithm: 'HS512' });
      await request(server).get('/farms').set(auth(hs512)).expect(401);
    });

    it('refuses an expired token', async () => {
      const jwt = app.get(JwtService, { strict: false });
      const expired = jwt.sign(
        { sub: '00000000-0000-4000-8000-000000000000', role: 'PROPRIETAIRE' },
        { expiresIn: '-10s' },
      );
      await request(server).get('/farms').set(auth(expired)).expect(401);
    });

    it('the secret is mandatory in production', () => {
      const config = {
        get: (k: string) => (k === 'NODE_ENV' ? 'production' : undefined),
      };
      expect(() =>
        resolveJwtSecret(config as unknown as Parameters<typeof resolveJwtSecret>[0]),
      ).toThrow(/JWT_SECRET/);
    });
  });

  describe('inputs with quotes and wildcards', () => {
    const nasty = ["'; DROP TABLE customers; --", "' OR '1'='1", '%', '_', '\\', '"'];

    it.each(nasty)('customers search %j is a plain 200', async (search) => {
      const res = await request(server)
        .get(`/farms/${farmId}/customers`)
        .query({ search })
        .set(auth(token));
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it.each(nasty)('registry search %j never fails', async (q) => {
      const res = await request(server)
        .get('/programme/farms')
        .query({ q })
        .set(auth(adminToken));
      expect(res.status).toBe(200);
    });

    it('a customer named with % is only matched literally', async () => {
      await request(server)
        .post(`/farms/${farmId}/customers`)
        .set(auth(token))
        .send({ fullName: `Client ${tag}` })
        .expect(201);
      const res = await request(server)
        .get(`/farms/${farmId}/customers`)
        .query({ search: '%' })
        .set(auth(token))
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('spreadsheet formula injection', () => {
    it('CSV prefixes dangerous text cells with a quote', () => {
      const csv = app
        .get(CsvService, { strict: false })
        .toCsv(['a'], [['=HYPERLINK("x")'], ['+1+1'], ['@SUM(A1)'], ['-cmd'], [-1500]])
        .toString('utf8');
      expect(csv).toContain("'=HYPERLINK");
      expect(csv).toContain("'+1+1");
      expect(csv).toContain("'@SUM");
      expect(csv).toContain("'-cmd");
      expect(csv).toContain('-1500');
    });

    it('xlsx never stores text as a formula', async () => {
      const buffer = await toXlsx(['a'], [['=1+1'], ['@SUM(A1)']]);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];
      for (const row of [2, 3]) {
        const cell = ws.getRow(row).getCell(1);
        expect(typeof cell.value).toBe('string');
        expect(cell.formula).toBeFalsy();
      }
    });
  });

  describe('indexes', () => {
    it('hot-path composite indexes exist', async () => {
      const rows: { indexname: string }[] = await ds.query(
        `SELECT indexname FROM pg_indexes WHERE indexname = ANY($1)`,
        [['IDX_sales_farm_date', 'IDX_expenses_farm_date', 'IDX_alerts_farm_status']],
      );
      expect(rows.map((r) => r.indexname).sort()).toEqual([
        'IDX_alerts_farm_status',
        'IDX_expenses_farm_date',
        'IDX_sales_farm_date',
      ]);
    });
  });
});
