import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Jury lot 1 — vaccine catalogue and one reference calendar per species/type:
 * - list type VACCIN (generic vaccine catalogue of the veterinary services,
 *   seeded at boot by `ProgrammeSeedService`, never here: a value added to an
 *   enum cannot be used inside the transaction that adds it). Appended in
 *   place (a value cannot be dropped: `down` leaves it);
 * - `protocol_steps.vaccine_code`: the VACCIN item a calendar step gives;
 * - the Gabon programmes (`vacc-*-gabon`, shared) become the reference
 *   calendar (`is_default`, editable by the vets) of their species and type,
 *   and the seeded `proto-*-standard` ones stop being default. Rows are kept:
 *   bands already planned keep their cares (`protocol_step_id`). A reference
 *   the vets designated themselves (any other shared default) is left alone.
 */
export class VaccineCatalogue1794610000000 implements MigrationInterface {
    name = 'VaccineCatalogue1794610000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TYPE "public"."ref_items_list_type_enum" ADD VALUE IF NOT EXISTS 'VACCIN'
        `);
        await queryRunner.query(`
            ALTER TABLE "protocol_steps" ADD "vaccine_code" character varying(40)
        `);

        // Gabon programme = reference, unless the vets designated another one.
        await queryRunner.query(`
            UPDATE "sanitary_protocols" g
            SET "is_default" = true, "is_editable" = true
            WHERE g."farm_id" IS NULL
              AND g."code" LIKE 'vacc-%-gabon'
              AND g."is_default" = false
              AND NOT EXISTS (
                SELECT 1 FROM "sanitary_protocols" d
                WHERE d."farm_id" IS NULL
                  AND d."is_default" = true
                  AND d."species" = g."species"
                  AND d."type" = g."type"
                  AND d."code" NOT IN ('proto-poulet-chair-standard', 'proto-poule-pondeuse-standard')
              )
        `);
        // One reference per species and type: the seeded standards step down.
        await queryRunner.query(`
            UPDATE "sanitary_protocols" s
            SET "is_default" = false
            WHERE s."farm_id" IS NULL
              AND s."code" IN ('proto-poulet-chair-standard', 'proto-poule-pondeuse-standard')
              AND s."is_default" = true
              AND EXISTS (
                SELECT 1 FROM "sanitary_protocols" o
                WHERE o."farm_id" IS NULL
                  AND o."is_default" = true
                  AND o."species" = s."species"
                  AND o."type" = s."type"
                  AND o."id" <> s."id"
              )
        `);

        // Catalogue vaccine of each catalogue step (mirrors GABON_VACCINE_CODES
        // in database-seed.service.ts). Free-text steps stay as they are.
        await queryRunner.query(`
            UPDATE "protocol_steps" st
            SET "vaccine_code" = m.vaccine
            FROM "sanitary_protocols" p,
                 (VALUES
                    ('vacc-poulet-chair-gabon', 1, 'MAREK'),
                    ('vacc-poulet-chair-gabon', 2, 'NEWCASTLE_BRONCHITE'),
                    ('vacc-poulet-chair-gabon', 3, 'GUMBORO'),
                    ('vacc-poulet-chair-gabon', 4, 'GUMBORO'),
                    ('vacc-poulet-chair-gabon', 5, 'NEWCASTLE_BRONCHITE'),
                    ('vacc-poulet-chair-gabon', 6, 'NEWCASTLE_VIVANT'),
                    ('vacc-poule-pondeuse-gabon', 1, 'MAREK'),
                    ('vacc-poule-pondeuse-gabon', 2, 'NEWCASTLE_BRONCHITE'),
                    ('vacc-poule-pondeuse-gabon', 3, 'GUMBORO'),
                    ('vacc-poule-pondeuse-gabon', 4, 'NEWCASTLE_BRONCHITE'),
                    ('vacc-poule-pondeuse-gabon', 5, 'GUMBORO'),
                    ('vacc-poule-pondeuse-gabon', 6, 'VARIOLE_AVIAIRE'),
                    ('vacc-poule-pondeuse-gabon', 7, 'NEWCASTLE_BRONCHITE'),
                    ('vacc-poule-pondeuse-gabon', 11, 'NEWCASTLE_VIVANT')
                 ) AS m("code", "step_order", "vaccine")
            WHERE st."protocol_id" = p."id"
              AND p."farm_id" IS NULL
              AND p."code" = m."code"
              AND st."step_order" = m."step_order"
              AND st."care_type" = 'VACCIN'
              AND st."vaccine_code" IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // The reference switch is data, left as is (rolling it back would
        // leave bands without a calendar); only the column goes.
        await queryRunner.query(`
            ALTER TABLE "protocol_steps" DROP COLUMN "vaccine_code"
        `);
    }
}
