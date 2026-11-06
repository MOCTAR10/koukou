/**
 * History of a configurable list, read from the row journal
 * (`audit_row_changes` of `ref_items`): who added, renamed, reordered,
 * activated or deactivated an item, and when. Pure, unit-tested.
 */

/** Columns a list manager changes; `code`, `family` and `list_type` never change. */
const TRACKED: readonly [column: string, field: string][] = [
  ['label', 'label'],
  ['active', 'active'],
  ['sort', 'sort'],
  ['parent_id', 'parentId'],
  ['meta', 'meta'],
];

export interface ListHistoryChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface ListHistoryEntry {
  id: string;
  at: string;
  /** CREATION (insert), MODIFICATION (update) or SUPPRESSION (never done by the app). */
  kind: 'CREATION' | 'MODIFICATION' | 'SUPPRESSION';
  code: string | null;
  label: string | null;
  changes: ListHistoryChange[];
  actorUserId: string | null;
  actorName: string | null;
  requestId: string | null;
}

export interface RowChangeRecord {
  id: string | number;
  at: Date | string;
  op: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actorUserId: string | null;
  requestId: string | null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function listHistoryEntry(
  row: RowChangeRecord,
  names: ReadonlyMap<string, string>,
): ListHistoryEntry {
  const before = row.before ?? {};
  const after = row.after ?? {};
  const kind =
    row.op === 'I' ? 'CREATION' : row.op === 'D' ? 'SUPPRESSION' : 'MODIFICATION';
  const changes: ListHistoryChange[] = [];
  for (const [column, field] of TRACKED) {
    const b = kind === 'CREATION' ? undefined : before[column];
    const a = kind === 'SUPPRESSION' ? undefined : after[column];
    if (kind === 'MODIFICATION' && same(a, b)) continue;
    if (kind === 'CREATION' && (a === undefined || a === null)) continue;
    changes.push({ field, before: b ?? null, after: a ?? null });
  }
  const pick = (key: string) => {
    const v = after[key] ?? before[key];
    return typeof v === 'string' ? v : null;
  };
  return {
    id: String(row.id),
    at: new Date(row.at).toISOString(),
    kind,
    code: pick('code'),
    label: pick('label'),
    changes,
    actorUserId: row.actorUserId,
    actorName: row.actorUserId ? (names.get(row.actorUserId) ?? null) : null,
    requestId: row.requestId,
  };
}
