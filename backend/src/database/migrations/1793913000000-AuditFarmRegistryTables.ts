import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Journals the farm registry tables (before/after rows, see AuditJournal).
 * `farms` itself is already attached: its new programme columns are covered
 * because the trigger stores the whole row.
 */
const TABLES: ReadonlyArray<readonly [string, string]> = [
  ['farm_status_history', 'id'],
  ['farm_infrastructures', 'id'],
  ['farm_gps_history', 'id'],
];

export class AuditFarmRegistryTables1793913000000 implements MigrationInterface {
  name = 'AuditFarmRegistryTables1793913000000';

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
