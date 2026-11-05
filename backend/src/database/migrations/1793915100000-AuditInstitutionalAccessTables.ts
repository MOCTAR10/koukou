import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Journals the institutional access tables (before/after rows, see
 * AuditJournal). The one-time login code hash is never stored in the
 * journal: only the fact that it changed.
 */
const TABLES: ReadonlyArray<readonly [string, string, readonly string[]]> = [
  ['access_profiles', 'id', []],
  ['program_memberships', 'id', []],
  ['login_challenges', 'id', ['code_hash']],
];

export class AuditInstitutionalAccessTables1793915100000 implements MigrationInterface {
  name = 'AuditInstitutionalAccessTables1793915100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, idColumn, redacted] of TABLES) {
      await queryRunner.query(
        `SELECT audit_attach($1::regclass, $2, $3::text[])`,
        [table, idColumn, redacted],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table] of TABLES) {
      await queryRunner.query(`SELECT audit_detach($1::regclass)`, [table]);
    }
  }
}
