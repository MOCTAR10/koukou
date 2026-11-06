import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Journals the programme tables (before/after rows, see AuditJournal).
 * `id_counters` is left out: it changes on every code handed out, and the
 * codes themselves are journaled on the rows that receive them.
 */
const TABLES: ReadonlyArray<readonly [string, string]> = [
  ['programs', 'id'],
  ['provinces', 'id'],
  ['localites', 'id'],
  ['ref_items', 'id'],
  ['program_parameters', 'id'],
];

export class AuditProgrammeTables1793912000000 implements MigrationInterface {
  name = 'AuditProgrammeTables1793912000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, idColumn] of TABLES) {
      await queryRunner.query(`SELECT audit_attach($1::regclass, $2)`, [
        table,
        idColumn,
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table] of TABLES) {
      await queryRunner.query(`SELECT audit_detach($1::regclass)`, [table]);
    }
  }
}
