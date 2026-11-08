import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tasks generated from the programmes: origin (`source`) and step (`step_id`)
 * of a task, unique per batch + source + step so regenerating never duplicates.
 */
export class GeneratedTasks1794560000000 implements MigrationInterface {
  name = 'GeneratedTasks1794560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "farm_tasks" ADD "source" character varying(30) NOT NULL DEFAULT 'MANUELLE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "farm_tasks" ADD "step_id" character varying(120)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_farm_tasks_generated" ON "farm_tasks" ("batch_id", "source", "step_id") WHERE "step_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_farm_tasks_generated"`);
    await queryRunner.query(`ALTER TABLE "farm_tasks" DROP COLUMN "step_id"`);
    await queryRunner.query(`ALTER TABLE "farm_tasks" DROP COLUMN "source"`);
  }
}
