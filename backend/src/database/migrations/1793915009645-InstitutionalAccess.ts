import { MigrationInterface, QueryRunner } from "typeorm";

export class InstitutionalAccess1793915009645 implements MigrationInterface {
    name = 'InstitutionalAccess1793915009645'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "login_challenges" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "code_hash" character varying(100) NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "attempts" integer NOT NULL DEFAULT '0',
                "consumed_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_85b9467d340eb112cb0fa7a0cde" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_login_challenges_user_created" ON "login_challenges" ("user_id", "created_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "program_memberships" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "profile_id" uuid NOT NULL,
                "province_ids" uuid array NOT NULL DEFAULT '{}',
                "farm_ids" uuid array NOT NULL DEFAULT '{}',
                "operator_id" uuid,
                "active" boolean NOT NULL DEFAULT true,
                "valid_until" TIMESTAMP WITH TIME ZONE,
                "created_by" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_835a393ad4bdbd7826f86330906" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_program_memberships_user" ON "program_memberships" ("user_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_f68526f3916d6f2ac3e8f0bd91" ON "program_memberships" ("profile_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."access_scope_kind_enum" AS ENUM(
                'ALL',
                'PROVINCES',
                'FARMS',
                'FINANCED',
                'OPERATOR',
                'AGGREGATE',
                'AUDIT'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "access_profiles" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "program_id" uuid NOT NULL,
                "code" character varying(40) NOT NULL,
                "label" character varying(120) NOT NULL,
                "scope_kind" "public"."access_scope_kind_enum" NOT NULL,
                "matrix" jsonb NOT NULL DEFAULT '{}',
                "system" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_2c010ee4f3b3d9c89b46674dd4b" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_access_profiles_program_code" ON "access_profiles" ("program_id", "code")
        `);
        await queryRunner.query(`
            ALTER TYPE "public"."users_role_enum"
            RENAME TO "users_role_enum_old"
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."users_role_enum" AS ENUM(
                'PLATFORM_ADMIN',
                'PROPRIETAIRE',
                'ELEVEUR',
                'ACHETEUR',
                'INSTITUTION',
                'OPERATEUR'
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "role" DROP DEFAULT
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "role" TYPE "public"."users_role_enum" USING "role"::"text"::"public"."users_role_enum"
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "role"
            SET DEFAULT 'PROPRIETAIRE'
        `);
        await queryRunner.query(`
            DROP TYPE "public"."users_role_enum_old"
        `);
        await queryRunner.query(`
            ALTER TABLE "login_challenges"
            ADD CONSTRAINT "FK_23bb9553efaa83910672d214f65" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "program_memberships"
            ADD CONSTRAINT "FK_8036d35d4fd8a59c01e9a9ac43c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "program_memberships"
            ADD CONSTRAINT "FK_f68526f3916d6f2ac3e8f0bd91e" FOREIGN KEY ("profile_id") REFERENCES "access_profiles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "program_memberships"
            ADD CONSTRAINT "FK_b076b027843b96ec0ae783989ab" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "access_profiles"
            ADD CONSTRAINT "FK_471f1f01791800c0df9f1956c37" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "access_profiles" DROP CONSTRAINT "FK_471f1f01791800c0df9f1956c37"
        `);
        await queryRunner.query(`
            ALTER TABLE "program_memberships" DROP CONSTRAINT "FK_b076b027843b96ec0ae783989ab"
        `);
        await queryRunner.query(`
            ALTER TABLE "program_memberships" DROP CONSTRAINT "FK_f68526f3916d6f2ac3e8f0bd91e"
        `);
        await queryRunner.query(`
            ALTER TABLE "program_memberships" DROP CONSTRAINT "FK_8036d35d4fd8a59c01e9a9ac43c"
        `);
        await queryRunner.query(`
            ALTER TABLE "login_challenges" DROP CONSTRAINT "FK_23bb9553efaa83910672d214f65"
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."users_role_enum_old" AS ENUM(
                'PLATFORM_ADMIN',
                'PROPRIETAIRE',
                'ELEVEUR',
                'ACHETEUR'
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "role" DROP DEFAULT
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "role" TYPE "public"."users_role_enum_old" USING "role"::"text"::"public"."users_role_enum_old"
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "role"
            SET DEFAULT 'PROPRIETAIRE'
        `);
        await queryRunner.query(`
            DROP TYPE "public"."users_role_enum"
        `);
        await queryRunner.query(`
            ALTER TYPE "public"."users_role_enum_old"
            RENAME TO "users_role_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_access_profiles_program_code"
        `);
        await queryRunner.query(`
            DROP TABLE "access_profiles"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."access_scope_kind_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_f68526f3916d6f2ac3e8f0bd91"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_program_memberships_user"
        `);
        await queryRunner.query(`
            DROP TABLE "program_memberships"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_login_challenges_user_created"
        `);
        await queryRunner.query(`
            DROP TABLE "login_challenges"
        `);
    }

}
