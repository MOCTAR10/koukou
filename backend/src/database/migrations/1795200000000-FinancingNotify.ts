import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Financer workspace: notification events CONSENT_WITHDRAWN (a farmer
 * withdrew his consent to share data with the bank) and
 * FINANCING_STEP_CHANGED (a financing file changed step), appended in place to
 * the two enums that list the events. Their default rules
 * (BCEG_CONSENTEMENT_RETIRE, FERME_FINANCEMENT_ETAPE) are seeded at boot by
 * `NotificationRulesService`, which inserts every missing default rule by
 * code; no row uses the new values here.
 */
export class FinancingNotify1795200000000 implements MigrationInterface {
  name = 'FinancingNotify1795200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const type of ['notification_rules_event_enum', 'notifications_event_enum']) {
      for (const value of ['CONSENT_WITHDRAWN', 'FINANCING_STEP_CHANGED']) {
        await queryRunner.query(
          `ALTER TYPE "public"."${type}" ADD VALUE IF NOT EXISTS '${value}'`,
        );
      }
    }
  }

  public async down(): Promise<void> {
    // Enum values cannot be dropped in place and a rule may already have
    // notified: they stay (an administrator deactivates the rule).
  }
}
