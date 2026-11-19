import { MigrationInterface, QueryRunner } from 'typeorm';
import { DEFAULT_REQUIREMENTS } from '../../modules/financing/data/default-requirements.js';

const ACTIONS = ['CONSULTER', 'CREER', 'MODIFIER', 'VALIDER', 'ADMINISTRER'];
const TABLES = [
    'financing_files',
    'financing_step_events',
    'financing_requirements',
    'financing_documents',
    'financing_disbursements',
    'financing_instalments',
    'financing_repayments',
    'consent_templates',
    'farm_consents',
];

/** Adds `actions` on `domain` to a system profile's matrix, keeping the rights it already holds. */
function grantSql(code: string, domain: string, actions: string[]): string {
    return `
        UPDATE "access_profiles"
           SET "matrix" = jsonb_set(
                 COALESCE("matrix", '{}'::jsonb), '{${domain}}',
                 (SELECT COALESCE(jsonb_agg(a ORDER BY array_position(ARRAY[${ACTIONS.map((a) => `'${a}'`).join(',')}], a)), '[]'::jsonb)
                    FROM (SELECT DISTINCT a FROM jsonb_array_elements_text(
                            COALESCE("matrix"->'${domain}', '[]'::jsonb) || '${JSON.stringify(actions)}'::jsonb) a) t)),
               "updated_at" = now()
         WHERE "code" = '${code}' AND "system" = true`;
}

/**
 * Financer workspace (BCEG): financing files, step history, document checklist
 * (seeded here for the programmes that exist; a fresh database gets it from
 * `FinancingService.ensureRequirements`), documents, tranches, schedule,
 * repayments, consent templates and farm consents, all journaled
 * (`audit_attach`). Data: the matrix domain FINANCEMENT goes to the system
 * profiles BCEG (all four actions + PILOTAGE and INTRANTS in consultation),
 * DGE and ADMIN (consultation); rights already held are kept and the admin
 * can still edit them. The parameters FINANCEMENT_* are seeded at boot.
 */

export class FinancingModule1795200100000 implements MigrationInterface {
    name = 'FinancingModule1795200100000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "financing_step_events" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "file_id" uuid NOT NULL,
                "from_step" character varying(20),
                "to_step" character varying(20) NOT NULL,
                "decision" character varying(10),
                "note" text,
                "by_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_aa79b5e1b74928f5f48c9c6666e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_financing_step_events_file" ON "financing_step_events" ("file_id", "created_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "financing_requirements" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "program_id" uuid NOT NULL,
                "code" character varying(60) NOT NULL,
                "label" character varying(300) NOT NULL,
                "step" character varying(20) NOT NULL,
                "required" boolean NOT NULL DEFAULT true,
                "legal_basis" character varying(200),
                "help" text,
                "active" boolean NOT NULL DEFAULT true,
                "sort" integer NOT NULL DEFAULT '0',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_d5c8f642428ea0ec457bc26b664" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_financing_requirements_code" ON "financing_requirements" ("program_id", "code")
        `);
        await queryRunner.query(`
            CREATE TABLE "financing_repayments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "file_id" uuid NOT NULL,
                "paid_on" date NOT NULL,
                "amount_fcfa" integer NOT NULL,
                "method" character varying(20) NOT NULL,
                "reference" character varying(120),
                "note" text,
                "cancelled_at" TIMESTAMP WITH TIME ZONE,
                "cancel_reason" text,
                "cancelled_by_id" uuid,
                "recorded_by_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_27fc38b6c157d36cf9b6c3e70e7" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_financing_repayments_file" ON "financing_repayments" ("file_id", "paid_on")
        `);
        await queryRunner.query(`
            CREATE TABLE "financing_instalments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "file_id" uuid NOT NULL,
                "number" integer NOT NULL,
                "due_date" date NOT NULL,
                "principal_fcfa" integer NOT NULL,
                "interest_fcfa" integer NOT NULL,
                CONSTRAINT "PK_fe2fa28045b9ae9fdc0f0bd0610" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_financing_instalments_number" ON "financing_instalments" ("file_id", "number")
        `);
        await queryRunner.query(`
            CREATE TABLE "financing_files" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "program_id" uuid NOT NULL,
                "farm_id" uuid NOT NULL,
                "reference" character varying(24) NOT NULL,
                "purpose" text NOT NULL,
                "step" character varying(20) NOT NULL DEFAULT 'DEMANDE',
                "decision" character varying(10),
                "decision_date" date,
                "decision_note" text,
                "requested_fcfa" integer,
                "granted_fcfa" integer,
                "amount_note" text,
                "rate_pct" numeric(5, 2),
                "duration_months" integer,
                "grace_months" integer,
                "periodicity" character varying(20),
                "guarantees" text,
                "guarantee_fund" character varying(200),
                "guarantee_pct" numeric(5, 2),
                "claim_flag" character varying(20),
                "claim_flag_note" text,
                "notes" text,
                "created_by_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_48bb45b63581fd85e2cc5eff56f" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_financing_files_farm" ON "financing_files" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_financing_files_reference" ON "financing_files" ("program_id", "reference")
        `);
        await queryRunner.query(`
            CREATE TABLE "financing_documents" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "file_id" uuid NOT NULL,
                "requirement_id" uuid,
                "label" character varying(300) NOT NULL,
                "original_name" character varying(255) NOT NULL,
                "stored_name" character varying(80) NOT NULL,
                "mime" character varying(40) NOT NULL,
                "size_bytes" integer NOT NULL,
                "sha256" character varying(64) NOT NULL,
                "status" character varying(10) NOT NULL DEFAULT 'DEPOSE',
                "reject_reason" text,
                "uploaded_by_id" uuid,
                "uploaded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "reviewed_by_id" uuid,
                "reviewed_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_c6e76a3d3b518a734da503e15b0" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_financing_documents_file" ON "financing_documents" ("file_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "financing_disbursements" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "file_id" uuid NOT NULL,
                "number" integer NOT NULL,
                "planned_date" date,
                "amount_fcfa" integer NOT NULL,
                "condition" text,
                "status" character varying(10) NOT NULL DEFAULT 'PREVUE',
                "released_on" date,
                "visit_id" uuid,
                "note" text,
                "created_by_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_20d638a96d5b1bb44a1c5566eea" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_financing_disbursements_number" ON "financing_disbursements" ("file_id", "number")
        `);
        await queryRunner.query(`
            CREATE TABLE "farm_consents" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "program_id" uuid NOT NULL,
                "farm_id" uuid NOT NULL,
                "status" character varying(10) NOT NULL DEFAULT 'ACTIVE',
                "template_id" uuid NOT NULL,
                "template_version" integer NOT NULL,
                "template_sha256" character varying(64) NOT NULL,
                "method" character varying(10) NOT NULL,
                "signer_name" character varying(200) NOT NULL,
                "signer_quality" character varying(200),
                "granted_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "recorded_by_id" uuid,
                "ip" character varying(64),
                "user_agent" character varying(400),
                "proof_original_name" character varying(255),
                "proof_stored_name" character varying(80),
                "proof_mime" character varying(40),
                "proof_sha256" character varying(64),
                "withdrawn_at" TIMESTAMP WITH TIME ZONE,
                "withdrawn_by_id" uuid,
                "withdrawn_by_side" character varying(10),
                "withdraw_reason" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_3e38cc85d8fb442b42b996e5dd0" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_farm_consents_active" ON "farm_consents" ("farm_id")
            WHERE "status" = 'ACTIVE'
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_farm_consents_farm" ON "farm_consents" ("farm_id", "created_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "consent_templates" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "program_id" uuid NOT NULL,
                "version" integer NOT NULL,
                "title" character varying(200) NOT NULL,
                "purpose" text NOT NULL,
                "data_categories" jsonb NOT NULL,
                "retention" text NOT NULL,
                "original_name" character varying(255) NOT NULL,
                "stored_name" character varying(80) NOT NULL,
                "mime" character varying(40) NOT NULL,
                "size_bytes" integer NOT NULL,
                "sha256" character varying(64) NOT NULL,
                "confirmed_clauses" jsonb NOT NULL,
                "active" boolean NOT NULL DEFAULT true,
                "created_by_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_8dad5a4035191a16c11cdecf846" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_consent_templates_version" ON "consent_templates" ("program_id", "version")
        `);
        await queryRunner.query(`
            ALTER TABLE "financing_step_events"
            ADD CONSTRAINT "FK_3a08d7196c8b38b89131322fc79" FOREIGN KEY ("file_id") REFERENCES "financing_files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "financing_repayments"
            ADD CONSTRAINT "FK_7afd894e7206f2a22ea4c4e8dd6" FOREIGN KEY ("file_id") REFERENCES "financing_files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "financing_instalments"
            ADD CONSTRAINT "FK_f594a048319423b83a8d27ff8f0" FOREIGN KEY ("file_id") REFERENCES "financing_files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "financing_files"
            ADD CONSTRAINT "FK_52b0bea58e5d38245d3a537f791" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "financing_documents"
            ADD CONSTRAINT "FK_76e947fad1b67fcc475237939bc" FOREIGN KEY ("file_id") REFERENCES "financing_files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "financing_disbursements"
            ADD CONSTRAINT "FK_d0d0d697baad3edad18e63cbe22" FOREIGN KEY ("file_id") REFERENCES "financing_files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_consents"
            ADD CONSTRAINT "FK_3f0aa6b02f9ab244cd4d67769d9" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);

        for (const table of TABLES) {
            await queryRunner.query(`SELECT audit_attach('${table}')`);
        }
        for (const [i, r] of DEFAULT_REQUIREMENTS.entries()) {
            await queryRunner.query(
                `INSERT INTO "financing_requirements" ("program_id", "code", "label", "step", "required", "legal_basis", "sort")
                 SELECT p."id", $1, $2, $3, $4, $5, $6 FROM "programs" p
                 ON CONFLICT ("program_id", "code") DO NOTHING`,
                [r.code, r.label, r.step, r.required, r.legalBasis, (i + 1) * 10],
            );
        }
        await queryRunner.query(grantSql('BCEG', 'FINANCEMENT', ['CONSULTER', 'CREER', 'MODIFIER', 'VALIDER']));
        await queryRunner.query(grantSql('BCEG', 'PILOTAGE', ['CONSULTER']));
        await queryRunner.query(grantSql('BCEG', 'INTRANTS', ['CONSULTER']));
        await queryRunner.query(grantSql('DGE', 'FINANCEMENT', ['CONSULTER']));
        await queryRunner.query(grantSql('ADMIN', 'FINANCEMENT', ['CONSULTER']));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "access_profiles" SET "matrix" = "matrix" - 'FINANCEMENT', "updated_at" = now()
             WHERE "system" = true AND "code" IN ('BCEG', 'DGE', 'ADMIN')`);
        await queryRunner.query(`
            ALTER TABLE "farm_consents" DROP CONSTRAINT "FK_3f0aa6b02f9ab244cd4d67769d9"
        `);
        await queryRunner.query(`
            ALTER TABLE "financing_disbursements" DROP CONSTRAINT "FK_d0d0d697baad3edad18e63cbe22"
        `);
        await queryRunner.query(`
            ALTER TABLE "financing_documents" DROP CONSTRAINT "FK_76e947fad1b67fcc475237939bc"
        `);
        await queryRunner.query(`
            ALTER TABLE "financing_files" DROP CONSTRAINT "FK_52b0bea58e5d38245d3a537f791"
        `);
        await queryRunner.query(`
            ALTER TABLE "financing_instalments" DROP CONSTRAINT "FK_f594a048319423b83a8d27ff8f0"
        `);
        await queryRunner.query(`
            ALTER TABLE "financing_repayments" DROP CONSTRAINT "FK_7afd894e7206f2a22ea4c4e8dd6"
        `);
        await queryRunner.query(`
            ALTER TABLE "financing_step_events" DROP CONSTRAINT "FK_3a08d7196c8b38b89131322fc79"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_consent_templates_version"
        `);
        await queryRunner.query(`
            DROP TABLE "consent_templates"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_farm_consents_farm"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_farm_consents_active"
        `);
        await queryRunner.query(`
            DROP TABLE "farm_consents"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_financing_disbursements_number"
        `);
        await queryRunner.query(`
            DROP TABLE "financing_disbursements"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_financing_documents_file"
        `);
        await queryRunner.query(`
            DROP TABLE "financing_documents"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_financing_files_reference"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_financing_files_farm"
        `);
        await queryRunner.query(`
            DROP TABLE "financing_files"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_financing_instalments_number"
        `);
        await queryRunner.query(`
            DROP TABLE "financing_instalments"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_financing_repayments_file"
        `);
        await queryRunner.query(`
            DROP TABLE "financing_repayments"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_financing_requirements_code"
        `);
        await queryRunner.query(`
            DROP TABLE "financing_requirements"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_financing_step_events_file"
        `);
        await queryRunner.query(`
            DROP TABLE "financing_step_events"
        `);
    }
}
