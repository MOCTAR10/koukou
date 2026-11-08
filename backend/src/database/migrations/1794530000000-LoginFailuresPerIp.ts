import { MigrationInterface, QueryRunner } from 'typeorm';

/** Login lockout keyed per account + client IP (anti lockout-DoS). */
export class LoginFailuresPerIp1794530000000 implements MigrationInterface {
  name = 'LoginFailuresPerIp1794530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "login_failures" (
        "user_id" uuid NOT NULL,
        "ip" character varying(64) NOT NULL,
        "failures" integer NOT NULL DEFAULT '0',
        "locked_until" TIMESTAMP WITH TIME ZONE,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_login_failures" PRIMARY KEY ("user_id", "ip")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "login_failures"`);
  }
}
