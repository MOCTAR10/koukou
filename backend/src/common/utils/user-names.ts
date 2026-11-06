import type { DataSource, EntityManager } from 'typeorm';

/**
 * Display names of the given accounts (authors in parameter, list and
 * journal histories), in one query. Unknown ids are absent from the map.
 */
export async function userNames(
  db: DataSource | EntityManager,
  ids: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [
    ...new Set(ids.filter((id): id is string => typeof id === 'string')),
  ];
  if (unique.length === 0) return new Map();
  const rows: { id: string; name: string }[] = await db.query(
    `SELECT id, "fullName" AS name FROM users WHERE id = ANY($1::uuid[])`,
    [unique],
  );
  return new Map(rows.map((r) => [r.id, r.name]));
}
