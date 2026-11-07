import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Next-visit reminders: notification events VISIT_REMINDER / VISIT_OVERDUE
 * and the audience VISIT_AGENT (the agent who planned the visit), appended in
 * place to the enums like the other lots' values. The default rules
 * AGENT_VISITE_RAPPEL / AGENT_VISITE_RETARD and the parameter VISITE_RAPPEL_J
 * are seeded at boot, never overwritten.
 */
export class VisitReminders1794420000000 implements MigrationInterface {
  name = 'VisitReminders1794420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const type of ['notification_rules_event_enum', 'notifications_event_enum']) {
      for (const value of ['VISIT_REMINDER', 'VISIT_OVERDUE']) {
        await queryRunner.query(
          `ALTER TYPE "public"."${type}" ADD VALUE IF NOT EXISTS '${value}'`,
        );
      }
    }
    await queryRunner.query(
      `ALTER TYPE "public"."notification_rules_audience_enum" ADD VALUE IF NOT EXISTS 'VISIT_AGENT'`,
    );
  }

  public async down(): Promise<void> {
    // Enum values cannot be dropped in place and the rules may have notified:
    // they stay (an administrator deactivates the rules).
  }
}
