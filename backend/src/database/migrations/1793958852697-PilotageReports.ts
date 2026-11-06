import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Lot L6 « Pilotage »: scheduled report templates and their runs (PDF,
 * SHA-256 fingerprint, recipients). A run is immutable once produced; both
 * tables are journaled, the PDF bytes are left out of the row journal.
 */
export class PilotageReports1793958852697 implements MigrationInterface {
    name = 'PilotageReports1793958852697'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "report_templates" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "program_id" uuid NOT NULL,
                "code" character varying(40) NOT NULL,
                "label" character varying(160) NOT NULL,
                "periodicity" character varying(20) NOT NULL,
                "level" character varying(20) NOT NULL,
                "sections" jsonb NOT NULL,
                "audience" jsonb NOT NULL,
                "active" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_f85e16e6beea41a2b3a3350b84e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_report_templates_program_code" ON "report_templates" ("program_id", "code")
        `);
        await queryRunner.query(`
            CREATE TABLE "report_runs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "template_id" uuid NOT NULL,
                "program_id" uuid NOT NULL,
                "template_code" character varying(40) NOT NULL,
                "title" character varying(200) NOT NULL,
                "level" character varying(20) NOT NULL,
                "scope_key" character varying(80) NOT NULL,
                "province_id" uuid,
                "farm_id" uuid,
                "batch_id" uuid,
                "period_start" date NOT NULL,
                "period_end" date NOT NULL,
                "has_farm_rows" boolean NOT NULL,
                "pdf" bytea NOT NULL,
                "size_bytes" integer NOT NULL,
                "sha256" character(64) NOT NULL,
                "recipients" jsonb NOT NULL,
                "generated_by_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_ec9cd6617ae677b28700451a9b3" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_b4f7db7d9bef06711c0310e309" ON "report_runs" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_report_runs_program_created" ON "report_runs" ("program_id", "created_at")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_report_runs_template_scope_period" ON "report_runs" ("template_id", "scope_key", "period_start")
        `);
        await queryRunner.query(`
            ALTER TABLE "report_templates"
            ADD CONSTRAINT "FK_5f73f8a56c1083c4b01c745dfda" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "report_runs"
            ADD CONSTRAINT "FK_0ba2b1aeda58bdd7094a8465757" FOREIGN KEY ("template_id") REFERENCES "report_templates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);

        // --- Hand-written ---------------------------------------------------
        // A produced report is never rewritten: its fingerprint must stay true.
        await queryRunner.query(`
            CREATE FUNCTION "report_runs_immutable"() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION 'Un rapport produit ne peut être ni modifié ni supprimé.';
            END
            $$
        `);
        await queryRunner.query(`
            CREATE TRIGGER "report_runs_immutable"
            BEFORE UPDATE OR DELETE ON "report_runs"
            FOR EACH ROW EXECUTE FUNCTION "report_runs_immutable"()
        `);
        // Journal (AuditJournal): the PDF bytes stay out of audit_row_changes
        // (its SHA-256 is journaled with the row).
        await queryRunner.query(`SELECT audit_attach('report_templates')`);
        await queryRunner.query(
            `SELECT audit_attach('report_runs', 'id', ARRAY['pdf'])`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`SELECT audit_detach('report_runs')`);
        await queryRunner.query(`SELECT audit_detach('report_templates')`);
        await queryRunner.query(`
            DROP TRIGGER "report_runs_immutable" ON "report_runs"
        `);
        await queryRunner.query(`
            DROP FUNCTION "report_runs_immutable"()
        `);
        await queryRunner.query(`
            ALTER TABLE "report_runs" DROP CONSTRAINT "FK_0ba2b1aeda58bdd7094a8465757"
        `);
        await queryRunner.query(`
            ALTER TABLE "report_templates" DROP CONSTRAINT "FK_5f73f8a56c1083c4b01c745dfda"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_report_runs_template_scope_period"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_report_runs_program_created"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_b4f7db7d9bef06711c0310e309"
        `);
        await queryRunner.query(`
            DROP TABLE "report_runs"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_report_templates_program_code"
        `);
        await queryRunner.query(`
            DROP TABLE "report_templates"
        `);
    }

}
