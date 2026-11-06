import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * POUFA lot A2 divers (hand-written), friction F8: the shared breed
 * reference (`POST/PATCH /breeds/reference`) is managed through the matrix
 * right PARAMETRES:CREER on an ALL scope, no longer by the platform admin.
 * Seeds that right on the system DGE profile (« Proposé » default, à valider
 * DGE); an admin who already changed the DGE's PARAMETRES keeps their list
 * plus CREER. Other profiles get it only from the matrix screen.
 */
export class BreedReferenceRight1794100500100 implements MigrationInterface {
  name = 'BreedReferenceRight1794100500100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            UPDATE "access_profiles"
               SET "matrix" = jsonb_set(
                     "matrix", '{PARAMETRES}',
                     COALESCE("matrix"->'PARAMETRES', '[]'::jsonb) || '["CREER"]'::jsonb),
                   "updated_at" = now()
             WHERE "code" = 'DGE' AND "system" = true
               AND NOT (COALESCE("matrix"->'PARAMETRES', '[]'::jsonb) @> '["CREER"]'::jsonb)
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            UPDATE "access_profiles"
               SET "matrix" = jsonb_set("matrix", '{PARAMETRES}', ("matrix"->'PARAMETRES') - 'CREER')
             WHERE "code" = 'DGE' AND "system" = true AND "matrix" ? 'PARAMETRES'
        `);
  }
}
