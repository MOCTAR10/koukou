import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Jury lot 3 — display mode of an account: `users.ui_mode` SIMPLE (big
 * pictograms, data entry only) or COMPLET (the whole application). The column
 * default is COMPLET, so buyers, institutions and admins are unaffected.
 *
 * Existing accounts: SIMPLE for the farm staff whose every active farm link is
 * an ELEVEUR link, and for the exploitants (PROPRIETAIRE) owning at least one
 * farm; everything else stays COMPLET.
 */
export class UserUiMode1794800000000 implements MigrationInterface {
    name = 'UserUiMode1794800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."users_ui_mode_enum" AS ENUM('SIMPLE', 'COMPLET')
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
                ADD "ui_mode" "public"."users_ui_mode_enum" NOT NULL DEFAULT 'COMPLET'
        `);
        await queryRunner.query(`
            UPDATE "users" u SET "ui_mode" = 'SIMPLE'
             WHERE u."role" = 'ELEVEUR'
               AND EXISTS (
                   SELECT 1 FROM "farm_employees" e
                    WHERE e."user_id" = u."id" AND e."active" = true)
               AND NOT EXISTS (
                   SELECT 1 FROM "farm_employees" e
                    WHERE e."user_id" = u."id" AND e."active" = true
                      AND e."role" <> 'ELEVEUR')
        `);
        await queryRunner.query(`
            UPDATE "users" u SET "ui_mode" = 'SIMPLE'
             WHERE u."role" = 'PROPRIETAIRE'
               AND EXISTS (SELECT 1 FROM "farms" f WHERE f."owner_id" = u."id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "ui_mode"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."users_ui_mode_enum"
        `);
    }
}
