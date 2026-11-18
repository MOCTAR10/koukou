/** What the helper needs: a `DataSource` or an `EntityManager` both fit. */
export interface Queryable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(sql: string, parameters?: any[]): Promise<any>;
}

/** What the clients show on data entered on behalf of a farm. */
export interface DelegatedAuthorFields {
  enteredOnBehalf: boolean;
  /** Author's name, only when `enteredOnBehalf`. */
  enteredByName: string | null;
  /** Label of the author's access profile (« Agent technique »), only when `enteredOnBehalf`. */
  enteredByProfile: string | null;
}

/**
 * Adds the author labels to rows entered on behalf of a farm, with one query
 * for the whole list (never one per row). Rows entered by the farm itself
 * carry `enteredByName`/`enteredByProfile` null.
 */
export async function withDelegatedAuthor<
  T extends { enteredOnBehalf: boolean; createdById: string | null },
>(
  db: Queryable,
  rows: T[],
): Promise<Array<T & DelegatedAuthorFields>> {
  const ids = [
    ...new Set(
      rows
        .filter((r) => r.enteredOnBehalf && r.createdById)
        .map((r) => r.createdById as string),
    ),
  ];
  const labels = new Map<string, { name: string | null; profile: string | null }>();
  if (ids.length > 0) {
    const found: { id: string; name: string | null; profile: string | null }[] =
      await db.query(
        `SELECT u.id, u."fullName" AS name, p.label AS profile
           FROM users u
           LEFT JOIN program_memberships m ON m.user_id = u.id
           LEFT JOIN access_profiles p ON p.id = m.profile_id
          WHERE u.id = ANY($1::uuid[])`,
        [ids],
      );
    for (const f of found) labels.set(f.id, { name: f.name, profile: f.profile });
  }
  return rows.map((r) => {
    const label =
      r.enteredOnBehalf && r.createdById ? labels.get(r.createdById) : undefined;
    return {
      ...r,
      enteredByName: label?.name ?? null,
      enteredByProfile: label?.profile ?? null,
    };
  });
}
