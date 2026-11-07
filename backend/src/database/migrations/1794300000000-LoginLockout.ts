import { MigrationInterface, QueryRunner } from 'typeorm';

/** CDC 8.1: per-account lockout after consecutive failed logins. */
export class LoginLockout1794300000000 implements MigrationInterface {
  name = 'LoginLockout1794300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "failed_logins" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "locked_until" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "locked_until"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "failed_logins"`);
  }
}
