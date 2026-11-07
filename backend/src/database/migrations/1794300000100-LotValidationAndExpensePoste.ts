import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CDC 7.3a / 7.3b (hand-written):
 * - `expenses.poste_charge`: code of the admin-managed POSTE_CHARGE list item,
 *   backfilled from the legacy category;
 * - `trace_lots.validation_status` / `validated_at` / `validated_by_id`:
 *   validation workflow of the traceability lots.
 */
export class LotValidationAndExpensePoste1794300000100
  implements MigrationInterface
{
  name = 'LotValidationAndExpensePoste1794300000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD "poste_charge" character varying(40)`,
    );
    await queryRunner.query(`
      UPDATE "expenses" SET "poste_charge" = CASE "category"::text
        WHEN 'ACHAT_POUSSINS' THEN 'POUSSINS'
        WHEN 'ALIMENTS' THEN 'ALIMENT'
        WHEN 'VETERINAIRE' THEN 'VETERINAIRE'
        WHEN 'MAIN_D_OEUVRE' THEN 'MAIN_OEUVRE'
        WHEN 'ENERGIE_GAZ' THEN 'ENERGIE'
        WHEN 'TRANSPORT' THEN 'TRANSPORT'
        ELSE 'AUTRES' END
    `);
    await queryRunner.query(
      `ALTER TABLE "trace_lots" ADD "validation_status" character varying(20) NOT NULL DEFAULT 'BROUILLON'`,
    );
    await queryRunner.query(
      `ALTER TABLE "trace_lots" ADD "validated_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`ALTER TABLE "trace_lots" ADD "validated_by_id" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trace_lots" DROP COLUMN "validated_by_id"`);
    await queryRunner.query(`ALTER TABLE "trace_lots" DROP COLUMN "validated_at"`);
    await queryRunner.query(`ALTER TABLE "trace_lots" DROP COLUMN "validation_status"`);
    await queryRunner.query(`ALTER TABLE "expenses" DROP COLUMN "poste_charge"`);
  }
}
