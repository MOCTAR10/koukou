import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * POUFA lot A (sante), CDC §5.2 n° 22-23: the treatment register gets its end
 * date, reason, animal count and the PRODUIT_TRAITEMENT code; a vaccination
 * gets its animal count at completion. Both take an offline idempotency key
 * (unique per farm). Seeds nothing: the PRODUIT_TRAITEMENT list stays empty
 * until the veterinary services fill it (initial setup, CDC §9).
 *
 * Both tables are already journaled (AuditJournal: `treatment_records`,
 * `prophylaxis_events`): the row trigger covers the new columns.
 */
export class SanitaryConformity1794000300000 implements MigrationInterface {
    name = 'SanitaryConformity1794000300000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "treatment_records"
            ADD "product_code" character varying(60)
        `);
        await queryRunner.query(`
            ALTER TABLE "treatment_records"
            ADD "end_date" date
        `);
        await queryRunner.query(`
            ALTER TABLE "treatment_records"
            ADD "reason" character varying(500)
        `);
        await queryRunner.query(`
            ALTER TABLE "treatment_records"
            ADD "animal_count" integer
        `);
        await queryRunner.query(`
            ALTER TABLE "treatment_records"
            ADD "idempotency_key" character varying(120)
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_treatment_records_farm_idempotency" ON "treatment_records" ("farm_id", "idempotency_key")
            WHERE "idempotency_key" IS NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "prophylaxis_events"
            ADD "animal_count" integer
        `);
        await queryRunner.query(`
            ALTER TABLE "prophylaxis_events"
            ADD "idempotency_key" character varying(120)
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_prophylaxis_events_farm_idempotency" ON "prophylaxis_events" ("farm_id", "idempotency_key")
            WHERE "idempotency_key" IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."UQ_prophylaxis_events_farm_idempotency"
        `);
        await queryRunner.query(`
            ALTER TABLE "prophylaxis_events" DROP COLUMN "idempotency_key"
        `);
        await queryRunner.query(`
            ALTER TABLE "prophylaxis_events" DROP COLUMN "animal_count"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_treatment_records_farm_idempotency"
        `);
        await queryRunner.query(`
            ALTER TABLE "treatment_records" DROP COLUMN "idempotency_key"
        `);
        await queryRunner.query(`
            ALTER TABLE "treatment_records" DROP COLUMN "animal_count"
        `);
        await queryRunner.query(`
            ALTER TABLE "treatment_records" DROP COLUMN "reason"
        `);
        await queryRunner.query(`
            ALTER TABLE "treatment_records" DROP COLUMN "end_date"
        `);
        await queryRunner.query(`
            ALTER TABLE "treatment_records" DROP COLUMN "product_code"
        `);
    }
}
