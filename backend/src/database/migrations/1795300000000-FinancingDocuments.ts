import { MigrationInterface, QueryRunner } from 'typeorm';

const EXPLOITANT_CODES = [
  'DEMANDE_FORMULAIRE',
  'DEMANDE_IDENTITE',
  'DEMANDE_STATUTS',
  'DEMANDE_IMMATRICULATION',
  'DEMANDE_PLAN_AFFAIRES',
  'INSTRUCTION_ETATS_FINANCIERS',
  'INSTRUCTION_GARANTIES',
  'DECAISSEMENT_ASSURANCE',
  'SUIVI_UTILISATION_FONDS',
];

/**
 * Financer workspace, third pass: the checklist becomes a configuration the
 * bank manages (who supplies each document, accepted formats, validity, blank
 * form) and documents carry their source and validity dates. Seeded rows get
 * `provided_by` (the consent row stays on the bank's side: it is satisfied by
 * the farm's active consent). Two notification events are appended in place to
 * the enums (default rules are seeded at boot).
 */
export class FinancingDocuments1795300000000 implements MigrationInterface {
  name = 'FinancingDocuments1795300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "financing_requirements"
        ADD COLUMN "provided_by" character varying(10) NOT NULL DEFAULT 'BCEG',
        ADD COLUMN "formats" jsonb NOT NULL DEFAULT '[]',
        ADD COLUMN "validity_months" integer,
        ADD COLUMN "template_original_name" character varying(255),
        ADD COLUMN "template_stored_name" character varying(80),
        ADD COLUMN "template_mime" character varying(40)
    `);
    await queryRunner.query(`
      ALTER TABLE "financing_documents"
        ADD COLUMN "source" character varying(10) NOT NULL DEFAULT 'BCEG',
        ADD COLUMN "issued_on" date,
        ADD COLUMN "expires_on" date
    `);
    await queryRunner.query(
      `UPDATE "financing_requirements" SET "provided_by" = 'EXPLOITANT' WHERE "code" = ANY($1)`,
      [EXPLOITANT_CODES],
    );
    await queryRunner.query(
      `UPDATE "financing_requirements" SET "validity_months" = 12 WHERE "code" = 'DECAISSEMENT_ASSURANCE'`,
    );
    for (const type of ['notification_rules_event_enum', 'notifications_event_enum']) {
      for (const value of ['FINANCING_DOCUMENT_REVIEWED', 'FINANCING_DOCUMENT_FILED']) {
        await queryRunner.query(`ALTER TYPE "public"."${type}" ADD VALUE IF NOT EXISTS '${value}'`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "financing_documents"
        DROP COLUMN "expires_on", DROP COLUMN "issued_on", DROP COLUMN "source"
    `);
    await queryRunner.query(`
      ALTER TABLE "financing_requirements"
        DROP COLUMN "template_mime", DROP COLUMN "template_stored_name",
        DROP COLUMN "template_original_name", DROP COLUMN "validity_months",
        DROP COLUMN "formats", DROP COLUMN "provided_by"
    `);
  }
}
