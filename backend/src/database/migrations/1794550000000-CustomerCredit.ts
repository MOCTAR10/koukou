import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Customer credit: a ceiling and a payment term per customer, a farm-wide
 * default for both, and the CREANCE_RETARD alert kind (overdue invoices).
 */
export class CustomerCredit1794550000000 implements MigrationInterface {
  name = 'CustomerCredit1794550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "customers"
            ADD COLUMN IF NOT EXISTS "credit_limit_fcfa" integer,
            ADD COLUMN IF NOT EXISTS "payment_term_days" integer
        `);
    await queryRunner.query(`
            ALTER TABLE "farms"
            ADD COLUMN IF NOT EXISTS "default_credit_limit_fcfa" integer,
            ADD COLUMN IF NOT EXISTS "default_payment_term_days" integer
        `);
    // Appended in place (same approach as STOCK_NEGATIF).
    await queryRunner.query(`
            ALTER TYPE "public"."rule_registry_kind_enum" ADD VALUE IF NOT EXISTS 'CREANCE_RETARD'
        `);
    await queryRunner.query(`
            ALTER TYPE "public"."alerts_kind_enum" ADD VALUE IF NOT EXISTS 'CREANCE_RETARD'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // CREANCE_RETARD stays in the alert kind enums (PostgreSQL cannot drop an enum value).
    await queryRunner.query(`
            ALTER TABLE "farms"
            DROP COLUMN IF EXISTS "default_payment_term_days",
            DROP COLUMN IF EXISTS "default_credit_limit_fcfa"
        `);
    await queryRunner.query(`
            ALTER TABLE "customers"
            DROP COLUMN IF EXISTS "payment_term_days",
            DROP COLUMN IF EXISTS "credit_limit_fcfa"
        `);
  }
}
