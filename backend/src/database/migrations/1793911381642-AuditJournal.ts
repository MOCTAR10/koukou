import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Audit journal (POUFA lot L1b, ANINF requirement).
 *
 * Generated part: the tables `audit_events` (level 1, actions),
 * `audit_row_changes` (level 2, row before/after) and `audit_seals` (daily
 * hash chain). Hand-written part (invisible to `migration:check`):
 *
 * - `audit_row_change()`: row trigger function. Reads the transaction-local
 *   settings `app.request_id` / `app.actor_id` (set by
 *   `AuditContextSubscriber` at each transaction start). An UPDATE that
 *   changes nothing but `updated_at` / `updatedAt` is skipped. Trigger
 *   arguments: the id column, then the columns never stored (redacted).
 * - `audit_attach(tbl, id_column = 'id', redacted = '{}')` /
 *   `audit_detach(tbl)`: later migrations only run
 *   `SELECT audit_attach('table')`.
 * - `audit_forbid_change()`: the three audit tables refuse UPDATE, DELETE and
 *   TRUNCATE, whoever asks (docs/audit-deploiement.md gives the SQL rights of
 *   the production role).
 */

/** Key tables journaled at row level: [table, id column, redacted columns]. */
const AUDITED_TABLES: [string, string, string[]][] = [
    ['farms', 'id', []],
    ['farm_employees', 'id', []],
    ['users', 'id', ['passwordHash', 'password_hash']],
    ['production_batches', 'id', []],
    ['daily_entries', 'id', []],
    ['input_lots', 'id', []],
    ['health_events', 'id', []],
    ['treatment_records', 'id', []],
    ['prophylaxis_events', 'id', []],
    ['alerts', 'id', []],
    ['reference_constants', 'key', []],
    ['sales', 'id', []],
    ['slaughter_orders', 'id', []],
    ['orders', 'id', []],
];

const IMMUTABLE_TABLES = ['audit_events', 'audit_row_changes', 'audit_seals'];

export class AuditJournal1793911381642 implements MigrationInterface {
    name = 'AuditJournal1793911381642'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "audit_seals" (
                "day" date NOT NULL,
                "events_count" integer NOT NULL,
                "row_changes_count" integer NOT NULL,
                "hash" character varying(64) NOT NULL,
                "prev_hash" character varying(64),
                "sealed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_0fbb39728b6340cfe29811ecba0" PRIMARY KEY ("day")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "audit_row_changes" (
                "id" BIGSERIAL NOT NULL,
                "at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "request_id" uuid,
                "actor_user_id" uuid,
                "txid" bigint NOT NULL DEFAULT txid_current(),
                "table_name" character varying(100) NOT NULL,
                "row_id" text,
                "op" character(1) NOT NULL,
                "before" jsonb,
                "after" jsonb,
                CONSTRAINT "PK_00f72fd1af6cb8388951c86a179" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_audit_row_changes_at" ON "audit_row_changes" ("at")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_audit_row_changes_request_id" ON "audit_row_changes" ("request_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_audit_row_changes_table_row" ON "audit_row_changes" ("table_name", "row_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."audit_action_enum" AS ENUM(
                'WRITE',
                'READ_SENSITIVE',
                'EXPORT',
                'LOGIN',
                'LOGIN_FAILED',
                'SYSTEM'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "audit_events" (
                "id" BIGSERIAL NOT NULL,
                "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "request_id" uuid,
                "action" "public"."audit_action_enum" NOT NULL,
                "actor_user_id" uuid,
                "actor_role" character varying(40),
                "farm_id" uuid,
                "method" character varying(10) NOT NULL,
                "route" character varying(300) NOT NULL,
                "params" jsonb,
                "status_code" integer,
                "ip" character varying(64),
                "user_agent" character varying(300),
                "offline_op_id" character varying(120),
                "summary" jsonb,
                "error_message" text,
                CONSTRAINT "PK_910f64d901a5c3e9878f0d4a407" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_audit_events_occurred_at" ON "audit_events" ("occurred_at")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_audit_events_request_id" ON "audit_events" ("request_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_audit_events_actor_user_id" ON "audit_events" ("actor_user_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_audit_events_farm_id" ON "audit_events" ("farm_id")
        `);

        // --- Hand-written: row-level journal (level 2) ------------------------
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger
            LANGUAGE plpgsql AS $fn$
            DECLARE
                id_column text := COALESCE(TG_ARGV[0], 'id');
                redacted text[] := COALESCE(TG_ARGV[1:TG_NARGS - 1], '{}'::text[]);
                uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
                req text := NULLIF(current_setting('app.request_id', true), '');
                actor text := NULLIF(current_setting('app.actor_id', true), '');
                old_row jsonb;
                new_row jsonb;
                after_row jsonb;
                changed text[];
                secret_changed text[];
            BEGIN
                IF TG_OP IN ('UPDATE', 'DELETE') THEN old_row := to_jsonb(OLD); END IF;
                IF TG_OP IN ('UPDATE', 'INSERT') THEN new_row := to_jsonb(NEW); END IF;
                IF TG_OP = 'UPDATE' THEN
                    SELECT array_agg(n.key ORDER BY n.key) INTO changed
                    FROM jsonb_each(new_row) AS n
                    WHERE n.key NOT IN ('updated_at', 'updatedAt')
                      AND (old_row -> n.key) IS DISTINCT FROM n.value;
                    IF changed IS NULL THEN
                        RETURN NULL;
                    END IF;
                END IF;
                after_row := new_row - redacted;
                IF changed IS NOT NULL THEN
                    SELECT array_agg(c) INTO secret_changed
                    FROM unnest(changed) AS c WHERE c = ANY (redacted);
                    IF secret_changed IS NOT NULL THEN
                        -- A secret changed (password): say so, never store it.
                        after_row := after_row || jsonb_build_object('_redacted_changed', to_jsonb(secret_changed));
                    END IF;
                END IF;
                INSERT INTO audit_row_changes (request_id, actor_user_id, table_name, row_id, op, before, after)
                VALUES (
                    CASE WHEN req ~ uuid_re THEN req::uuid END,
                    CASE WHEN actor ~ uuid_re THEN actor::uuid END,
                    TG_TABLE_NAME,
                    COALESCE(new_row, old_row) ->> id_column,
                    left(TG_OP, 1),
                    old_row - redacted,
                    after_row
                );
                RETURN NULL;
            END
            $fn$
        `);
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION audit_attach(
                tbl regclass,
                id_column text DEFAULT 'id',
                redacted text[] DEFAULT '{}'
            ) RETURNS void
            LANGUAGE plpgsql AS $fn$
            DECLARE
                args text;
            BEGIN
                SELECT string_agg(quote_literal(a), ', ' ORDER BY ord) INTO args
                FROM unnest(array_prepend(id_column, redacted)) WITH ORDINALITY AS t(a, ord);
                EXECUTE format('DROP TRIGGER IF EXISTS audit_row_change ON %s', tbl);
                EXECUTE format(
                    'CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON %s '
                    'FOR EACH ROW EXECUTE FUNCTION audit_row_change(%s)',
                    tbl, args
                );
            END
            $fn$
        `);
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION audit_detach(tbl regclass) RETURNS void
            LANGUAGE plpgsql AS $fn$
            BEGIN
                EXECUTE format('DROP TRIGGER IF EXISTS audit_row_change ON %s', tbl);
            END
            $fn$
        `);
        for (const [table, idColumn, redacted] of AUDITED_TABLES) {
            await queryRunner.query(
                `SELECT audit_attach($1::regclass, $2, $3::text[])`,
                [table, idColumn, redacted],
            );
        }

        // --- Hand-written: the journal is append-only --------------------------
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION audit_forbid_change() RETURNS trigger
            LANGUAGE plpgsql AS $fn$
            BEGIN
                RAISE EXCEPTION 'Journal d''audit non modifiable : % refusé sur la table %.', TG_OP, TG_TABLE_NAME
                    USING ERRCODE = 'insufficient_privilege',
                          HINT = 'Le journal d''audit est en ajout seul : aucune ligne ne peut être modifiée ni supprimée.';
            END
            $fn$
        `);
        for (const table of IMMUTABLE_TABLES) {
            await queryRunner.query(`
                CREATE TRIGGER "${table}_append_only" BEFORE UPDATE OR DELETE ON "${table}"
                FOR EACH ROW EXECUTE FUNCTION audit_forbid_change()
            `);
            await queryRunner.query(`
                CREATE TRIGGER "${table}_no_truncate" BEFORE TRUNCATE ON "${table}"
                FOR EACH STATEMENT EXECUTE FUNCTION audit_forbid_change()
            `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // --- Hand-written part, in reverse --------------------------------------
        for (const [table] of AUDITED_TABLES) {
            await queryRunner.query(`SELECT audit_detach($1::regclass)`, [table]);
        }
        await queryRunner.query(`DROP FUNCTION audit_detach(regclass)`);
        await queryRunner.query(`DROP FUNCTION audit_attach(regclass, text, text[])`);
        await queryRunner.query(`DROP FUNCTION audit_row_change()`);
        // The append-only triggers go with their tables (DROP is not TRUNCATE).

        await queryRunner.query(`
            DROP INDEX "public"."IDX_audit_events_farm_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_audit_events_actor_user_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_audit_events_request_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_audit_events_occurred_at"
        `);
        await queryRunner.query(`
            DROP TABLE "audit_events"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."audit_action_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_audit_row_changes_table_row"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_audit_row_changes_request_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_audit_row_changes_at"
        `);
        await queryRunner.query(`
            DROP TABLE "audit_row_changes"
        `);
        await queryRunner.query(`
            DROP TABLE "audit_seals"
        `);
        await queryRunner.query(`DROP FUNCTION audit_forbid_change()`);
    }

}
