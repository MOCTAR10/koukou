import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * POUFA lot A2 divers (hand-written), friction F4: a slaughter order names
 * the programme operator (abattoir) receiving the birds; processing it then
 * cedes the lot (sub-lot, signed QR, CESSION event), like a sortie towards
 * an operator. Nullable: orders slaughtered on the farm (INTERNE) and the
 * existing orders have none. Seeds nothing.
 */
export class SlaughterOrderOperator1794100500000 implements MigrationInterface {
  name = 'SlaughterOrderOperator1794100500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "slaughter_orders"
            ADD "operator_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "slaughter_orders"
            ADD CONSTRAINT "FK_c9aad09991ef80f59e61bb904bb" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "slaughter_orders" DROP CONSTRAINT "FK_c9aad09991ef80f59e61bb904bb"
        `);
    await queryRunner.query(`
            ALTER TABLE "slaughter_orders" DROP COLUMN "operator_id"
        `);
  }
}
