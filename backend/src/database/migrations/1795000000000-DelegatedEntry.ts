import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Jury lot 5 — data entered on behalf of a farm by a technical agent of the
 * programme. `daily_entries.entered_on_behalf` and `health_events.entered_on_behalf`
 * are set by the server when the author is an INSTITUTION account.
 *
 * Matrix patch (hand-written): the AGENT_TECHNIQUE system profile gets
 * TECHNIQUE:CREER (daily entries, farm code `saisie:creer`) and
 * SANITAIRE:CREER (health declarations, farm code `sanitaire:signaler`). Only
 * these two actions are appended when missing; every other cell, customised
 * or not, is kept. The administration can remove them in the matrix editor.
 */
export class DelegatedEntry1795000000000 implements MigrationInterface {
    name = 'DelegatedEntry1795000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "daily_entries"
                ADD "entered_on_behalf" boolean NOT NULL DEFAULT false
        `);
        await queryRunner.query(`
            ALTER TABLE "health_events"
                ADD "entered_on_behalf" boolean NOT NULL DEFAULT false
        `);
        await queryRunner.query(`
            UPDATE "access_profiles"
               SET "matrix" = jsonb_set(
                     jsonb_set(COALESCE("matrix", '{}'::jsonb), '{TECHNIQUE}',
                       COALESCE("matrix"->'TECHNIQUE', '[]'::jsonb)
                       || CASE WHEN COALESCE("matrix"->'TECHNIQUE', '[]'::jsonb) ? 'CREER'
                               THEN '[]'::jsonb ELSE '["CREER"]'::jsonb END),
                     '{SANITAIRE}',
                     COALESCE("matrix"->'SANITAIRE', '[]'::jsonb)
                     || CASE WHEN COALESCE("matrix"->'SANITAIRE', '[]'::jsonb) ? 'CREER'
                             THEN '[]'::jsonb ELSE '["CREER"]'::jsonb END),
                   "updated_at" = now()
             WHERE "code" = 'AGENT_TECHNIQUE' AND "system" = true
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "access_profiles"
               SET "matrix" = jsonb_set(
                     jsonb_set("matrix", '{TECHNIQUE}',
                       COALESCE("matrix"->'TECHNIQUE', '[]'::jsonb) - 'CREER'),
                     '{SANITAIRE}',
                     COALESCE("matrix"->'SANITAIRE', '[]'::jsonb) - 'CREER'),
                   "updated_at" = now()
             WHERE "code" = 'AGENT_TECHNIQUE' AND "system" = true
               AND "matrix" IS NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "health_events" DROP COLUMN "entered_on_behalf"
        `);
        await queryRunner.query(`
            ALTER TABLE "daily_entries" DROP COLUMN "entered_on_behalf"
        `);
    }
}
