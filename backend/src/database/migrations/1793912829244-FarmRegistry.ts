import { MigrationInterface, QueryRunner } from "typeorm";

export class FarmRegistry1793912829244 implements MigrationInterface {
    name = 'FarmRegistry1793912829244'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "farm_status_history" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "status_code" character varying(40) NOT NULL,
                "status_family" character varying(40) NOT NULL,
                "cohort" character varying(40),
                "from" TIMESTAMP WITH TIME ZONE NOT NULL,
                "created_by" uuid,
                "reason" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_35d8f88d413e3c60f2c8c8c9a70" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_farm_status_history_farm_from" ON "farm_status_history" ("farm_id", "from")
        `);
        await queryRunner.query(`
            CREATE TABLE "farm_infrastructures" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "ref_item_code" character varying(40) NOT NULL,
                "count" integer NOT NULL,
                "surface_m2" double precision,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_c15513a014becf301c8138e559b" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_farm_infrastructures_farm_item" ON "farm_infrastructures" ("farm_id", "ref_item_code")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."farm_gps_history_source_enum" AS ENUM('APPAREIL', 'MANUEL', 'IMPORT')
        `);
        await queryRunner.query(`
            CREATE TABLE "farm_gps_history" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "latitude" double precision NOT NULL,
                "longitude" double precision NOT NULL,
                "captured_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "source" "public"."farm_gps_history_source_enum" NOT NULL,
                "accuracy_m" double precision,
                "province_warning" text,
                "created_by" uuid,
                "reason" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_aca7ea47a9eaba4cab5ed4c171e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_farm_gps_history_farm_created" ON "farm_gps_history" ("farm_id", "created_at")
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD "program_id" uuid
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD "code" character varying(32)
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD CONSTRAINT "UQ_167461fa614bb0174fd616ee0d3" UNIQUE ("code")
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD "province_id" uuid
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD "localite_id" uuid
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD "ami_ref" character varying(64)
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD "cohort" character varying(40)
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD "capacity_places" integer
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD "gps_captured_at" TIMESTAMP WITH TIME ZONE
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."farms_gps_source_enum" AS ENUM('APPAREIL', 'MANUEL', 'IMPORT')
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD "gps_source" "public"."farms_gps_source_enum"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD "gps_accuracy_m" double precision
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD "gps_province_warning" text
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD "exploitant_name" character varying
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD "exploitant_phone" character varying
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD "status_code" character varying(40)
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD "status_since" TIMESTAMP WITH TIME ZONE
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD "duplicate_override" jsonb
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP CONSTRAINT "FK_204aed99900ed35c8db32c60db7"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ALTER COLUMN "owner_id" DROP NOT NULL
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_7b370dda69a3c239be16909a4d" ON "farms" ("province_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_03c4892c059b8cb723bd686570" ON "farms" ("exploitant_phone")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_farms_program_ami_ref" ON "farms" ("program_id", "ami_ref")
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD CONSTRAINT "CHK_farms_owner_or_program" CHECK (
                    "owner_id" IS NOT NULL
                    OR "program_id" IS NOT NULL
                )
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD CONSTRAINT "FK_204aed99900ed35c8db32c60db7" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD CONSTRAINT "FK_35958d82f01a7bdc5c2176fcfb2" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD CONSTRAINT "FK_7b370dda69a3c239be16909a4dc" FOREIGN KEY ("province_id") REFERENCES "provinces"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD CONSTRAINT "FK_feff48f9aba628c1df8064c1a7e" FOREIGN KEY ("localite_id") REFERENCES "localites"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_status_history"
            ADD CONSTRAINT "FK_4c2d63d28a387bdde44b4a93a40" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_status_history"
            ADD CONSTRAINT "FK_398cb91da9f5eb0c7d80695d6e9" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_infrastructures"
            ADD CONSTRAINT "FK_1d7ce55841b1e33acf81587180b" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_gps_history"
            ADD CONSTRAINT "FK_55980d064f7c1a1b36d8d462c1b" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_gps_history"
            ADD CONSTRAINT "FK_b107d69673e74d046a146c9353e" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        // Hand-written: a farm's programme code is never changed nor reused,
        // and a farm never leaves (or switches) its programme. TypeORM does
        // not track triggers, so migration:check ignores this.
        await queryRunner.query(`
            CREATE FUNCTION "farms_programme_code_immutable"() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                IF OLD.code IS NOT NULL AND NEW.code IS DISTINCT FROM OLD.code THEN
                    RAISE EXCEPTION 'Le code d''une ferme du programme ne peut pas être modifié.';
                END IF;
                IF OLD.program_id IS NOT NULL AND NEW.program_id IS DISTINCT FROM OLD.program_id THEN
                    RAISE EXCEPTION 'Une ferme ne peut pas quitter son programme.';
                END IF;
                RETURN NEW;
            END
            $$
        `);
        await queryRunner.query(`
            CREATE TRIGGER "farms_programme_code_immutable"
            BEFORE UPDATE OF code, program_id ON "farms"
            FOR EACH ROW EXECUTE FUNCTION "farms_programme_code_immutable"()
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TRIGGER "farms_programme_code_immutable" ON "farms"
        `);
        await queryRunner.query(`
            DROP FUNCTION "farms_programme_code_immutable"()
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_gps_history" DROP CONSTRAINT "FK_b107d69673e74d046a146c9353e"
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_gps_history" DROP CONSTRAINT "FK_55980d064f7c1a1b36d8d462c1b"
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_infrastructures" DROP CONSTRAINT "FK_1d7ce55841b1e33acf81587180b"
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_status_history" DROP CONSTRAINT "FK_398cb91da9f5eb0c7d80695d6e9"
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_status_history" DROP CONSTRAINT "FK_4c2d63d28a387bdde44b4a93a40"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP CONSTRAINT "FK_feff48f9aba628c1df8064c1a7e"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP CONSTRAINT "FK_7b370dda69a3c239be16909a4dc"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP CONSTRAINT "FK_35958d82f01a7bdc5c2176fcfb2"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP CONSTRAINT "FK_204aed99900ed35c8db32c60db7"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP CONSTRAINT "CHK_farms_owner_or_program"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_farms_program_ami_ref"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_03c4892c059b8cb723bd686570"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_7b370dda69a3c239be16909a4d"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ALTER COLUMN "owner_id"
            SET NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD CONSTRAINT "FK_204aed99900ed35c8db32c60db7" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP COLUMN "duplicate_override"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP COLUMN "status_since"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP COLUMN "status_code"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP COLUMN "exploitant_phone"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP COLUMN "exploitant_name"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP COLUMN "gps_province_warning"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP COLUMN "gps_accuracy_m"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP COLUMN "gps_source"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."farms_gps_source_enum"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP COLUMN "gps_captured_at"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP COLUMN "capacity_places"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP COLUMN "cohort"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP COLUMN "ami_ref"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP COLUMN "localite_id"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP COLUMN "province_id"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP CONSTRAINT "UQ_167461fa614bb0174fd616ee0d3"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP COLUMN "code"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP COLUMN "program_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_farm_gps_history_farm_created"
        `);
        await queryRunner.query(`
            DROP TABLE "farm_gps_history"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."farm_gps_history_source_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_farm_infrastructures_farm_item"
        `);
        await queryRunner.query(`
            DROP TABLE "farm_infrastructures"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_farm_status_history_farm_from"
        `);
        await queryRunner.query(`
            DROP TABLE "farm_status_history"
        `);
    }

}
