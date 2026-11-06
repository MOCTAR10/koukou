import { describe, expect, it } from 'vitest';
import type { AuditEvent } from '../../api/types-admin';
import {
  diffSummary,
  EMPTY_EVENT_FILTERS,
  EMPTY_ROW_FILTERS,
  eventFilterError,
  eventsQueryString,
  exportFileName,
  filterPage,
  pageCount,
  rowChangeFilterError,
  rowChangesQueryString,
  rowDiff,
  sealVerdict,
  statusClassOf,
  summaryLines,
  verifyBody,
} from './audit';

const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('journal filters', () => {
  it('builds the server query', () => {
    expect(eventsQueryString(EMPTY_EVENT_FILTERS)).toBe('');
    expect(eventsQueryString({ ...EMPTY_EVENT_FILTERS, from: '2026-11-01', action: 'WRITE', route: ' /batches ' }, 2)).toBe(
      '?from=2026-11-01&action=WRITE&route=%2Fbatches&page=2&limit=50',
    );
    expect(eventsQueryString({ ...EMPTY_EVENT_FILTERS, actorUserId: UUID })).toBe(`?actorUserId=${UUID}`);
    // Status and request id are server filters now (`/audit/events` and its export).
    expect(eventsQueryString({ ...EMPTY_EVENT_FILTERS, status: 'REFUS', requestId: ` ${UUID} ` })).toBe(`?status=4xx&requestId=${UUID}`);
    expect(eventsQueryString({ ...EMPTY_EVENT_FILTERS, status: 'OK' })).toBe('?status=SUCCES');
    expect(eventFilterError({ ...EMPTY_EVENT_FILTERS, requestId: 'abc' })).toMatch(/requête/);
    expect(rowChangesQueryString({ ...EMPTY_ROW_FILTERS, requestId: UUID, table: 'farms' }, 1)).toBe(`?table=farms&requestId=${UUID}&page=1&limit=50`);
    expect(exportFileName({ from: '', to: '2026-11-05' })).toBe('journal-audit-debut-2026-11-05.csv');
  });

  it('checks the filters before sending', () => {
    expect(eventFilterError(EMPTY_EVENT_FILTERS)).toBeNull();
    expect(eventFilterError({ ...EMPTY_EVENT_FILTERS, from: '2026-11-05', to: '2026-11-01' })).toMatch(/Période invalide/);
    expect(eventFilterError({ ...EMPTY_EVENT_FILTERS, actorUserId: 'abc' })).toMatch(/utilisateur/);
    expect(rowChangeFilterError({ ...EMPTY_ROW_FILTERS, requestId: 'x' })).toMatch(/requête/);
  });

  it('filters the page shown by status and request id', () => {
    const e = (id: string, statusCode: number | null, requestId: string | null) => ({ id, statusCode, requestId }) as AuditEvent;
    const items = [e('1', 201, 'aaaa-1'), e('2', 403, 'bbbb-2'), e('3', 500, 'aaaa-3'), e('4', null, null)];
    expect(filterPage(items, { status: 'REFUS', requestId: '' }).map((x) => x.id)).toEqual(['2']);
    expect(filterPage(items, { status: '', requestId: 'AAAA' }).map((x) => x.id)).toEqual(['1', '3']);
    expect(statusClassOf(302)).toBe('OK');
    expect(statusClassOf(null)).toBeNull();
    expect(pageCount(101, 50)).toBe(3);
    expect(pageCount(0, 50)).toBe(1);
  });
});

describe('row diff', () => {
  it('puts changed columns first', () => {
    const lines = rowDiff({ before: { name: 'A', code: 'G1', meta: { x: 1 } }, after: { name: 'B', code: 'G1', meta: { x: 1 }, active: true } });
    expect(lines).toEqual([
      { key: 'active', kind: 'added', before: null, after: 'true' },
      { key: 'name', kind: 'changed', before: 'A', after: 'B' },
      { key: 'code', kind: 'same', before: 'G1', after: 'G1' },
      { key: 'meta', kind: 'same', before: '{"x":1}', after: '{"x":1}' },
    ]);
  });

  it('handles inserts and deletes', () => {
    expect(rowDiff({ before: null, after: { a: 1 } })).toEqual([{ key: 'a', kind: 'added', before: null, after: '1' }]);
    expect(rowDiff({ before: { a: null }, after: null })).toEqual([{ key: 'a', kind: 'removed', before: 'null', after: null }]);
    expect(diffSummary({ op: 'U', before: { a: 1, b: 2 }, after: { a: 2, b: 2 } })).toBe('1 colonne modifiée');
    expect(diffSummary({ op: 'I', before: null, after: { a: 1 } })).toBe('Ligne créée');
  });

  it('lists the summary sorted', () => {
    expect(summaryLines({ b: 'x', a: { c: 1 } })).toEqual([
      { key: 'a', value: '{"c":1}' },
      { key: 'b', value: 'x' },
    ]);
    expect(summaryLines(null)).toEqual([]);
  });
});

describe('seals', () => {
  it('says intact, empty or the first mismatch', () => {
    expect(sealVerdict({ ok: true, checkedDays: 3, firstDay: '2026-11-01', lastDay: '2026-11-03', mismatch: null })).toMatchObject({
      tone: 'emerald',
      title: 'Journal intègre',
    });
    expect(sealVerdict({ ok: true, checkedDays: 0, firstDay: null, lastDay: null, mismatch: null }).tone).toBe('slate');
    const bad = sealVerdict({
      ok: false,
      checkedDays: 2,
      firstDay: '2026-11-01',
      lastDay: '2026-11-02',
      mismatch: { day: '2026-11-03', reason: 'HASH', message: 'Empreinte recalculée différente.' },
    });
    expect(bad).toMatchObject({ tone: 'red', title: 'Incohérence le 2026-11-03 : Empreinte différente' });
    expect(bad.detail).toMatch(/Empreinte recalculée différente/);
  });

  it('builds the verification body', () => {
    expect(verifyBody('', '')).toEqual({});
    expect(verifyBody('2026-11-01', '')).toEqual({ from: '2026-11-01' });
    expect(verifyBody('2026-11-05', '2026-11-01')).toMatchObject({ error: expect.any(String) });
  });
});
