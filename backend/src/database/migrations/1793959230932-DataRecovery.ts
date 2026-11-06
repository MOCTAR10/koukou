import { MigrationInterface, QueryRunner } from "typeorm";

// Journal (AuditJournal). `import_rows` is left out on purpose: staging rows
// are rewritten wholesale at every analysis and hold the raw file (personal
// data); a manual correction is kept on the row itself (`corrections`) and the
// request in the level-1 journal, and the integrated facts are journaled in
// their own tables (farms, production_batches, daily_entries…).
const JOURNALED = ['import_jobs', 'import_source_links'];

export class DataRecovery1793959230932 implements MigrationInterface {
    name = 'DataRecovery1793959230932'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "import_source_links" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "program_id" uuid NOT NULL,
                "kind" character varying(20) NOT NULL,
                "source_key" character varying(200) NOT NULL,
                "target_id" uuid NOT NULL,
                "target_code" character varying(60),
                "job_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_824856568b7c5f241bbfae623ea" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_51cb9d0559481efbea13f100f5" ON "import_source_links" ("target_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_import_source_links_key" ON "import_source_links" ("program_id", "kind", "source_key")
        `);
        await queryRunner.query(`
            CREATE TABLE "import_rows" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "job_id" uuid NOT NULL,
                "line" integer NOT NULL,
                "raw" jsonb NOT NULL,
                "values" jsonb NOT NULL,
                "status" character varying(20) NOT NULL,
                "planned_outcome" character varying(20),
                "group_key" character varying(200),
                "source_key" character varying(200),
                "errors" jsonb NOT NULL DEFAULT '[]',
                "warnings" jsonb NOT NULL DEFAULT '[]',
                "details" jsonb,
                "excluded" boolean NOT NULL DEFAULT false,
                "corrections" jsonb NOT NULL DEFAULT '[]',
                "dry_run_outcome" character varying(20),
                "dry_run_message" text,
                "dry_run_code" character varying(60),
                "outcome" character varying(20),
                "outcome_message" text,
                "target_id" uuid,
                "target_code" character varying(60),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_45b442c5ced30d539ba20c3ec32" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_import_rows_job_line" ON "import_rows" ("job_id", "line")
        `);
        await queryRunner.query(`
            CREATE TABLE "import_jobs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "program_id" uuid NOT NULL,
                "type" character varying(30) NOT NULL,
                "status" character varying(20) NOT NULL,
                "file_name" character varying(255) NOT NULL,
                "file_size" integer NOT NULL,
                "file_sha256" character varying(64) NOT NULL,
                "encoding" character varying(10) NOT NULL,
                "delimiter" character varying(1) NOT NULL,
                "headers" jsonb NOT NULL,
                "column_mapping" jsonb NOT NULL,
                "unknown_columns" jsonb NOT NULL DEFAULT '[]',
                "mapping_error" text,
                "options" jsonb NOT NULL,
                "counts" jsonb NOT NULL,
                "note" character varying(500),
                "created_by_id" uuid,
                "analysed_at" TIMESTAMP WITH TIME ZONE,
                "controlled_at" TIMESTAMP WITH TIME ZONE,
                "dry_run_at" TIMESTAMP WITH TIME ZONE,
                "dry_run_by_id" uuid,
                "validated_at" TIMESTAMP WITH TIME ZONE,
                "validated_by_id" uuid,
                "validation_comment" character varying(500),
                "integrated_at" TIMESTAMP WITH TIME ZONE,
                "integrated_by_id" uuid,
                "rejected_at" TIMESTAMP WITH TIME ZONE,
                "rejected_by_id" uuid,
                "rejection_reason" character varying(500),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_4d206c602f173f98e4bb85819a3" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_a77bd14e22a3434dca33ff3f3c" ON "import_jobs" ("file_sha256")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_import_jobs_program_created" ON "import_jobs" ("program_id", "created_at")
        `);
        await queryRunner.query(`
            ALTER TABLE "import_rows"
            ADD CONSTRAINT "FK_e2294c3cba0346f11cc3f91c744" FOREIGN KEY ("job_id") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        for (const table of JOURNALED) {
            await queryRunner.query(`SELECT audit_attach($1::regclass, 'id')`, [
                table,
            ]);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const table of JOURNALED) {
            await queryRunner.query(`SELECT audit_detach($1::regclass)`, [
                table,
            ]);
        }
        await queryRunner.query(`
            ALTER TABLE "import_rows" DROP CONSTRAINT "FK_e2294c3cba0346f11cc3f91c744"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_import_jobs_program_created"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_a77bd14e22a3434dca33ff3f3c"
        `);
        await queryRunner.query(`
            DROP TABLE "import_jobs"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_import_rows_job_line"
        `);
        await queryRunner.query(`
            DROP TABLE "import_rows"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_import_source_links_key"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_51cb9d0559481efbea13f100f5"
        `);
        await queryRunner.query(`
            DROP TABLE "import_source_links"
        `);
    }

}
