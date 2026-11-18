import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Jury lot 1 — sourced reference data:
 * - list types MALADIE (disease catalogue; family DECLARATION_OBLIGATOIRE =
 *   diseases « réputées contagieuses » of loi n° 2/65) and TEXTE_REFERENCE
 *   (Gabonese legal texts the reference data cites). Both are managed by the
 *   veterinary services; default items are seeded at boot, never overwritten.
 *   Appended in place to the enum (a value cannot be dropped: `down` leaves
 *   them);
 * - `health_events.disease_code`: the catalogue code of a declared disease.
 */
export class DiseaseCatalogue1794600000000 implements MigrationInterface {
    name = 'DiseaseCatalogue1794600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TYPE "public"."ref_items_list_type_enum" ADD VALUE IF NOT EXISTS 'MALADIE'
        `);
        await queryRunner.query(`
            ALTER TYPE "public"."ref_items_list_type_enum" ADD VALUE IF NOT EXISTS 'TEXTE_REFERENCE'
        `);
        await queryRunner.query(`
            ALTER TABLE "health_events" ADD "disease_code" character varying(40)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "health_events" DROP COLUMN "disease_code"
        `);
    }
}
