import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recette ANINF A8 (hand-written, data only): the locality of a farm was read
 * from two places (`farms.administrative_city`, free text, and the registry
 * locality `localites.name`). The locality of the registry is the source: the
 * city of every farm that has one is aligned on it. No schema change.
 */
export class FarmCityFromLocalite1794430000000 implements MigrationInterface {
  name = 'FarmCityFromLocalite1794430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            UPDATE "farms" f
               SET "administrative_city" = l."name"
              FROM "localites" l
             WHERE f."localite_id" = l."id"
               AND f."administrative_city" IS DISTINCT FROM l."name"
        `);
  }

  public async down(): Promise<void> {
    // The previous free-text values are not kept: nothing to restore.
  }
}
