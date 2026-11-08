import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expenses get an offline replay key (same model as `input_lots`): a second
 * create with the same (farm, key) returns the stored expense instead of
 * booking it again. Nullable column, so older rows are untouched.
 */
export class ExpenseIdempotency1794510000000 implements MigrationInterface {
  name = 'ExpenseIdempotency1794510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "expenses"
            ADD COLUMN IF NOT EXISTS "idempotency_key" character varying
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_expenses_farm_idem" ON "expenses" ("farm_id", "idempotency_key")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX IF EXISTS "public"."UQ_expenses_farm_idem"
        `);
    await queryRunner.query(`
            ALTER TABLE "expenses" DROP COLUMN IF EXISTS "idempotency_key"
        `);
  }
}
