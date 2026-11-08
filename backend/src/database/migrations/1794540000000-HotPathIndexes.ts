import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Composite indexes for the hot list/dashboard filters: sales and expenses by
 * (farm, date), alerts by (farm, status). Additive, `IF NOT EXISTS`.
 */
export class HotPathIndexes1794540000000 implements MigrationInterface {
  name = 'HotPathIndexes1794540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sales_farm_date" ON "sales" ("farm_id", "sale_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_expenses_farm_date" ON "expenses" ("farm_id", "expense_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_alerts_farm_status" ON "alerts" ("farm_id", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_alerts_farm_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_expenses_farm_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_sales_farm_date"`,
    );
  }
}
