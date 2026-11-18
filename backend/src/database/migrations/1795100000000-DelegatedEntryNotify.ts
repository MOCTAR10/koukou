import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Jury lot 5 follow-up: notification event DELEGATED_ENTRY (« Saisie pour
 * votre compte »), appended in place to the two enums that list the events.
 * The default rule FERME_SAISIE_DELEGUEE (farm managers, in-app + push) is
 * seeded at boot by `NotificationRulesService`, which inserts every missing
 * default rule by code, never overwritten: no row uses the new value here.
 */
export class DelegatedEntryNotify1795100000000 implements MigrationInterface {
  name = 'DelegatedEntryNotify1795100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const type of ['notification_rules_event_enum', 'notifications_event_enum']) {
      await queryRunner.query(
        `ALTER TYPE "public"."${type}" ADD VALUE IF NOT EXISTS 'DELEGATED_ENTRY'`,
      );
    }
  }

  public async down(): Promise<void> {
    // Enum values cannot be dropped in place and the rule may already have
    // notified: they stay (an administrator deactivates the rule).
  }
}
