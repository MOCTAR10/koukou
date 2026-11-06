import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * POUFA lot A2 vet (CDC §5.2 n° 26 « valident les événements »):
 * - the veterinary review of a declaration on `health_events` (decision,
 *   comment, author, date);
 * - notification event DECLARATION_REVIEWED (appended in place, like the
 *   other lots' enum values). The default rule FERME_DECLARATION_EXAMINEE
 *   (farm managers, in-app + push) is seeded at boot by
 *   `NotificationRulesService`, never overwritten.
 */
export class DeclarationReview1794100200100 implements MigrationInterface {
  name = 'DeclarationReview1794100200100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."health_events_vet_review_status_enum" AS ENUM('VALIDEE', 'INFIRMEE', 'ALERTE')
        `);
    await queryRunner.query(`
            ALTER TABLE "health_events"
            ADD "vet_review_status" "public"."health_events_vet_review_status_enum"
        `);
    await queryRunner.query(`
            ALTER TABLE "health_events"
            ADD "vet_review_comment" text
        `);
    await queryRunner.query(`
            ALTER TABLE "health_events"
            ADD "vet_reviewed_by_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "health_events"
            ADD "vet_reviewed_at" TIMESTAMP WITH TIME ZONE
        `);
    await queryRunner.query(`
            ALTER TYPE "public"."notification_rules_event_enum" ADD VALUE IF NOT EXISTS 'DECLARATION_REVIEWED'
        `);
    await queryRunner.query(`
            ALTER TYPE "public"."notifications_event_enum" ADD VALUE IF NOT EXISTS 'DECLARATION_REVIEWED'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Enum values cannot be dropped in place, and the seeded rule may
    // already have notified: they stay (an administrator deactivates it).
    await queryRunner.query(`
            ALTER TABLE "health_events" DROP COLUMN "vet_reviewed_at"
        `);
    await queryRunner.query(`
            ALTER TABLE "health_events" DROP COLUMN "vet_reviewed_by_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "health_events" DROP COLUMN "vet_review_comment"
        `);
    await queryRunner.query(`
            ALTER TABLE "health_events" DROP COLUMN "vet_review_status"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."health_events_vet_review_status_enum"
        `);
  }
}
