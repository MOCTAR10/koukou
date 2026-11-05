import { MigrationInterface, QueryRunner } from "typeorm";

export class ProgrammeModule1793911267753 implements MigrationInterface {
    name = 'ProgrammeModule1793911267753'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "programs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "code" character varying(32) NOT NULL,
                "name" character varying NOT NULL,
                "start_date" date NOT NULL,
                "end_date" date,
                "settings" jsonb NOT NULL DEFAULT '{}',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_11924ca2e0cb47a8d9400bada03" UNIQUE ("code"),
                CONSTRAINT "PK_d43c664bcaafc0e8a06dfd34e05" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."ref_items_list_type_enum" AS ENUM(
                'STATUT_FERME',
                'COHORTE',
                'INFRASTRUCTURE',
                'INTRANT',
                'UNITE',
                'MOTIF_SORTIE',
                'POSTE_CHARGE',
                'PRODUIT_TRAITEMENT',
                'SIGNE_CLINIQUE',
                'TYPE_OPERATEUR',
                'STATUT_ALERTE'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "ref_items" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "program_id" uuid NOT NULL,
                "list_type" "public"."ref_items_list_type_enum" NOT NULL,
                "code" character varying(40) NOT NULL,
                "label" character varying NOT NULL,
                "family" character varying(40),
                "parent_id" uuid,
                "meta" jsonb NOT NULL DEFAULT '{}',
                "sort" integer NOT NULL DEFAULT '0',
                "active" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_72a7d7fe58674f595c8175908b9" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_ref_items_program_list_code" ON "ref_items" ("program_id", "list_type", "code")
        `);
        await queryRunner.query(`
            CREATE TABLE "provinces" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "program_id" uuid NOT NULL,
                "code" character varying(16) NOT NULL,
                "name" character varying NOT NULL,
                "chef_lieu" character varying NOT NULL,
                "geometry" jsonb,
                "sort" integer NOT NULL DEFAULT '0',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_2e4260eedbcad036ec53222e0c7" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_provinces_program_code" ON "provinces" ("program_id", "code")
        `);
        await queryRunner.query(`
            CREATE TABLE "program_parameters" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "program_id" uuid NOT NULL,
                "key" character varying(80) NOT NULL,
                "value" jsonb NOT NULL,
                "owner_profile" character varying(40) NOT NULL,
                "valid_from" TIMESTAMP WITH TIME ZONE NOT NULL,
                "created_by_id" uuid,
                "reason" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_ab14e95440c8757f7fae3b0c264" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_program_parameters_program_key_from" ON "program_parameters" ("program_id", "key", "valid_from")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."localites_kind_enum" AS ENUM('DEPARTEMENT', 'COMMUNE', 'AUTRE')
        `);
        await queryRunner.query(`
            CREATE TABLE "localites" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "province_id" uuid NOT NULL,
                "code" character varying(40) NOT NULL,
                "name" character varying NOT NULL,
                "kind" "public"."localites_kind_enum" NOT NULL DEFAULT 'AUTRE',
                "chef_lieu" character varying,
                "active" boolean NOT NULL DEFAULT true,
                "sort" integer NOT NULL DEFAULT '0',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_6b7b143bb55cecad789fd94b67f" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_localites_province_code" ON "localites" ("province_id", "code")
        `);
        await queryRunner.query(`
            CREATE TABLE "id_counters" (
                "scope" character varying(120) NOT NULL,
                "next" integer NOT NULL,
                CONSTRAINT "PK_4eb852e6bdb95d977cfd29d4c5e" PRIMARY KEY ("scope")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "ref_items"
            ADD CONSTRAINT "FK_2827d27ffb7137ae8fab5d7d1a6" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "ref_items"
            ADD CONSTRAINT "FK_1d07f188a2c9bf26a79515fc0c8" FOREIGN KEY ("parent_id") REFERENCES "ref_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "provinces"
            ADD CONSTRAINT "FK_aa307284b4669a15c53dfae6c59" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "program_parameters"
            ADD CONSTRAINT "FK_fb446ef7180a48e71b586a4df15" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "localites"
            ADD CONSTRAINT "FK_9c5de5d20a2ef9c4e1183f20266" FOREIGN KEY ("province_id") REFERENCES "provinces"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        // Hand-written: parameter versions are immutable (a change inserts a
        // new row). TypeORM does not track triggers, so migration:check
        // ignores this.
        await queryRunner.query(`
            CREATE FUNCTION "program_parameters_immutable"() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION 'Les versions de paramètres sont immuables : enregistrez une nouvelle version.';
            END
            $$
        `);
        await queryRunner.query(`
            CREATE TRIGGER "program_parameters_immutable"
            BEFORE UPDATE OR DELETE ON "program_parameters"
            FOR EACH ROW EXECUTE FUNCTION "program_parameters_immutable"()
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TRIGGER "program_parameters_immutable" ON "program_parameters"
        `);
        await queryRunner.query(`
            DROP FUNCTION "program_parameters_immutable"()
        `);
        await queryRunner.query(`
            ALTER TABLE "localites" DROP CONSTRAINT "FK_9c5de5d20a2ef9c4e1183f20266"
        `);
        await queryRunner.query(`
            ALTER TABLE "program_parameters" DROP CONSTRAINT "FK_fb446ef7180a48e71b586a4df15"
        `);
        await queryRunner.query(`
            ALTER TABLE "provinces" DROP CONSTRAINT "FK_aa307284b4669a15c53dfae6c59"
        `);
        await queryRunner.query(`
            ALTER TABLE "ref_items" DROP CONSTRAINT "FK_1d07f188a2c9bf26a79515fc0c8"
        `);
        await queryRunner.query(`
            ALTER TABLE "ref_items" DROP CONSTRAINT "FK_2827d27ffb7137ae8fab5d7d1a6"
        `);
        await queryRunner.query(`
            DROP TABLE "id_counters"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_localites_province_code"
        `);
        await queryRunner.query(`
            DROP TABLE "localites"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."localites_kind_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_program_parameters_program_key_from"
        `);
        await queryRunner.query(`
            DROP TABLE "program_parameters"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_provinces_program_code"
        `);
        await queryRunner.query(`
            DROP TABLE "provinces"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_ref_items_program_list_code"
        `);
        await queryRunner.query(`
            DROP TABLE "ref_items"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."ref_items_list_type_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "programs"
        `);
    }

}
