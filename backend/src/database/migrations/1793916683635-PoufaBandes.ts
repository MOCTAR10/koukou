import { MigrationInterface, QueryRunner } from "typeorm";

/** POUFA tables journaled from their creation (before/after rows). */
const JOURNALED = [
    'sorties',
    'bande_snapshots',
    'sync_conflicts',
    'sync_clock_samples',
];

/**
 * Lot L3 « Bande POUFA et indicateurs »: band number (immutable), J+x
 * opening, weighing sample, sorties, frozen bilans (immutable), daily
 * projection, offline conflicts and clock samples.
 */
export class PoufaBandes1793916683635 implements MigrationInterface {
    name = 'PoufaBandes1793916683635'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "sync_conflicts" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "batch_id" uuid,
                "entity_type" character varying(30) NOT NULL,
                "entity_id" uuid NOT NULL,
                "entity_label" character varying(80),
                "field" character varying(40) NOT NULL,
                "winner" character varying(10) NOT NULL,
                "server_value" jsonb,
                "incoming_value" jsonb,
                "server_captured_at" TIMESTAMP WITH TIME ZONE,
                "server_user_id" uuid,
                "server_device_id" character varying(80),
                "incoming_captured_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "incoming_captured_at_raw" TIMESTAMP WITH TIME ZONE,
                "incoming_user_id" uuid,
                "incoming_device_id" character varying(80),
                "clock_skew_ms" double precision,
                "clock_corrected" boolean NOT NULL DEFAULT false,
                "notified_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_351e71cb6c48c898e6cb7fb5347" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_sync_conflicts_entity" ON "sync_conflicts" ("entity_type", "entity_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_sync_conflicts_farm_created" ON "sync_conflicts" ("farm_id", "created_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "sync_clock_samples" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid,
                "farm_id" uuid,
                "device_id" character varying(80),
                "device_time" TIMESTAMP WITH TIME ZONE NOT NULL,
                "server_time" TIMESTAMP WITH TIME ZONE NOT NULL,
                "skew_ms" double precision NOT NULL,
                "corrected" boolean NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_7ad00bab613846d206440575b7e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_sync_clock_samples_user_created" ON "sync_clock_samples" ("user_id", "created_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "bande_daily_stats" (
                "batch_id" uuid NOT NULL,
                "day" date NOT NULL,
                "farm_id" uuid NOT NULL,
                "program_id" uuid NOT NULL,
                "age_days" integer NOT NULL,
                "present_start" integer NOT NULL,
                "deaths" integer NOT NULL,
                "mortality_day_pct" double precision,
                "deaths_cumulative" integer NOT NULL,
                "removals" integer NOT NULL,
                "removals_cumulative" integer NOT NULL,
                "present" integer NOT NULL,
                "feed_kg" double precision NOT NULL,
                "feed_cumulative_kg" double precision NOT NULL,
                "last_weight_g" double precision,
                "weighed" boolean NOT NULL,
                "sample_size" integer,
                "entry_done" boolean NOT NULL,
                "catch_up" boolean NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_59394a9d56d6b4a910d747c0968" PRIMARY KEY ("batch_id", "day")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_bande_daily_stats_program_day" ON "bande_daily_stats" ("program_id", "day")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_bande_daily_stats_farm_day" ON "bande_daily_stats" ("farm_id", "day")
        `);
        await queryRunner.query(`
            CREATE TABLE "sorties" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "batch_id" uuid NOT NULL,
                "sortie_date" date NOT NULL,
                "count" integer NOT NULL,
                "weight_kg" double precision,
                "reason_code" character varying(40) NOT NULL,
                "reason_family" character varying(20) NOT NULL,
                "recipient_name" character varying(160),
                "recipient_phone" character varying(40),
                "operator_id" uuid,
                "unit_price_fcfa" integer,
                "price_unit" character varying(10),
                "sale_id" uuid,
                "slaughter_order_id" uuid,
                "notes" text,
                "idempotency_key" character varying(120),
                "captured_at" TIMESTAMP WITH TIME ZONE,
                "clock_corrected" boolean NOT NULL DEFAULT false,
                "created_by_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_1f936e21913190a2d03825ab465" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_7a65bf82a7e87a7bba34c555e5" ON "sorties" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_sorties_farm_idempotency" ON "sorties" ("farm_id", "idempotency_key")
            WHERE "idempotency_key" IS NOT NULL
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_sorties_batch_date" ON "sorties" ("batch_id", "sortie_date")
        `);
        await queryRunner.query(`
            CREATE TABLE "bande_snapshots" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "batch_id" uuid NOT NULL,
                "farm_id" uuid NOT NULL,
                "version" integer NOT NULL,
                "trigger" character varying(20) NOT NULL,
                "reason" text,
                "as_of" date NOT NULL,
                "duration_days" integer NOT NULL,
                "age_days" integer NOT NULL,
                "variables" jsonb NOT NULL,
                "indicators" jsonb NOT NULL,
                "revenue_fcfa" integer,
                "charges_fcfa" integer,
                "margin_fcfa" integer,
                "completeness_pct" double precision,
                "created_by_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_b9ad4c478a9ae5ab80b06cd63f8" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_3cd5dd755a06f29e75a6884f61" ON "bande_snapshots" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_bande_snapshots_batch_version" ON "bande_snapshots" ("batch_id", "version")
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches"
            ADD "code" character varying(40)
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches"
            ADD "initial_age_days" integer
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches"
            ADD "initial_avg_weight_g" double precision
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches"
            ADD "reference_duration_days" integer
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches"
            ADD "closure_kind" character varying(10)
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches"
            ADD "weighing_late_notified_on" date
        `);
        await queryRunner.query(`
            ALTER TABLE "daily_entries"
            ADD "sample_size" integer
        `);
        await queryRunner.query(`
            ALTER TABLE "daily_entries"
            ADD "catch_up" boolean NOT NULL DEFAULT false
        `);
        await queryRunner.query(`
            ALTER TABLE "daily_entries"
            ADD "captured_at" TIMESTAMP WITH TIME ZONE
        `);
        await queryRunner.query(`
            ALTER TABLE "daily_entries"
            ADD "field_sync" jsonb
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_production_batches_code" ON "production_batches" ("code")
        `);
        await queryRunner.query(`
            ALTER TABLE "sorties"
            ADD CONSTRAINT "FK_65694c4d61f5287acc66ddfd371" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "bande_snapshots"
            ADD CONSTRAINT "FK_3c2ac642ecb57bb36855da1b431" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        // Hand-written (TypeORM does not track triggers, migration:check
        // ignores them). A band number never changes once handed out.
        await queryRunner.query(`
            CREATE FUNCTION "production_batches_code_immutable"() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                IF OLD.code IS NOT NULL AND NEW.code IS DISTINCT FROM OLD.code THEN
                    RAISE EXCEPTION 'Le numéro d''une bande ne peut pas être modifié.';
                END IF;
                RETURN NEW;
            END
            $$
        `);
        await queryRunner.query(`
            CREATE TRIGGER "production_batches_code_immutable"
            BEFORE UPDATE OF code ON "production_batches"
            FOR EACH ROW EXECUTE FUNCTION "production_batches_code_immutable"()
        `);
        // A frozen bilan is never rewritten: a correction adds a version.
        await queryRunner.query(`
            CREATE FUNCTION "bande_snapshots_immutable"() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION 'Un bilan de bande figé ne peut être ni modifié ni supprimé : une correction ajoute une nouvelle version.';
            END
            $$
        `);
        await queryRunner.query(`
            CREATE TRIGGER "bande_snapshots_immutable"
            BEFORE UPDATE OR DELETE ON "bande_snapshots"
            FOR EACH ROW EXECUTE FUNCTION "bande_snapshots_immutable"()
        `);
        // Journal (AuditJournal). `bande_daily_stats` is left out on purpose:
        // a derived projection, rebuilt from journaled rows (like id_counters).
        for (const table of JOURNALED) {
            await queryRunner.query(`SELECT audit_attach($1::regclass, 'id')`, [
                table,
            ]);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const table of JOURNALED) {
            await queryRunner.query(`SELECT audit_detach($1::regclass)`, [
                table,
            ]);
        }
        await queryRunner.query(`
            DROP TRIGGER "bande_snapshots_immutable" ON "bande_snapshots"
        `);
        await queryRunner.query(`
            DROP FUNCTION "bande_snapshots_immutable"()
        `);
        await queryRunner.query(`
            DROP TRIGGER "production_batches_code_immutable" ON "production_batches"
        `);
        await queryRunner.query(`
            DROP FUNCTION "production_batches_code_immutable"()
        `);
        await queryRunner.query(`
            ALTER TABLE "bande_snapshots" DROP CONSTRAINT "FK_3c2ac642ecb57bb36855da1b431"
        `);
        await queryRunner.query(`
            ALTER TABLE "sorties" DROP CONSTRAINT "FK_65694c4d61f5287acc66ddfd371"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_production_batches_code"
        `);
        await queryRunner.query(`
            ALTER TABLE "daily_entries" DROP COLUMN "field_sync"
        `);
        await queryRunner.query(`
            ALTER TABLE "daily_entries" DROP COLUMN "captured_at"
        `);
        await queryRunner.query(`
            ALTER TABLE "daily_entries" DROP COLUMN "catch_up"
        `);
        await queryRunner.query(`
            ALTER TABLE "daily_entries" DROP COLUMN "sample_size"
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches" DROP COLUMN "weighing_late_notified_on"
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches" DROP COLUMN "closure_kind"
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches" DROP COLUMN "reference_duration_days"
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches" DROP COLUMN "initial_avg_weight_g"
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches" DROP COLUMN "initial_age_days"
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches" DROP COLUMN "code"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_bande_snapshots_batch_version"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_3cd5dd755a06f29e75a6884f61"
        `);
        await queryRunner.query(`
            DROP TABLE "bande_snapshots"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_sorties_batch_date"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_sorties_farm_idempotency"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_7a65bf82a7e87a7bba34c555e5"
        `);
        await queryRunner.query(`
            DROP TABLE "sorties"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_bande_daily_stats_farm_day"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_bande_daily_stats_program_day"
        `);
        await queryRunner.query(`
            DROP TABLE "bande_daily_stats"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_sync_clock_samples_user_created"
        `);
        await queryRunner.query(`
            DROP TABLE "sync_clock_samples"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_sync_conflicts_farm_created"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_sync_conflicts_entity"
        `);
        await queryRunner.query(`
            DROP TABLE "sync_conflicts"
        `);
    }

}
