import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * POUFA lot A droits (audit F9, proportionality CDC §8): the row journal of
 * `farm_employees` no longer stores salary amounts nor the free notes; it
 * keeps « changed » (`_redacted_changed`), like `users.passwordHash`.
 */
export class AuditMaskSalaries1794000500100 implements MigrationInterface {
  name = 'AuditMaskSalaries1794000500100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `SELECT audit_attach('farm_employees', 'id', ARRAY['salary_fcfa', 'notes'])`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT audit_attach('farm_employees', 'id')`);
  }
}
