import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Jury lot 1 — technical itinerary and feed data:
 * - `breed_standards.target_daily_feed_g`: target feed per bird per day (g),
 *   derived for the rows already there from the weight x cumulative FCR
 *   targets: daily(w) = (cum(w) - cum(previous week)) / days x 1000, week 1
 *   starting from 0; null when weight or FCR is missing or the result is not
 *   positive. Same rule as `breeds/derive-daily-feed.ts` (used by the seed
 *   for fresh databases). Indicative values, to be validated by the DGE;
 * - `technical_itinerary_steps`: itinéraire technique by age (feed phases
 *   and qualitative practice steps), reference data journaled like the
 *   programme lists. The default steps are seeded at boot, never overwritten;
 * - `feed_products`: optional manufacturer, label protein / energy and the
 *   manufacturer's authorisation reference (décret n° 0190/PR/MAA, art. 19).
 */
export class TechnicalItinerary1794620000000 implements MigrationInterface {
    name = 'TechnicalItinerary1794620000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "breed_standards" ADD "target_daily_feed_g" double precision
        `);
        await queryRunner.query(`
            WITH cum AS (
                SELECT
                    "id",
                    "week",
                    "target_avg_weight_kg" * "target_fcr" AS "cum",
                    LAG("week") OVER w AS "prev_week",
                    LAG("target_avg_weight_kg" * "target_fcr") OVER w AS "prev_cum",
                    (ROW_NUMBER() OVER w) = 1 AS "is_first"
                FROM "breed_standards"
                WINDOW w AS (PARTITION BY "breed_id" ORDER BY "week")
            ),
            daily AS (
                SELECT
                    "id",
                    ROUND((
                        ("cum" - CASE WHEN "is_first" THEN 0 ELSE "prev_cum" END)
                        / NULLIF(("week" - CASE WHEN "is_first" THEN 0 ELSE "prev_week" END) * 7, 0)
                        * 1000
                    )::numeric, 1) AS "grams"
                FROM cum
                WHERE "cum" IS NOT NULL
            )
            UPDATE "breed_standards" b
            SET "target_daily_feed_g" = daily."grams"
            FROM daily
            WHERE daily."id" = b."id" AND daily."grams" > 0
        `);

        await queryRunner.query(`
            CREATE TYPE "public"."technical_itinerary_steps_species_enum" AS ENUM(
                'POULET',
                'DINDE',
                'PINTADE',
                'CAILLE',
                'CANARD',
                'OIE',
                'FAISAN',
                'AUTRE'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."technical_itinerary_steps_production_type_enum" AS ENUM('CHAIR', 'PONDEUSE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."technical_itinerary_steps_feed_phase_enum" AS ENUM(
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
            CREATE TYPE "public"."technical_itinerary_steps_category_enum" AS ENUM(
                'ALIMENTATION',
                'ABREUVEMENT',
                'AMBIANCE',
                'PESEE',
                'BIOSECURITE',
                'SANITAIRE'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "technical_itinerary_steps" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "species" "public"."technical_itinerary_steps_species_enum" NOT NULL,
                "production_type" "public"."technical_itinerary_steps_production_type_enum" NOT NULL,
                "day_from" integer NOT NULL,
                "day_to" integer,
                "feed_phase" "public"."technical_itinerary_steps_feed_phase_enum",
                "title" character varying(160) NOT NULL,
                "instructions" text NOT NULL,
                "category" "public"."technical_itinerary_steps_category_enum" NOT NULL,
                "legal_ref" character varying(40),
                "sort" integer NOT NULL DEFAULT '0',
                "active" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_c684ebee312d1e8d2bf93be6325" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_technical_itinerary_steps_scope" ON "technical_itinerary_steps" ("species", "production_type", "day_from")
        `);
        await queryRunner.query(`SELECT audit_attach('technical_itinerary_steps'::regclass, 'id')`);

        await queryRunner.query(`
            ALTER TABLE "feed_products"
                ADD "manufacturer" character varying(120),
                ADD "protein_pct" double precision,
                ADD "energy_kcal_kg" double precision,
                ADD "authorized_ref" character varying(80)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "feed_products"
                DROP COLUMN "authorized_ref",
                DROP COLUMN "energy_kcal_kg",
                DROP COLUMN "protein_pct",
                DROP COLUMN "manufacturer"
        `);
        await queryRunner.query(`SELECT audit_detach('technical_itinerary_steps'::regclass)`);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_technical_itinerary_steps_scope"
        `);
        await queryRunner.query(`
            DROP TABLE "technical_itinerary_steps"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."technical_itinerary_steps_category_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."technical_itinerary_steps_feed_phase_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."technical_itinerary_steps_production_type_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."technical_itinerary_steps_species_enum"
        `);
        await queryRunner.query(`
            ALTER TABLE "breed_standards" DROP COLUMN "target_daily_feed_g"
        `);
    }
}
