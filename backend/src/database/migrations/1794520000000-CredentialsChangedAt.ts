import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Users get the instant of their last login-code reset: tokens issued before
 * it are refused (JwtStrategy). Nullable, so existing sessions stay valid.
 */
export class CredentialsChangedAt1794520000000 implements MigrationInterface {
  name = 'CredentialsChangedAt1794520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "credentials_changed_at" TIMESTAMP WITH TIME ZONE
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN IF EXISTS "credentials_changed_at"
        `);
  }
}
