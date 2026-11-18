import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Notes vocales de déclaration sanitaire: `health_event_audio` (same shape as
 * the photos, plus the recorded duration), unique per declaration and content
 * hash, journaled by the row trigger. The files live outside the public static
 * route.
 */
export class HealthEventAudio1794900000000 implements MigrationInterface {
    name = 'HealthEventAudio1794900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "health_event_audio" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "health_event_id" uuid NOT NULL,
                "farm_id" uuid NOT NULL,
                "file_name" character varying(80) NOT NULL,
                "mime_type" character varying(40) NOT NULL,
                "size_bytes" integer NOT NULL,
                "duration_ms" integer,
                "sha256" character varying(64) NOT NULL,
                "created_by_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_193b6d59935f30f243066a6fd74" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_3583ed422bab2e892a9b72d875" ON "health_event_audio" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_health_event_audio_event_sha" ON "health_event_audio" ("health_event_id", "sha256")
        `);
        await queryRunner.query(`
            ALTER TABLE "health_event_audio"
            ADD CONSTRAINT "FK_0121aa398c3302b09f0bdb35299" FOREIGN KEY ("health_event_id") REFERENCES "health_events"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`SELECT audit_attach('health_event_audio'::regclass, 'id')`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`SELECT audit_detach('health_event_audio'::regclass)`);
        await queryRunner.query(`ALTER TABLE "health_event_audio" DROP CONSTRAINT "FK_0121aa398c3302b09f0bdb35299"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_health_event_audio_event_sha"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3583ed422bab2e892a9b72d875"`);
        await queryRunner.query(`DROP TABLE "health_event_audio"`);
    }
}
