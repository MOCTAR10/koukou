import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Journaled (AuditJournal). The vets' reference calendars
 * (`sanitary_protocols`, `protocol_steps`) are journaled from now on too.
 */
const JOURNALED = [
    'sanitary_alerts',
    'sanitary_alert_transitions',
    'health_event_photos',
    'notification_rules',
    'notifications',
    'sanitary_protocols',
    'protocol_steps',
];

/**
 * Lot L5 « Sanitaire et notifications »: declarations (clinical signs,
 * suspicion, offline idempotency key, photos), official sanitary alerts and
 * their history, notification rules and notifications.
 */
export class SanitarySurveillanceNotify1793958965095 implements MigrationInterface {
    name = 'SanitarySurveillanceNotify1793958965095'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."sanitary_alert_transitions_kind_enum" AS ENUM('CREATION', 'STATUT', 'PUBLICATION')
        `);
        await queryRunner.query(`
            CREATE TABLE "sanitary_alert_transitions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "alert_id" uuid NOT NULL,
                "kind" "public"."sanitary_alert_transitions_kind_enum" NOT NULL,
                "from_status_code" character varying(40),
                "to_status_code" character varying(40) NOT NULL,
                "to_family" character varying(40) NOT NULL,
                "comment" text,
                "author_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_7f1eb901a641d37b0d0e3e11340" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_sanitary_alert_transitions_alert" ON "sanitary_alert_transitions" ("alert_id", "created_at")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."sanitary_alerts_origin_enum" AS ENUM('MORTALITE', 'DECLARATION')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."sanitary_alerts_severity_enum" AS ENUM('VERT', 'JAUNE', 'ROUGE')
        `);
        await queryRunner.query(`
            CREATE TABLE "sanitary_alerts" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "code" character varying(20) NOT NULL,
                "program_id" uuid NOT NULL,
                "farm_id" uuid NOT NULL,
                "batch_id" uuid,
                "province_id" uuid,
                "origin" "public"."sanitary_alerts_origin_enum" NOT NULL,
                "health_event_id" uuid,
                "status_code" character varying(40) NOT NULL,
                "status_family" character varying(40) NOT NULL,
                "outcome" character varying(20),
                "severity" "public"."sanitary_alerts_severity_enum" NOT NULL,
                "fact_day" date NOT NULL,
                "last_fact_day" date NOT NULL,
                "mortality_pct" double precision,
                "threshold_pct" double precision,
                "deaths" integer,
                "present_start" integer,
                "clinical_signs" jsonb NOT NULL DEFAULT '[]',
                "summary" character varying(300) NOT NULL,
                "published_at" TIMESTAMP WITH TIME ZONE,
                "published_by_id" uuid,
                "closed_at" TIMESTAMP WITH TIME ZONE,
                "created_by_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_c0609e689f8c5479485d5705a07" UNIQUE ("code"),
                CONSTRAINT "PK_6020eb8de7524aeef9307789147" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_7a84d800d365a3f8d84f4b277e" ON "sanitary_alerts" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_34ce550ae7f6ace06148e74b30" ON "sanitary_alerts" ("province_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_sanitary_alerts_health_event" ON "sanitary_alerts" ("health_event_id")
            WHERE "health_event_id" IS NOT NULL
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_sanitary_alerts_batch_origin" ON "sanitary_alerts" ("batch_id", "origin")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_sanitary_alerts_program_published" ON "sanitary_alerts" ("program_id", "published_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "health_event_photos" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "health_event_id" uuid NOT NULL,
                "farm_id" uuid NOT NULL,
                "file_name" character varying(80) NOT NULL,
                "mime_type" character varying(40) NOT NULL,
                "size_bytes" integer NOT NULL,
                "sha256" character varying(64) NOT NULL,
                "created_by_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_742de21554dd5c778c2e3238b95" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_25d92b9685b490146f44de5fe9" ON "health_event_photos" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_health_event_photos_event_sha" ON "health_event_photos" ("health_event_id", "sha256")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."notifications_event_enum" AS ENUM(
                'ALERT_RAISED',
                'SANITARY_ALERT_CREATED',
                'SANITARY_ALERT_STATUS_CHANGED',
                'SANITARY_ALERT_PUBLISHED',
                'DECLARATION_RECEIVED',
                'WEIGHING_LATE',
                'SYNC_CONFLICT'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."notifications_severity_enum" AS ENUM('VERT', 'JAUNE', 'ROUGE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."notifications_channel_enum" AS ENUM('IN_APP', 'PUSH', 'SMS')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."notifications_status_enum" AS ENUM(
                'EN_ATTENTE',
                'ENVOYEE',
                'DISTRIBUEE',
                'LUE',
                'ECHEC'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "notifications" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "farm_id" uuid,
                "rule_id" uuid,
                "event" "public"."notifications_event_enum" NOT NULL,
                "subject_id" uuid,
                "dedup_key" character varying(200) NOT NULL,
                "severity" "public"."notifications_severity_enum" NOT NULL,
                "title" character varying(200) NOT NULL,
                "body" text NOT NULL,
                "payload" jsonb NOT NULL,
                "channel" "public"."notifications_channel_enum" NOT NULL,
                "status" "public"."notifications_status_enum" NOT NULL,
                "attempts" integer NOT NULL DEFAULT '0',
                "last_error" text,
                "next_attempt_at" TIMESTAMP WITH TIME ZONE,
                "escalate_at" TIMESTAMP WITH TIME ZONE,
                "escalated_at" TIMESTAMP WITH TIME ZONE,
                "escalated_from_id" uuid,
                "sent_at" TIMESTAMP WITH TIME ZONE,
                "delivered_at" TIMESTAMP WITH TIME ZONE,
                "read_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_notifications_status_next_attempt" ON "notifications" ("status", "next_attempt_at")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_notifications_user_channel_created" ON "notifications" ("user_id", "channel", "created_at")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_notifications_user_dedup_channel" ON "notifications" ("user_id", "dedup_key", "channel")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."notification_rules_event_enum" AS ENUM(
                'ALERT_RAISED',
                'SANITARY_ALERT_CREATED',
                'SANITARY_ALERT_STATUS_CHANGED',
                'SANITARY_ALERT_PUBLISHED',
                'DECLARATION_RECEIVED',
                'WEIGHING_LATE',
                'SYNC_CONFLICT'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."notification_rules_audience_enum" AS ENUM('PROFILE', 'FARM_MANAGERS', 'FARM_TEAM')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."notification_rules_severity_min_enum" AS ENUM('VERT', 'JAUNE', 'ROUGE')
        `);
        await queryRunner.query(`
            CREATE TABLE "notification_rules" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "program_id" uuid NOT NULL,
                "code" character varying(60) NOT NULL,
                "label" character varying(200) NOT NULL,
                "event" "public"."notification_rules_event_enum" NOT NULL,
                "audience" "public"."notification_rules_audience_enum" NOT NULL,
                "profile_code" character varying(40),
                "channels" jsonb NOT NULL DEFAULT '["IN_APP"]',
                "escalate_after_min" integer,
                "severity_min" "public"."notification_rules_severity_min_enum" NOT NULL DEFAULT 'VERT',
                "active" boolean NOT NULL DEFAULT true,
                "system" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_eb87ba4f7f01eabf003fcf4e65c" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_notification_rules_program_event" ON "notification_rules" ("program_id", "event")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_notification_rules_program_code" ON "notification_rules" ("program_id", "code")
        `);
        await queryRunner.query(`
            ALTER TABLE "health_events"
            ADD "clinical_signs" jsonb NOT NULL DEFAULT '[]'
        `);
        await queryRunner.query(`
            ALTER TABLE "health_events"
            ADD "suspicion" boolean NOT NULL DEFAULT false
        `);
        await queryRunner.query(`
            ALTER TABLE "health_events"
            ADD "idempotency_key" character varying(120)
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_health_events_farm_idempotency" ON "health_events" ("farm_id", "idempotency_key")
            WHERE "idempotency_key" IS NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "sanitary_alert_transitions"
            ADD CONSTRAINT "FK_3ca6682b306b196d0af99b38507" FOREIGN KEY ("alert_id") REFERENCES "sanitary_alerts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "sanitary_alerts"
            ADD CONSTRAINT "FK_7a84d800d365a3f8d84f4b277e1" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "sanitary_alerts"
            ADD CONSTRAINT "FK_d45e415c23c98da6f4ed6eae396" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "sanitary_alerts"
            ADD CONSTRAINT "FK_99025aa05b9e1f642b1d7a84073" FOREIGN KEY ("health_event_id") REFERENCES "health_events"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "health_event_photos"
            ADD CONSTRAINT "FK_b66d380b8a96e6ca6ed644000a6" FOREIGN KEY ("health_event_id") REFERENCES "health_events"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "notifications"
            ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
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
            ALTER TABLE "notifications" DROP CONSTRAINT "FK_9a8a82462cab47c73d25f49261f"
        `);
        await queryRunner.query(`
            ALTER TABLE "health_event_photos" DROP CONSTRAINT "FK_b66d380b8a96e6ca6ed644000a6"
        `);
        await queryRunner.query(`
            ALTER TABLE "sanitary_alerts" DROP CONSTRAINT "FK_99025aa05b9e1f642b1d7a84073"
        `);
        await queryRunner.query(`
            ALTER TABLE "sanitary_alerts" DROP CONSTRAINT "FK_d45e415c23c98da6f4ed6eae396"
        `);
        await queryRunner.query(`
            ALTER TABLE "sanitary_alerts" DROP CONSTRAINT "FK_7a84d800d365a3f8d84f4b277e1"
        `);
        await queryRunner.query(`
            ALTER TABLE "sanitary_alert_transitions" DROP CONSTRAINT "FK_3ca6682b306b196d0af99b38507"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_health_events_farm_idempotency"
        `);
        await queryRunner.query(`
            ALTER TABLE "health_events" DROP COLUMN "idempotency_key"
        `);
        await queryRunner.query(`
            ALTER TABLE "health_events" DROP COLUMN "suspicion"
        `);
        await queryRunner.query(`
            ALTER TABLE "health_events" DROP COLUMN "clinical_signs"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_notification_rules_program_code"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_notification_rules_program_event"
        `);
        await queryRunner.query(`
            DROP TABLE "notification_rules"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."notification_rules_severity_min_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."notification_rules_audience_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."notification_rules_event_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_notifications_user_dedup_channel"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_notifications_user_channel_created"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_notifications_status_next_attempt"
        `);
        await queryRunner.query(`
            DROP TABLE "notifications"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."notifications_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."notifications_channel_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."notifications_severity_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."notifications_event_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_health_event_photos_event_sha"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_25d92b9685b490146f44de5fe9"
        `);
        await queryRunner.query(`
            DROP TABLE "health_event_photos"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_sanitary_alerts_program_published"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_sanitary_alerts_batch_origin"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_sanitary_alerts_health_event"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_34ce550ae7f6ace06148e74b30"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_7a84d800d365a3f8d84f4b277e"
        `);
        await queryRunner.query(`
            DROP TABLE "sanitary_alerts"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."sanitary_alerts_severity_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."sanitary_alerts_origin_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_sanitary_alert_transitions_alert"
        `);
        await queryRunner.query(`
            DROP TABLE "sanitary_alert_transitions"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."sanitary_alert_transitions_kind_enum"
        `);
    }

}
