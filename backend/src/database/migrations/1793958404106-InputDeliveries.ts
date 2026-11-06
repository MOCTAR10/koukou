import { MigrationInterface, QueryRunner } from "typeorm";

/** Programme input deliveries (POUFA L4). */
const JOURNALED = ['input_deliveries', 'input_delivery_lines'];

export class InputDeliveries1793958404106 implements MigrationInterface {
    name = 'InputDeliveries1793958404106'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."input_deliveries_source_enum" AS ENUM('ETAT_SMAG', 'AUTRE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."input_deliveries_status_enum" AS ENUM('EXPEDIEE', 'CONFIRMEE', 'ANNULEE')
        `);
        await queryRunner.query(`
            CREATE TABLE "input_deliveries" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "code" character varying(60) NOT NULL,
                "farm_id" uuid NOT NULL,
                "band_id" uuid,
                "source" "public"."input_deliveries_source_enum" NOT NULL,
                "supplier_name" character varying(160),
                "status" "public"."input_deliveries_status_enum" NOT NULL DEFAULT 'EXPEDIEE',
                "shipped_at" date NOT NULL,
                "received_date" date,
                "confirmed_at" TIMESTAMP WITH TIME ZONE,
                "confirmed_by_id" uuid,
                "confirm_idempotency_key" character varying(120),
                "has_discrepancy" boolean NOT NULL DEFAULT false,
                "cancelled_at" TIMESTAMP WITH TIME ZONE,
                "cancelled_by_id" uuid,
                "cancel_reason" text,
                "notes" text,
                "created_by_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_48c141837ae10902ea9e1b28c72" UNIQUE ("code"),
                CONSTRAINT "PK_78a976b45be35bf736a61e0dd16" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_input_deliveries_farm_confirm_key" ON "input_deliveries" ("farm_id", "confirm_idempotency_key")
            WHERE "confirm_idempotency_key" IS NOT NULL
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_input_deliveries_status_shipped" ON "input_deliveries" ("status", "shipped_at")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_input_deliveries_farm_status" ON "input_deliveries" ("farm_id", "status")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."input_delivery_lines_feed_phase_enum" AS ENUM(
                'POUSSIN',
                'DEMARRAGE',
                'CROISSANCE',
                'PRE_PONTE',
                'PONTE_PHASE_1',
                'PONTE_PHASE_2',
                'PONTE_PHASE_3',
                'FINITION',
                'PERSONNALISE'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "input_delivery_lines" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "delivery_id" uuid NOT NULL,
                "position" integer NOT NULL,
                "intrant_code" character varying(40) NOT NULL,
                "intrant_family" character varying(20) NOT NULL,
                "unit_code" character varying(40) NOT NULL,
                "quantity" double precision NOT NULL,
                "feed_phase" "public"."input_delivery_lines_feed_phase_enum",
                "bag_size_kg" double precision,
                "subsidized" boolean NOT NULL DEFAULT false,
                "subsidy_rate" double precision,
                "unit_value_fcfa" integer,
                "supplier_lot_number" character varying(120),
                "expiration_date" date,
                "received_quantity" double precision,
                "discrepancy_reason" text,
                "farmer_cost_fcfa" integer,
                "subsidy_fcfa" integer,
                "input_lot_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_6bfda58c05a882e8b020e43f487" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_b3b3cf9d7c47f54f7af4347768" ON "input_delivery_lines" ("input_lot_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_input_delivery_lines_delivery" ON "input_delivery_lines" ("delivery_id", "position")
        `);
        // A new alert kind: appended in place rather than rebuilding both
        // enum types, so lots adding kinds in parallel merge cleanly.
        await queryRunner.query(`
            ALTER TYPE "public"."rule_registry_kind_enum" ADD VALUE IF NOT EXISTS 'STOCK_NEGATIF'
        `);
        await queryRunner.query(`
            ALTER TYPE "public"."alerts_kind_enum" ADD VALUE IF NOT EXISTS 'STOCK_NEGATIF'
        `);
        await queryRunner.query(`
            ALTER TABLE "input_deliveries"
            ADD CONSTRAINT "FK_9bd1b3d0547edb0be0599a9004b" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "input_deliveries"
            ADD CONSTRAINT "FK_fd9a4ebb204ae6f0510addd31e9" FOREIGN KEY ("band_id") REFERENCES "production_batches"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "input_delivery_lines"
            ADD CONSTRAINT "FK_e33769ad6cbe197154fab9ec23a" FOREIGN KEY ("delivery_id") REFERENCES "input_deliveries"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "input_delivery_lines"
            ADD CONSTRAINT "FK_b3b3cf9d7c47f54f7af4347768b" FOREIGN KEY ("input_lot_id") REFERENCES "input_lots"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        // Journal (AuditJournal): both are business tables.
        for (const table of JOURNALED) {
            await queryRunner.query(`SELECT audit_attach($1::regclass, 'id')`, [
                table,
            ]);
        }
        // The DGE records the deliveries: INTRANTS:CREER on the seeded system
        // profile of databases seeded before this lot (the seed never
        // rewrites a profile; new databases get it from the defaults).
        await queryRunner.query(`
            UPDATE "access_profiles"
            SET "matrix" = jsonb_set(
                "matrix",
                '{INTRANTS}',
                COALESCE("matrix"->'INTRANTS', '[]'::jsonb) || '["CREER"]'::jsonb
            )
            WHERE "code" = 'DGE' AND "system" = true
              AND NOT (COALESCE("matrix"->'INTRANTS', '[]'::jsonb) ? 'CREER')
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const table of JOURNALED) {
            await queryRunner.query(`SELECT audit_detach($1::regclass)`, [
                table,
            ]);
        }
        await queryRunner.query(`
            ALTER TABLE "input_delivery_lines" DROP CONSTRAINT "FK_b3b3cf9d7c47f54f7af4347768b"
        `);
        await queryRunner.query(`
            ALTER TABLE "input_delivery_lines" DROP CONSTRAINT "FK_e33769ad6cbe197154fab9ec23a"
        `);
        await queryRunner.query(`
            ALTER TABLE "input_deliveries" DROP CONSTRAINT "FK_fd9a4ebb204ae6f0510addd31e9"
        `);
        await queryRunner.query(`
            ALTER TABLE "input_deliveries" DROP CONSTRAINT "FK_9bd1b3d0547edb0be0599a9004b"
        `);
        // STOCK_NEGATIF stays in the alert kind enums (PostgreSQL cannot drop
        // an enum value); the DGE keeps INTRANTS:CREER (tunable profile).
        await queryRunner.query(`
            DROP INDEX "public"."IDX_input_delivery_lines_delivery"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_b3b3cf9d7c47f54f7af4347768"
        `);
        await queryRunner.query(`
            DROP TABLE "input_delivery_lines"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."input_delivery_lines_feed_phase_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_input_deliveries_farm_status"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_input_deliveries_status_shipped"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_input_deliveries_farm_confirm_key"
        `);
        await queryRunner.query(`
            DROP TABLE "input_deliveries"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."input_deliveries_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."input_deliveries_source_enum"
        `);
    }

}
