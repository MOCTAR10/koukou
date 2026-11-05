import { AuditAction } from '../../common/enums/audit-action.enum.js';
import { resolveRequestId } from '../../common/context/request-context.js';
import { resolveAuditPlan } from './audit-plan.js';
import {
  offlineOpId,
  requestFarmId,
  routeParams,
  routeTemplate,
} from './audit-route.js';

const FARM = '0b4f2a52-3c1e-4d0e-9a31-2f6f6e1d9b10';
const BATCH = '5d0c8c1e-7a8b-4e3f-b1a2-8c9d0e1f2a3b';

describe('audit route template and request fields', () => {
  it('uses the matched route template, never the concrete URL', () => {
    expect(
      routeTemplate({
        baseUrl: '',
        route: { path: '/farms/:farmId/batches/:batchId' },
        originalUrl: `/farms/${FARM}/batches/${BATCH}?x=1`,
      }),
    ).toBe('/farms/:farmId/batches/:batchId');
    expect(
      routeTemplate({ baseUrl: '/api', route: { path: '/audit/events' } }),
    ).toBe('/api/audit/events');
  });

  it('falls back to the path with ids replaced when no route matched', () => {
    expect(
      routeTemplate({ originalUrl: `/farms/${FARM}/unknown/42?token=abc` }),
    ).toBe('/farms/:id/unknown/:n');
  });

  it('takes the farm from the route, else the body, else the query', () => {
    expect(requestFarmId({ params: { farmId: FARM.toUpperCase() } })).toBe(
      FARM,
    );
    expect(requestFarmId({ params: {}, body: { farmId: FARM } })).toBe(FARM);
    expect(requestFarmId({ query: { farmId: FARM } })).toBe(FARM);
    expect(requestFarmId({ params: { farmId: 'not-a-uuid' } })).toBeNull();
  });

  it('reads route params and the offline op id', () => {
    expect(routeParams({ params: { farmId: FARM, batchId: BATCH } })).toEqual({
      farmId: FARM,
      batchId: BATCH,
    });
    expect(routeParams({ params: {} })).toBeNull();
    expect(offlineOpId({ body: { idempotencyKey: 'off-sale-1-abc' } })).toBe(
      'off-sale-1-abc',
    );
    expect(offlineOpId({ body: {} })).toBeNull();
  });

  it('keeps a valid incoming request id and replaces any other', () => {
    expect(resolveRequestId(BATCH.toUpperCase())).toBe(BATCH);
    const generated = resolveRequestId('abc');
    expect(generated).not.toBe('abc');
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('plans login, export, sensitive read, write, or nothing', () => {
    expect(
      resolveAuditPlan('POST', '/auth/login', undefined, undefined),
    ).toEqual({ kind: 'LOGIN' });
    expect(resolveAuditPlan('GET', '/x/export', undefined, 'PDF')).toEqual({
      kind: AuditAction.EXPORT,
      label: 'PDF',
    });
    expect(resolveAuditPlan('GET', '/admin/users', 'Liste', undefined)).toEqual(
      {
        kind: AuditAction.READ_SENSITIVE,
        reason: 'Liste',
      },
    );
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(resolveAuditPlan(method, '/farms', undefined, undefined)).toEqual({
        kind: AuditAction.WRITE,
      });
    }
    expect(resolveAuditPlan('GET', '/farms', undefined, undefined)).toBeNull();
  });
});
