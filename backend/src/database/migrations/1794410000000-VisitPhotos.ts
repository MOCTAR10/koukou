import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Photos de visite technique: `farm_visit_photos` (same shape as the photos of
 * a sanitary declaration, bound to the visit, unique per visit and content
 * hash), journaled by the row trigger. The files live outside the public
 * static route.
 */
export class VisitPhotos1794410000000 implements MigrationInterface {
    name = 'VisitPhotos1794410000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "farm_visit_photos" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "visit_id" uuid NOT NULL,
                "farm_id" uuid NOT NULL,
                "file_name" character varying(80) NOT NULL,
                "mime_type" character varying(40) NOT NULL,
                "size_bytes" integer NOT NULL,
                "sha256" character varying(64) NOT NULL,
                "created_by_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_farm_visit_photos" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_d6976bad8844b9ba34bfc0dcb6" ON "farm_visit_photos" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_farm_visit_photos_visit_sha" ON "farm_visit_photos" ("visit_id", "sha256")
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_visit_photos"
            ADD CONSTRAINT "FK_a33e0852f60e350ae1e42ebd90d" FOREIGN KEY ("visit_id") REFERENCES "farm_visits"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`SELECT audit_attach('farm_visit_photos'::regclass, 'id')`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`SELECT audit_detach('farm_visit_photos'::regclass)`);
        await queryRunner.query(`ALTER TABLE "farm_visit_photos" DROP CONSTRAINT "FK_a33e0852f60e350ae1e42ebd90d"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_farm_visit_photos_visit_sha"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d6976bad8844b9ba34bfc0dcb6"`);
        await queryRunner.query(`DROP TABLE "farm_visit_photos"`);
    }
}
