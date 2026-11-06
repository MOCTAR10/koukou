import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * POUFA lot A droits (hand-written):
 * - the DGE consults the Fermia bonus domains (caisse and sales, Market,
 *   SYSCOHADA accounting, team and HR) by default, user decision 2026-11-06;
 *   a key the admin already set on the system DGE profile is kept. The other
 *   profiles get nothing until the admin grants it (matrix screen).
 * - existing « Administrateur Fermia » links keep reading the State's input
 *   deliveries through the new farm code `intrants:lire` (ELEVEUR holds it by
 *   default in code);
 * - a farm already OPERATIONNELLE is verified for the Market (audit F8);
 * - the farm GPS history gets an offline replay key, unique per farm (A8).
 */
const DGE_FERMIA_GRANTS = {
  VENTES: ['CONSULTER'],
  MARCHE: ['CONSULTER'],
  COMPTABILITE: ['CONSULTER'],
  EQUIPE: ['CONSULTER'],
};

export class InstitutionFermiaGrants1794000500000 implements MigrationInterface {
  name = 'InstitutionFermiaGrants1794000500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "access_profiles"
          SET "matrix" = $1::jsonb || "matrix", "updated_at" = now()
        WHERE "code" = 'DGE' AND "system" = true`,
      [JSON.stringify(DGE_FERMIA_GRANTS)],
    );
    await queryRunner.query(`
            UPDATE "farm_employees"
               SET "permissions" = "permissions" || '["intrants:lire"]'::jsonb
             WHERE "role" = 'ADMIN'
               AND NOT ("permissions" @> '["intrants:lire"]'::jsonb)
        `);
    await queryRunner.query(`
            UPDATE "farms" f
               SET "is_verified" = true
              FROM "ref_items" r
             WHERE r."program_id" = f."program_id"
               AND r."list_type" = 'STATUT_FERME'
               AND r."code" = f."status_code"
               AND r."family" = 'OPERATIONNELLE'
               AND f."is_verified" = false
        `);
    await queryRunner.query(`
            ALTER TABLE "farm_gps_history"
            ADD "idempotency_key" character varying(120)
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_farm_gps_history_farm_idempotency" ON "farm_gps_history" ("farm_id", "idempotency_key")
            WHERE "idempotency_key" IS NOT NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."UQ_farm_gps_history_farm_idempotency"
        `);
    await queryRunner.query(`
            ALTER TABLE "farm_gps_history" DROP COLUMN "idempotency_key"
        `);
    await queryRunner.query(`
            UPDATE "farm_employees"
               SET "permissions" = "permissions" - 'intrants:lire'
             WHERE "role" = 'ADMIN'
        `);
    await queryRunner.query(
      `UPDATE "access_profiles"
          SET "matrix" = "matrix" - 'VENTES' - 'MARCHE' - 'COMPTABILITE' - 'EQUIPE',
              "updated_at" = now()
        WHERE "code" = 'DGE' AND "system" = true`,
    );
  }
}
