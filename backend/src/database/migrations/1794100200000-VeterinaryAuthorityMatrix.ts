import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * POUFA lot A2 vet (hand-written): the veterinary authority and the parameter
 * ownership move from the profile codes to the matrix, with the same default
 * behaviour.
 * - VETERINAIRE system profile: SANITAIRE CONSULTER / MODIFIER / VALIDER and
 *   PARAMETRES CONSULTER / MODIFIER (declarations, qualification,
 *   publication, its parameters: what its code gave it implicitly); actions
 *   already held are kept, nothing is taken away.
 * - DGE system profile: PARAMETRES:VALIDER (owner right of the DGE
 *   parameters and conduct thresholds).
 * - `FORMULE_MORTALITE_JOUR_PCT` belongs to the veterinary services (it
 *   decides the sanitary alert): its stored versions say so.
 * The ADMIN parameters move to ADMINISTRATION:ADMINISTRER, which the seeded
 * ADMIN profile already holds.
 */
const ORDER = `ARRAY['CONSULTER','CREER','MODIFIER','VALIDER','ADMINISTRER']`;

/** SQL merging `actions` into the matrix key `domain` (catalog order, no duplicate). */
function merge(domain: string, actions: string[]): string {
  const added = actions.map((a) => `'${a}'`).join(',');
  return `jsonb_set(COALESCE("matrix", '{}'::jsonb), '{${domain}}', (
            SELECT jsonb_agg(x.a ORDER BY array_position(${ORDER}, x.a))
              FROM (SELECT DISTINCT a FROM unnest(
                     ARRAY(SELECT jsonb_array_elements_text(COALESCE("matrix"->'${domain}', '[]'::jsonb)))
                     || ARRAY[${added}]) AS a) x))`;
}

export class VeterinaryAuthorityMatrix1794100200000 implements MigrationInterface {
  name = 'VeterinaryAuthorityMatrix1794100200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            UPDATE "access_profiles"
               SET "matrix" = ${merge('SANITAIRE', ['CONSULTER', 'MODIFIER', 'VALIDER'])},
                   "updated_at" = now()
             WHERE "code" = 'VETERINAIRE' AND "system" = true
        `);
    await queryRunner.query(`
            UPDATE "access_profiles"
               SET "matrix" = ${merge('PARAMETRES', ['CONSULTER', 'MODIFIER'])},
                   "updated_at" = now()
             WHERE "code" = 'VETERINAIRE' AND "system" = true
        `);
    await queryRunner.query(`
            UPDATE "access_profiles"
               SET "matrix" = ${merge('PARAMETRES', ['CONSULTER', 'MODIFIER', 'VALIDER'])},
                   "updated_at" = now()
             WHERE "code" = 'DGE' AND "system" = true
        `);
    await queryRunner.query(`
            UPDATE "program_parameters"
               SET "owner_profile" = 'VETERINAIRE'
             WHERE "key" = 'FORMULE_MORTALITE_JOUR_PCT'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            UPDATE "program_parameters"
               SET "owner_profile" = 'DGE'
             WHERE "key" = 'FORMULE_MORTALITE_JOUR_PCT'
        `);
    // The VETERINAIRE grants are what its code gave it before: kept.
    await queryRunner.query(`
            UPDATE "access_profiles"
               SET "matrix" = jsonb_set("matrix", '{PARAMETRES}', ("matrix"->'PARAMETRES') - 'VALIDER'),
                   "updated_at" = now()
             WHERE "code" = 'DGE' AND "system" = true AND "matrix" ? 'PARAMETRES'
        `);
  }
}
