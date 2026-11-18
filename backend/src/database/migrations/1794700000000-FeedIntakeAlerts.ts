import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Feed intake alerts: the CONSOMMATION_ALIMENT alert kind (feed per bird
 * dropping, or under the breed standard). The reference constants
 * (FEED_DROP_CRITICAL_PCT, FEED_STANDARD_DEVIATION_WARN_PCT, THI_*) and the
 * `feed-intake-1` rule_registry row are inserted at boot by the seed (missing
 * keys only): PostgreSQL cannot use a freshly added enum value inside the
 * transaction that adds it, so the rule row is not inserted here.
 */
export class FeedIntakeAlerts1794700000000 implements MigrationInterface {
  name = 'FeedIntakeAlerts1794700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Appended in place (same approach as STOCK_NEGATIF).
    await queryRunner.query(`
            ALTER TYPE "public"."rule_registry_kind_enum" ADD VALUE IF NOT EXISTS 'CONSOMMATION_ALIMENT'
        `);
    await queryRunner.query(`
            ALTER TYPE "public"."alerts_kind_enum" ADD VALUE IF NOT EXISTS 'CONSOMMATION_ALIMENT'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // CONSOMMATION_ALIMENT stays in the alert kind enums (PostgreSQL cannot drop an enum value).
    await queryRunner.query(`
            DELETE FROM "rule_registry" WHERE "code" = 'feed-intake-1'
        `);
  }
}
