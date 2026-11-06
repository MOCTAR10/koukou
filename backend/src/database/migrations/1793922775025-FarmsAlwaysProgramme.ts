import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * POUFA-only instance: every farm belongs to the programme, so
 * `farms.program_id` becomes NOT NULL and `CHK_farms_owner_or_program`
 * (an owner or a programme) is now always true and dropped.
 *
 * A database holding farms outside the programme (former Fermia demo data)
 * is refused rather than altered: no farm is deleted or attached to the
 * programme behind the operator's back.
 */
export class FarmsAlwaysProgramme1793922775025 implements MigrationInterface {
  name = 'FarmsAlwaysProgramme1793922775025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ count }] = (await queryRunner.query(
      `SELECT COUNT(*)::int AS count FROM "farms" WHERE "program_id" IS NULL`,
    )) as { count: number }[];
    if (count > 0) {
      throw new Error(
        `Migration FarmsAlwaysProgramme impossible : ${count} ferme(s) hors programme (farms.program_id NULL) dans cette base. ` +
          'Cette version ne sert que le programme POUFA : toute ferme est créée par le registre (POST /programme/farms). ' +
          'Ces fermes sont des données de démonstration Fermia : démarrez sur une base vide (autre DB_DATABASE), ' +
          'ou supprimez ces fermes et leurs données, puis relancez. Aucune donnée n’a été modifiée.',
      );
    }
    await queryRunner.query(`
            ALTER TABLE "farms" DROP CONSTRAINT "CHK_farms_owner_or_program"
        `);
    await queryRunner.query(`
            ALTER TABLE "farms"
            ALTER COLUMN "program_id"
            SET NOT NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "farms"
            ALTER COLUMN "program_id" DROP NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "farms"
            ADD CONSTRAINT "CHK_farms_owner_or_program" CHECK (
                    "owner_id" IS NOT NULL
                    OR "program_id" IS NOT NULL
                )
        `);
  }
}
