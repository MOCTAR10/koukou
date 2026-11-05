import { MigrationInterface, QueryRunner } from "typeorm";

export class BandsNeverDeleted1793909660080 implements MigrationInterface {
    name = 'BandsNeverDeleted1793909660080'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "production_batches" DROP CONSTRAINT "FK_bd9f5756def1f6dc3ee1db5364a"
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches"
            ADD CONSTRAINT "FK_bd9f5756def1f6dc3ee1db5364a" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "production_batches" DROP CONSTRAINT "FK_bd9f5756def1f6dc3ee1db5364a"
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches"
            ADD CONSTRAINT "FK_bd9f5756def1f6dc3ee1db5364a" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

}
