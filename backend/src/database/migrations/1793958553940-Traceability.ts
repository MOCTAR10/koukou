import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Traceability MVP (POUFA L7): lots, their events, the operators registry
 * and the QR scan journal. `qr_scans` is not journaled on purpose: it is
 * itself an append-only journal (trigger below) fed by anonymous public
 * traffic, and level-2 rows would only duplicate each insert. The lots'
 * QR signature is kept out of the journal (redacted).
 */
const JOURNALED: [string, string[]][] = [
    ['operators', []],
    ['trace_lots', ['qr_token']],
    ['lot_events', []],
];

export class Traceability1793958553940 implements MigrationInterface {
    name = 'Traceability1793958553940'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."trace_lots_kind_enum" AS ENUM('LOT', 'SOUS_LOT', 'DERIVE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."trace_lots_status_enum" AS ENUM('OUVERT', 'CEDE', 'RECU', 'CLOS')
        `);
        await queryRunner.query(`
            CREATE TABLE "trace_lots" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "program_id" uuid NOT NULL,
                "farm_id" uuid NOT NULL,
                "batch_id" uuid NOT NULL,
                "parent_id" uuid,
                "kind" "public"."trace_lots_kind_enum" NOT NULL,
                "code" character varying(60) NOT NULL,
                "quantity" integer NOT NULL,
                "weight_kg" double precision,
                "status" "public"."trace_lots_status_enum" NOT NULL DEFAULT 'OUVERT',
                "qr_token" character varying(32) NOT NULL,
                "operator_id" uuid,
                "sortie_id" uuid,
                "ceded_on" date,
                "closed_at" TIMESTAMP WITH TIME ZONE,
                "created_by_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_f0dcfbbeeef4738f7f70554ae3a" UNIQUE ("code"),
                CONSTRAINT "PK_9c7e71c413f13c327e76c27f1e1" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_5691ea0c4863999fb898b05192" ON "trace_lots" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_1ecaeaf721a1bb8eccfbf1529b" ON "trace_lots" ("batch_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_d0f94c431de283932c99a96c8a" ON "trace_lots" ("parent_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_trace_lots_sortie" ON "trace_lots" ("sortie_id")
            WHERE "sortie_id" IS NOT NULL
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_trace_lots_root_per_batch" ON "trace_lots" ("batch_id")
            WHERE "parent_id" IS NULL
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."qr_scans_result_enum" AS ENUM('OK', 'INCONNU', 'CLOS', 'SIGNATURE_INVALIDE')
        `);
        await queryRunner.query(`
            CREATE TABLE "qr_scans" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "lot_id" uuid,
                "code" character varying(80) NOT NULL,
                "token" character varying(64),
                "scanned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "ip_hash" character varying(64),
                "user_agent" character varying(300),
                "geo_cell" character varying(24),
                "result" "public"."qr_scans_result_enum" NOT NULL,
                CONSTRAINT "PK_f43b8280df24c98d0d5ba6db766" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_qr_scans_lot_at" ON "qr_scans" ("lot_id", "scanned_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "operators" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "program_id" uuid NOT NULL,
                "code" character varying(20) NOT NULL,
                "type_code" character varying(40) NOT NULL,
                "name" character varying(160) NOT NULL,
                "localite_id" uuid,
                "address" character varying(255),
                "contact_name" character varying(120),
                "contact_phone" character varying(40),
                "contact_email" character varying(160),
                "convention_ref" character varying(80),
                "convention_signed_at" date,
                "active" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_3d02b3692836893720335a79d1b" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_operators_program_code" ON "operators" ("program_id", "code")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."lot_events_type_enum" AS ENUM(
                'CESSION',
                'RECEPTION',
                'TRANSFORMATION',
                'TRANSPORT',
                'CONTROLE_DISTRIBUTEUR'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "lot_events" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "lot_id" uuid NOT NULL,
                "type" "public"."lot_events_type_enum" NOT NULL,
                "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "actor_id" uuid,
                "operator_id" uuid,
                "sortie_id" uuid,
                "data" jsonb NOT NULL DEFAULT '{}',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_3edaa5f8ad839d9456e04d29389" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_lot_events_lot_at" ON "lot_events" ("lot_id", "occurred_at")
        `);
        await queryRunner.query(`
            ALTER TABLE "customers"
            ADD "operator_id" uuid
        `);
        await queryRunner.query(`
            ALTER TABLE "trace_lots"
            ADD CONSTRAINT "FK_d4854973872070afb45c543e1e1" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "trace_lots"
            ADD CONSTRAINT "FK_5691ea0c4863999fb898b051928" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "trace_lots"
            ADD CONSTRAINT "FK_1ecaeaf721a1bb8eccfbf1529b7" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "trace_lots"
            ADD CONSTRAINT "FK_d0f94c431de283932c99a96c8af" FOREIGN KEY ("parent_id") REFERENCES "trace_lots"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "trace_lots"
            ADD CONSTRAINT "FK_030d88e051cb7b08e4ee93e634d" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "trace_lots"
            ADD CONSTRAINT "FK_9628a0626070aaea47d042e20a3" FOREIGN KEY ("sortie_id") REFERENCES "sorties"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "qr_scans"
            ADD CONSTRAINT "FK_fafb75433fa45b8909d2d7ca4a9" FOREIGN KEY ("lot_id") REFERENCES "trace_lots"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "operators"
            ADD CONSTRAINT "FK_5e73159b102aa4d74d973c934d2" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "operators"
            ADD CONSTRAINT "FK_1ddb28e7a541cd578475be69b07" FOREIGN KEY ("localite_id") REFERENCES "localites"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "lot_events"
            ADD CONSTRAINT "FK_15f42c96e24d5b9db810a03719c" FOREIGN KEY ("lot_id") REFERENCES "trace_lots"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "lot_events"
            ADD CONSTRAINT "FK_68f4a2cda6aeddaa7540893fab9" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "customers"
            ADD CONSTRAINT "FK_b7cc12ea17a9a1aea60807496df" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        // Before the operator registry existed, `sorties.operator_id` was free
        // (no foreign key): any value there points at nothing.
        await queryRunner.query(`
            UPDATE "sorties" SET "operator_id" = NULL WHERE "operator_id" IS NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "sorties"
            ADD CONSTRAINT "FK_a5c383afc0185df6753f9d92b74" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        // Hand-written (TypeORM does not track triggers). A lot or operator
        // code is never changed once handed out (never reused either: the
        // IdCounter never goes back).
        await queryRunner.query(`
            CREATE FUNCTION "trace_code_immutable"() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                IF NEW.code IS DISTINCT FROM OLD.code THEN
                    RAISE EXCEPTION 'Le code d''un lot ou d''un opérateur ne peut pas être modifié.';
                END IF;
                RETURN NEW;
            END
            $$
        `);
        for (const table of ['trace_lots', 'operators']) {
            await queryRunner.query(`
                CREATE TRIGGER "${table}_code_immutable"
                BEFORE UPDATE OF code ON "${table}"
                FOR EACH ROW EXECUTE FUNCTION "trace_code_immutable"()
            `);
        }
        // The scan journal is append-only.
        await queryRunner.query(`
            CREATE FUNCTION "qr_scans_append_only"() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION 'Le journal des scans QR ne peut être ni modifié ni supprimé.';
            END
            $$
        `);
        await queryRunner.query(`
            CREATE TRIGGER "qr_scans_append_only"
            BEFORE UPDATE OR DELETE ON "qr_scans"
            FOR EACH ROW EXECUTE FUNCTION "qr_scans_append_only"()
        `);
        for (const [table, redacted] of JOURNALED) {
            await queryRunner.query(
                `SELECT audit_attach($1::regclass, 'id', $2::text[])`,
                [table, redacted],
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const [table] of JOURNALED) {
            await queryRunner.query(`SELECT audit_detach($1::regclass)`, [
                table,
            ]);
        }
        await queryRunner.query(`
            DROP TRIGGER "qr_scans_append_only" ON "qr_scans"
        `);
        await queryRunner.query(`
            DROP FUNCTION "qr_scans_append_only"()
        `);
        for (const table of ['trace_lots', 'operators']) {
            await queryRunner.query(`
                DROP TRIGGER "${table}_code_immutable" ON "${table}"
            `);
        }
        await queryRunner.query(`
            DROP FUNCTION "trace_code_immutable"()
        `);
        await queryRunner.query(`
            ALTER TABLE "sorties" DROP CONSTRAINT "FK_a5c383afc0185df6753f9d92b74"
        `);
        await queryRunner.query(`
            ALTER TABLE "customers" DROP CONSTRAINT "FK_b7cc12ea17a9a1aea60807496df"
        `);
        await queryRunner.query(`
            ALTER TABLE "lot_events" DROP CONSTRAINT "FK_68f4a2cda6aeddaa7540893fab9"
        `);
        await queryRunner.query(`
            ALTER TABLE "lot_events" DROP CONSTRAINT "FK_15f42c96e24d5b9db810a03719c"
        `);
        await queryRunner.query(`
            ALTER TABLE "operators" DROP CONSTRAINT "FK_1ddb28e7a541cd578475be69b07"
        `);
        await queryRunner.query(`
            ALTER TABLE "operators" DROP CONSTRAINT "FK_5e73159b102aa4d74d973c934d2"
        `);
        await queryRunner.query(`
            ALTER TABLE "qr_scans" DROP CONSTRAINT "FK_fafb75433fa45b8909d2d7ca4a9"
        `);
        await queryRunner.query(`
            ALTER TABLE "trace_lots" DROP CONSTRAINT "FK_9628a0626070aaea47d042e20a3"
        `);
        await queryRunner.query(`
            ALTER TABLE "trace_lots" DROP CONSTRAINT "FK_030d88e051cb7b08e4ee93e634d"
        `);
        await queryRunner.query(`
            ALTER TABLE "trace_lots" DROP CONSTRAINT "FK_d0f94c431de283932c99a96c8af"
        `);
        await queryRunner.query(`
            ALTER TABLE "trace_lots" DROP CONSTRAINT "FK_1ecaeaf721a1bb8eccfbf1529b7"
        `);
        await queryRunner.query(`
            ALTER TABLE "trace_lots" DROP CONSTRAINT "FK_5691ea0c4863999fb898b051928"
        `);
        await queryRunner.query(`
            ALTER TABLE "trace_lots" DROP CONSTRAINT "FK_d4854973872070afb45c543e1e1"
        `);
        await queryRunner.query(`
            ALTER TABLE "customers" DROP COLUMN "operator_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_lot_events_lot_at"
        `);
        await queryRunner.query(`
            DROP TABLE "lot_events"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."lot_events_type_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_operators_program_code"
        `);
        await queryRunner.query(`
            DROP TABLE "operators"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_qr_scans_lot_at"
        `);
        await queryRunner.query(`
            DROP TABLE "qr_scans"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."qr_scans_result_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_trace_lots_root_per_batch"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_trace_lots_sortie"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_d0f94c431de283932c99a96c8a"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_1ecaeaf721a1bb8eccfbf1529b"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_5691ea0c4863999fb898b05192"
        `);
        await queryRunner.query(`
            DROP TABLE "trace_lots"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."trace_lots_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."trace_lots_kind_enum"
        `);
    }

}
