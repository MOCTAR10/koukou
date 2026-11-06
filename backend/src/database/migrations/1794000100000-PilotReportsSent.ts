import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * POUFA lot A (pilot): reports are sent (CDC §5.4 « produits et envoyés
 * automatiquement »).
 * - New notification event REPORT_READY and audience REPORT_RECIPIENTS
 *   (appended in place, like the other lots' enum values). The default rule
 *   RAPPORT_DISPONIBLE (in-app + push) is seeded at boot by
 *   `NotificationRulesService`, never overwritten.
 * - Default recipients of the seeded templates: the weekly province report
 *   also goes to the ALL scope (DGE), and the weekly and monthly reports get
 *   the « Intrants et ressources » section. Templates an administrator has
 *   already tuned keep their choices for everything else.
 */
export class PilotReportsSent1794000100000 implements MigrationInterface {
    name = 'PilotReportsSent1794000100000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TYPE "public"."notification_rules_event_enum" ADD VALUE IF NOT EXISTS 'REPORT_READY'
        `);
        await queryRunner.query(`
            ALTER TYPE "public"."notifications_event_enum" ADD VALUE IF NOT EXISTS 'REPORT_READY'
        `);
        await queryRunner.query(`
            ALTER TYPE "public"."notification_rules_audience_enum" ADD VALUE IF NOT EXISTS 'REPORT_RECIPIENTS'
        `);
        await queryRunner.query(`
            UPDATE "report_templates"
               SET "audience" = jsonb_set(
                     "audience", '{scopeKinds}',
                     COALESCE("audience"->'scopeKinds', '[]'::jsonb) || '["ALL"]'::jsonb)
             WHERE "code" = 'HEBDOMADAIRE'
               AND NOT (COALESCE("audience"->'scopeKinds', '[]'::jsonb) ? 'ALL')
        `);
        await queryRunner.query(`
            UPDATE "report_templates"
               SET "sections" = "sections" || '["INTRANTS"]'::jsonb
             WHERE "code" IN ('HEBDOMADAIRE', 'MENSUEL_NATIONAL')
               AND NOT ("sections" ? 'INTRANTS')
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Enum values cannot be dropped in place, and the seeded rule may
        // already have notified: both stay (an administrator deactivates it).
        await queryRunner.query(`
            UPDATE "report_templates"
               SET "sections" = "sections" - 'INTRANTS'
             WHERE "code" IN ('HEBDOMADAIRE', 'MENSUEL_NATIONAL')
        `);
        await queryRunner.query(`
            UPDATE "report_templates"
               SET "audience" = jsonb_set("audience", '{scopeKinds}', ("audience"->'scopeKinds') - 'ALL')
             WHERE "code" = 'HEBDOMADAIRE'
        `);
    }
}
