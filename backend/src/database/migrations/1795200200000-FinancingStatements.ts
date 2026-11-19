import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Financial statements of the farms for the financer: the system profile BCEG
 * reads the farms' SYSCOHADA bookkeeping (COMPTABILITE, consultation only: a
 * Fermia bonus domain open to institutions in read-only, as for the DGE in
 * InstitutionFermiaGrants). Rights already held are kept; the programme
 * administrator can still remove it in the matrix. The parameters
 * FINANCEMENT_COUVERTURE_DETTE_MIN and FINANCEMENT_ENDETTEMENT_MAX are seeded
 * at boot.
 */
export class FinancingStatements1795200200000 implements MigrationInterface {
  name = 'FinancingStatements1795200200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "access_profiles"
         SET "matrix" = jsonb_set(
               COALESCE("matrix", '{}'::jsonb), '{COMPTABILITE}',
               COALESCE("matrix"->'COMPTABILITE', '[]'::jsonb) ||
               CASE WHEN COALESCE("matrix"->'COMPTABILITE', '[]'::jsonb) ? 'CONSULTER'
                    THEN '[]'::jsonb ELSE '["CONSULTER"]'::jsonb END),
             "updated_at" = now()
       WHERE "code" = 'BCEG' AND "system" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "access_profiles" SET "matrix" = "matrix" - 'COMPTABILITE', "updated_at" = now()
       WHERE "code" = 'BCEG' AND "system" = true
    `);
  }
}
