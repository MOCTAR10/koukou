import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * POUFA lot A2 sante, CDC §5.2 n° 22-23. A planned care remembers whether it
 * is a step of the vets' reference calendar (`is_reference`: the farm can
 * postpone it, never cancel or delete it), its first planned date once
 * postponed (`original_date`: a reference step stays late from it), and the
 * PRODUIT_TRAITEMENT code of a manual medication care (`product_code`).
 *
 * Backfill: cares already planned from a shared reference protocol
 * (`is_default`, no farm) become reference steps. Seeds nothing else; the
 * PRODUIT_TRAITEMENT list stays empty until the veterinary services fill it.
 * `prophylaxis_events` is journaled (AuditJournal): the row trigger covers the
 * new columns.
 */
export class CareReferenceCalendar1794100100000 implements MigrationInterface {
    name = 'CareReferenceCalendar1794100100000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "prophylaxis_events"
            ADD "is_reference" boolean NOT NULL DEFAULT false
        `);
        await queryRunner.query(`
            ALTER TABLE "prophylaxis_events"
            ADD "original_date" date
        `);
        await queryRunner.query(`
            ALTER TABLE "prophylaxis_events"
            ADD "product_code" character varying(60)
        `);
        await queryRunner.query(`
            UPDATE "prophylaxis_events" e
            SET "is_reference" = true
            FROM "protocol_steps" s
            JOIN "sanitary_protocols" p ON p."id" = s."protocol_id"
            WHERE s."id" = e."protocol_step_id"
              AND p."is_default" = true
              AND p."farm_id" IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "prophylaxis_events" DROP COLUMN "product_code"
        `);
        await queryRunner.query(`
            ALTER TABLE "prophylaxis_events" DROP COLUMN "original_date"
        `);
        await queryRunner.query(`
            ALTER TABLE "prophylaxis_events" DROP COLUMN "is_reference"
        `);
    }
}
