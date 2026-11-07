#!/usr/bin/env node
/**
 * Cleanup of the test data created in production by the ANINF acceptance test
 * (recette du 7 nov. 2026). Finds the rows by their markers, follows the
 * foreign keys to every dependant and deletes them in ONE transaction.
 *
 * Usage (from backend/, with the .env of the target database):
 *
 *   node --env-file=.env scripts/cleanup-recette-aninf.mjs            # dry run (default)
 *   node --env-file=.env scripts/cleanup-recette-aninf.mjs --apply    # really delete
 *
 * Dry run = the transaction is rolled back at the end: it prints exactly what
 * would be deleted, per table, and changes nothing. Reads DB_HOST, DB_PORT,
 * DB_USERNAME, DB_PASSWORD, DB_DATABASE (same variables as the backend).
 *
 * Markers (all required, so a real farm is never matched by accident):
 *  - farm G1-0001: farm_visits dated 2026-11-07 whose observations or
 *    recommendations contain « TEST RECETTE »;
 *  - farm G9-0008: building « TEST RECETTE Batiment », band G9-0008-B01
 *    (« TEST RECETTE Bande ») with its daily entry, health events (coccidiose
 *    declaration), vaccinations, sorties (« TEST RECETTE » recipient), and the
 *    official sanitary alert AS-2026-0003 of that band.
 *
 * NEVER deleted: the audit journal (audit_events, audit_row_changes,
 * audit_seals): immutable by design. Deleting the rows here appends its own
 * journal entries (triggers) like any other change. Counters (band rank B01,
 * alert number AS-2026-0003) are not rewound. Photo files under UPLOADS_DIR
 * are listed, not removed: delete them by hand after --apply.
 */
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const MARK = '%TEST RECETTE%';
const IMMUTABLE_TABLE = /^audit_/;

const client = new pg.Client({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'koukou_ferme',
});

const q = async (text, params = []) => (await client.query(text, params)).rows;
const ident = (s) => `"${s.replaceAll('"', '""')}"`;

/** table -> Set(ids) of the rows to delete, and table -> depth (delete deepest first). */
const toDelete = new Map();
const depth = new Map();

function add(table, ids, level) {
  if (!ids.length) return [];
  const set = toDelete.get(table) ?? new Set();
  const fresh = ids.filter((id) => !set.has(id));
  fresh.forEach((id) => set.add(id));
  toDelete.set(table, set);
  depth.set(table, Math.max(depth.get(table) ?? 0, level));
  return fresh;
}

/** Foreign keys pointing at `table` (single-column; others abort the run). */
async function referencing(table) {
  const rows = await q(
    `SELECT c.conrelid::regclass::text AS child, c.confdeltype AS del,
            c.conkey, c.confkey, c.conname,
            (SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(att, ord)
               JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.att) AS cols,
            (SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY k(att, ord)
               JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.att) AS refcols
       FROM pg_constraint c
      WHERE c.contype = 'f' AND c.confrelid = $1::regclass`,
    [ident(table)],
  );
  return rows;
}

async function collect(table, ids, level) {
  const fks = await referencing(table);
  for (const fk of fks) {
    const child = fk.child.replaceAll('"', '').replace(/^public\./, '');
    if (IMMUTABLE_TABLE.test(child)) {
      console.log(`  (ignoré : ${child} est le journal d'audit, immuable)`);
      continue;
    }
    // ON DELETE SET NULL ('n') / SET DEFAULT ('d'): the database handles it.
    if (fk.del === 'n' || fk.del === 'd') continue;
    if (fk.cols.length !== 1 || fk.refcols.length !== 1) {
      throw new Error(`Clé étrangère composite non gérée : ${fk.conname}`);
    }
    const refCol = fk.refcols[0];
    // ids are values of the referenced column; our ids are primary keys.
    let parentIds = ids;
    if (refCol !== 'id') {
      const rows = await q(
        `SELECT DISTINCT ${ident(refCol)} AS v FROM ${ident(table)} WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      parentIds = rows.map((r) => r.v).filter((v) => v != null);
    }
    if (!parentIds.length) continue;
    const rows = await q(
      `SELECT id FROM ${ident(child)} WHERE ${ident(fk.cols[0])} = ANY($1::uuid[])`,
      [parentIds],
    );
    const fresh = add(child, rows.map((r) => r.id), level + 1);
    if (fresh.length) await collect(child, fresh, level + 1);
  }
}

async function root(label, table, rows) {
  const ids = rows.map((r) => r.id);
  console.log(`- ${label} : ${ids.length} ligne(s) trouvée(s)`);
  for (const r of rows) console.log(`    ${JSON.stringify(r)}`);
  const fresh = add(table, ids, 0);
  if (fresh.length) await collect(table, fresh, 0);
}

await client.connect();
console.log(
  `${APPLY ? 'MODE APPLIQUER' : 'MODE SIMULATION (dry-run)'} sur ${client.host}:${client.port}/${client.database}\n`,
);

try {
  await client.query('BEGIN');

  const farms = await q(
    `SELECT id, code FROM farms WHERE code IN ('G1-0001', 'G9-0008')`,
  );
  const farmId = (code) => farms.find((f) => f.code === code)?.id;
  const g1 = farmId('G1-0001');
  const g9 = farmId('G9-0008');
  if (!g1) console.log('Ferme G1-0001 introuvable : rien à faire pour la visite.');
  if (!g9) console.log('Ferme G9-0008 introuvable : rien à faire pour la bande.');

  console.log('Recherche des lignes racines :');
  if (g1) {
    await root(
      'visite technique du 07/11/2026 (G1-0001)',
      'farm_visits',
      await q(
        `SELECT id, visit_date::text, left(coalesce(observations, ''), 80) AS observations
           FROM farm_visits
          WHERE farm_id = $1 AND visit_date = DATE '2026-11-07'
            AND (observations ILIKE $2 OR recommendations ILIKE $2)`,
        [g1, MARK],
      ),
    );
  }
  if (g9) {
    await root(
      'bâtiment « TEST RECETTE Batiment » (G9-0008)',
      'buildings',
      await q(`SELECT id, name FROM buildings WHERE farm_id = $1 AND name ILIKE $2`, [g9, MARK]),
    );
    const bands = await q(
      `SELECT id, code, batch_name, quantity_at_start
         FROM production_batches
        WHERE farm_id = $1 AND code = 'G9-0008-B01' AND batch_name ILIKE $2`,
      [g9, MARK],
    );
    await root('bande « TEST RECETTE Bande » G9-0008-B01', 'production_batches', bands);
    const bandIds = bands.map((b) => b.id);
    await root(
      'alerte sanitaire AS-2026-0003',
      'sanitary_alerts',
      await q(
        `SELECT id, code, status_code FROM sanitary_alerts
          WHERE code = 'AS-2026-0003' AND farm_id = $1
            AND (batch_id = ANY($2::uuid[]) OR batch_id IS NULL)`,
        [g9, bandIds],
      ),
    );
  }

  console.log('\nÀ supprimer (dépendants inclus), par table :');
  const order = [...toDelete.keys()].sort((a, b) => depth.get(b) - depth.get(a));
  for (const t of order) console.log(`  ${t.padEnd(36)} ${toDelete.get(t).size}`);
  if (!order.length) console.log('  (rien)');

  // Photo files stay on disk: list them.
  for (const t of ['health_event_photos', 'farm_visit_photos']) {
    const ids = [...(toDelete.get(t) ?? [])];
    if (!ids.length) continue;
    const files = await q(`SELECT file_name FROM ${ident(t)} WHERE id = ANY($1::uuid[])`, [ids]);
    console.log(`\nFichiers à supprimer à la main (${t}) : ${files.map((f) => f.file_name).join(', ')}`);
  }

  // Deepest dependants first, then the roots.
  for (const t of order) {
    const ids = [...toDelete.get(t)];
    const res = await client.query(`DELETE FROM ${ident(t)} WHERE id = ANY($1::uuid[])`, [ids]);
    if (res.rowCount !== ids.length) {
      console.log(`  ! ${t} : ${res.rowCount} supprimée(s) sur ${ids.length} prévue(s) (cascade en base)`);
    }
  }

  if (APPLY) {
    await client.query('COMMIT');
    console.log('\nTransaction VALIDÉE : données de test supprimées.');
  } else {
    await client.query('ROLLBACK');
    console.log('\nSimulation terminée : transaction ANNULÉE, rien n\'a été modifié. Relancer avec --apply pour supprimer.');
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('\nÉchec, transaction annulée :', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
