import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recette ANINF A21 (hand-written): the AGENT_TECHNIQUE system profile reads
 * the sanitary declarations of its farms (CDC §3 « vérifie les
 * déclarations ») through the dedicated read-only matrix right
 * DECLARATIONS:CONSULTER (« Déclarations sanitaires (lecture) »). It also
 * keeps SANITAIRE:CONSULTER (care calendars). Rights already held are kept;
 * the admin can still remove them in the matrix. À arbitrer DGE.
 */
export class AgentReadsDeclarations1794500100000 implements MigrationInterface {
  name = 'AgentReadsDeclarations1794500100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            UPDATE "access_profiles"
               SET "matrix" = jsonb_set(
                     jsonb_set(COALESCE("matrix", '{}'::jsonb), '{SANITAIRE}',
                       COALESCE("matrix"->'SANITAIRE', '["CONSULTER"]'::jsonb)),
                     '{DECLARATIONS}', '["CONSULTER"]'::jsonb),
                   "updated_at" = now()
             WHERE "code" = 'AGENT_TECHNIQUE' AND "system" = true
               AND NOT (COALESCE("matrix", '{}'::jsonb) ? 'DECLARATIONS')
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            UPDATE "access_profiles"
               SET "matrix" = "matrix" - 'DECLARATIONS', "updated_at" = now()
             WHERE "code" = 'AGENT_TECHNIQUE' AND "system" = true
               AND "matrix"->'DECLARATIONS' = '["CONSULTER"]'::jsonb
        `);
  }
}
