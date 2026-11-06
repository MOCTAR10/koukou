import { describe, expect, it } from 'vitest';
import { listHistoryEntry } from './ref-list-history.js';

const names = new Map([['u-1', 'Awa Vétérinaire']]);
const item = {
  code: 'TOUX',
  label: 'Toux',
  active: true,
  sort: 1,
  parent_id: null,
  meta: {},
  family: null,
  list_type: 'SIGNE_CLINIQUE',
};

describe('listHistoryEntry', () => {
  it('reads a creation with its author', () => {
    const e = listHistoryEntry(
      {
        id: 12,
        at: '2026-11-06T10:00:00.000Z',
        op: 'I',
        before: null,
        after: item,
        actorUserId: 'u-1',
        requestId: 'r-1',
      },
      names,
    );
    expect(e.kind).toBe('CREATION');
    expect(e.code).toBe('TOUX');
    expect(e.actorName).toBe('Awa Vétérinaire');
    expect(e.changes.map((c) => c.field)).toEqual(['label', 'active', 'sort', 'meta']);
  });

  it('keeps only the fields that changed on an update', () => {
    const e = listHistoryEntry(
      {
        id: '13',
        at: new Date('2026-11-06T11:00:00.000Z'),
        op: 'U',
        before: item,
        after: { ...item, active: false, label: 'Toux sèche' },
        actorUserId: 'u-2',
        requestId: null,
      },
      names,
    );
    expect(e.kind).toBe('MODIFICATION');
    expect(e.label).toBe('Toux sèche');
    expect(e.changes).toEqual([
      { field: 'label', before: 'Toux', after: 'Toux sèche' },
      { field: 'active', before: true, after: false },
    ]);
    // Unknown account: the id stays, no name is made up.
    expect(e.actorUserId).toBe('u-2');
    expect(e.actorName).toBeNull();
  });
});
