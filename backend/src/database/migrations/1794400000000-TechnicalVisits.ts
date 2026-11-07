import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * POUFA visites techniques et biosécurité (CDC n° 45 « visites », n° 27
 * « contrôles de biosécurité », §3.2 visa de l'agent technique):
 * - `farm_visits` (visit of an agent to a farm, optionally about one band,
 *   with biosecurity score/class and the visa period) and
 *   `farm_visit_answers` (the grid answers, criterion label/weight copied);
 * - list type CRITERE_BIOSECURITE (the biosecurity grid, managed by the
 *   veterinary services; default criteria seeded at boot, never overwritten).
 *   Appended in place to the enum, like the other lots' values (an enum value
 *   cannot be dropped: `down` leaves it);
 * - both tables are journaled (row trigger). The parameters
 *   BIOSECURITE_SEUIL_A_PCT / _B_PCT are seeded at boot from the catalog.
 * No rights migration: the agent already holds TECHNIQUE:VALIDER, the DGE
 * TECHNIQUE:CONSULTER and the veterinary profile SANITAIRE:CONSULTER.
 */
export class TechnicalVisits1794400000000 implements MigrationInterface {
    name = 'TechnicalVisits1794400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TYPE "public"."ref_items_list_type_enum" ADD VALUE IF NOT EXISTS 'CRITERE_BIOSECURITE'
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."farm_visits_type_enum" AS ENUM('TECHNIQUE', 'BIOSECURITE', 'SANITAIRE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."farm_visits_classification_enum" AS ENUM('A', 'B', 'C')
        `);
        await queryRunner.query(`
            CREATE TABLE "farm_visits" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "batch_id" uuid,
                "visit_date" date NOT NULL,
                "type" "public"."farm_visits_type_enum" NOT NULL,
                "agent_user_id" uuid NOT NULL,
                "observations" text,
                "recommendations" text,
                "latitude" double precision,
                "longitude" double precision,
                "next_visit_date" date,
                "visa_from" date,
                "visa_to" date,
                "score_pct" numeric(5, 1),
                "classification" "public"."farm_visits_classification_enum",
                "thresholds" jsonb,
                "captured_at" TIMESTAMP WITH TIME ZONE,
                "idempotency_key" character varying(120),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_da1c4feaf3689c493fc38441cfb" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_farm_visits_farm_idempotency" ON "farm_visits" ("farm_id", "idempotency_key")
            WHERE "idempotency_key" IS NOT NULL
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_farm_visits_batch" ON "farm_visits" ("batch_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_farm_visits_farm_date" ON "farm_visits" ("farm_id", "visit_date")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."farm_visit_answers_answer_enum" AS ENUM('CONFORME', 'NON_CONFORME', 'NA')
        `);
        await queryRunner.query(`
            CREATE TABLE "farm_visit_answers" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "visit_id" uuid NOT NULL,
                "criterion_code" character varying(40) NOT NULL,
                "criterion_label" character varying NOT NULL,
                "criterion_category" character varying,
                "weight" integer NOT NULL,
                "answer" "public"."farm_visit_answers_answer_enum" NOT NULL,
                "comment" character varying(500),
                CONSTRAINT "PK_9d58b781e1f676182c17d492496" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_farm_visit_answers_visit_criterion" ON "farm_visit_answers" ("visit_id", "criterion_code")
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_visits"
            ADD CONSTRAINT "FK_7ddcead150359c5c4dfcca7a338" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_visits"
            ADD CONSTRAINT "FK_997b9a5517baf29dda40c44cb1a" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_visits"
            ADD CONSTRAINT "FK_4a875500ec7ba06fe13fbd53804" FOREIGN KEY ("agent_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_visit_answers"
            ADD CONSTRAINT "FK_ae4d225a672b85ab968964e27a6" FOREIGN KEY ("visit_id") REFERENCES "farm_visits"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        for (const table of ['farm_visits', 'farm_visit_answers']) {
            await queryRunner.query(`SELECT audit_attach($1::regclass, 'id')`, [
                table,
            ]);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const table of ['farm_visit_answers', 'farm_visits']) {
            await queryRunner.query(`SELECT audit_detach($1::regclass)`, [
                table,
            ]);
        }
        await queryRunner.query(`
            ALTER TABLE "farm_visit_answers" DROP CONSTRAINT "FK_ae4d225a672b85ab968964e27a6"
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_visits" DROP CONSTRAINT "FK_4a875500ec7ba06fe13fbd53804"
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_visits" DROP CONSTRAINT "FK_997b9a5517baf29dda40c44cb1a"
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_visits" DROP CONSTRAINT "FK_7ddcead150359c5c4dfcca7a338"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_farm_visit_answers_visit_criterion"
        `);
        await queryRunner.query(`
            DROP TABLE "farm_visit_answers"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."farm_visit_answers_answer_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_farm_visits_farm_date"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_farm_visits_batch"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_farm_visits_farm_idempotency"
        `);
        await queryRunner.query(`
            DROP TABLE "farm_visits"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."farm_visits_classification_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."farm_visits_type_enum"
        `);
    }
}
