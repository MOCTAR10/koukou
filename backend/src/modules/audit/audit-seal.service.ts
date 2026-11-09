import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import {
  addUtcDays,
  lastSealableDay,
  SealHasher,
  utcDay,
  utcDayBounds,
} from './audit-canonical.js';
import { AuditService } from './audit.service.js';
import { dateFr } from '../../common/utils/date.utils.js';

const SEAL_INTERVAL_MS = 60 * 60 * 1000;
/** A day is sealed 15 minutes after it ends (UTC), see `lastSealableDay`. */
export const SEAL_GRACE_MS = 15 * 60 * 1000;
const BATCH = 1000;
/** `pg_advisory_xact_lock` key: one sealer at a time across instances. */
const SEAL_LOCK_KEY = 7_420_310_001;

const TS = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** Every column, as text: the canonical form does not depend on the driver. */
const EVENT_COLUMNS = `id::text AS id, ${TS('occurred_at')} AS occurred_at,
  request_id::text AS request_id, action::text AS action,
  actor_user_id::text AS actor_user_id, actor_role, farm_id::text AS farm_id,
  method, route, params::text AS params, status_code::text AS status_code,
  ip, user_agent, offline_op_id, summary::text AS summary, error_message`;

const ROW_CHANGE_COLUMNS = `id::text AS id, ${TS('at')} AS at,
  request_id::text AS request_id, actor_user_id::text AS actor_user_id,
  txid::text AS txid, table_name, row_id, op::text AS op,
  before::text AS before, after::text AS after`;

export interface SealRow {
  day: string;
  eventsCount: number;
  rowChangesCount: number;
  hash: string;
  prevHash: string | null;
}

export type SealMismatchReason =
  'HASH' | 'COUNT' | 'CHAIN' | 'GAP' | 'UNSEALED_BEFORE_FIRST_SEAL';

export interface SealVerification {
  ok: boolean;
  checkedDays: number;
  firstDay: string | null;
  lastDay: string | null;
  mismatch: {
    day: string;
    reason: SealMismatchReason;
    message: string;
    expected?: unknown;
    actual?: unknown;
  } | null;
}

/**
 * Daily seal of the audit journal: each fully elapsed UTC day gets a SHA-256
 * over the previous seal's hash and every event and row change of the day
 * (`audit-canonical.ts`), so a removed, altered or back-dated row breaks the
 * chain. Runs at boot and hourly (plain `setInterval`, like `TasksService`);
 * `AUDIT_SEAL_DISABLED=true` turns the timer off (e2e).
 */
@Injectable()
export class AuditSealService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AuditSealService.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<SealRow[]>;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.AUDIT_SEAL_DISABLED === 'true') return;
    const run = () =>
      void this.sealPendingDays().catch((err) =>
        this.logger.error('Scellement du journal d’audit', err),
      );
    run();
    this.timer = setInterval(run, SEAL_INTERVAL_MS);
    // Never keep the process alive just for the seal.
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Seals, in order, every elapsed day not sealed yet. Returns the new seals. */
  sealPendingDays(now = new Date()): Promise<SealRow[]> {
    // One pass at a time in this process; the advisory lock covers the others.
    this.running ??= this.sealPass(now).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async sealPass(now: Date): Promise<SealRow[]> {
    const sealed = await this.dataSource.transaction(async (em) => {
      await em.query('SELECT pg_advisory_xact_lock($1)', [SEAL_LOCK_KEY]);
      const [last] = (await em.query(
        `SELECT day::text AS day, hash FROM audit_seals ORDER BY day DESC LIMIT 1`,
      )) as { day: string; hash: string }[];
      let day: string | null = last ? addUtcDays(last.day, 1) : null;
      if (!day) {
        const [{ earliest }] = (await em.query(
          `SELECT LEAST(
             (SELECT min(occurred_at) FROM audit_events),
             (SELECT min(at) FROM audit_row_changes)
           ) AS earliest`,
        )) as { earliest: Date | null }[];
        if (!earliest) return [];
        day = utcDay(new Date(earliest));
      }
      const lastDay = lastSealableDay(now, SEAL_GRACE_MS);
      const created: SealRow[] = [];
      let prevHash = last?.hash ?? null;
      for (; day <= lastDay; day = addUtcDays(day, 1)) {
        const seal = await this.computeDay(em, day, prevHash);
        await em.query(
          `INSERT INTO audit_seals (day, events_count, row_changes_count, hash, prev_hash)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            seal.day,
            seal.eventsCount,
            seal.rowChangesCount,
            seal.hash,
            seal.prevHash,
          ],
        );
        created.push(seal);
        prevHash = seal.hash;
      }
      return created;
    });
    if (sealed.length > 0) {
      const lastSeal = sealed[sealed.length - 1];
      this.logger.log(
        `Journal d’audit scellé : ${sealed.length} jour(s), jusqu’au ${dateFr(lastSeal.day)}.`,
      );
      await this.audit.recordSystem('audit:seal', {
        days: sealed.map((s) => s.day),
        lastHash: lastSeal.hash,
      });
    }
    return sealed;
  }

  /** Recomputes the seal of one day from the journal, by id order. */
  async computeDay(
    em: EntityManager,
    day: string,
    prevHash: string | null,
  ): Promise<SealRow> {
    const { start, end } = utcDayBounds(day);
    const hasher = new SealHasher(prevHash, day);
    await this.scan(
      em,
      'audit_events',
      'occurred_at',
      EVENT_COLUMNS,
      start,
      end,
      (row) => hasher.addEvent(row),
    );
    await this.scan(
      em,
      'audit_row_changes',
      'at',
      ROW_CHANGE_COLUMNS,
      start,
      end,
      (row) => hasher.addRowChange(row),
    );
    return {
      day,
      eventsCount: hasher.eventsCount,
      rowChangesCount: hasher.rowChangesCount,
      hash: hasher.digest(),
      prevHash,
    };
  }

  private async scan(
    em: EntityManager,
    table: string,
    timeColumn: string,
    columns: string,
    start: Date,
    end: Date,
    feed: (row: Record<string, unknown>) => void,
  ): Promise<void> {
    let after = '0';
    for (;;) {
      const rows = (await em.query(
        `SELECT ${columns} FROM ${table}
         WHERE ${timeColumn} >= $1::timestamptz AND ${timeColumn} < $2::timestamptz
           AND id > $3::bigint
         ORDER BY id LIMIT ${BATCH}`,
        [start.toISOString(), end.toISOString(), after],
      )) as Record<string, unknown>[];
      for (const row of rows) feed(row);
      if (rows.length < BATCH) return;
      after = String(rows[rows.length - 1].id);
    }
  }

  async listSeals(from?: string, to?: string): Promise<SealRow[]> {
    const rows = (await this.dataSource.query(
      `SELECT day::text AS day, events_count AS "eventsCount",
              row_changes_count AS "rowChangesCount", hash, prev_hash AS "prevHash",
              sealed_at AS "sealedAt"
       FROM audit_seals
       WHERE ($1::date IS NULL OR day >= $1::date) AND ($2::date IS NULL OR day <= $2::date)
       ORDER BY day DESC`,
      [from ?? null, to ?? null],
    )) as SealRow[];
    return rows;
  }

  /**
   * Recomputes every seal between `fromDay` and `toDay` (all by default) and
   * reports the first mismatch: altered or added row (HASH / COUNT), broken
   * chain (CHAIN), missing day (GAP), or — on a full check — rows older than
   * the first seal (UNSEALED_BEFORE_FIRST_SEAL).
   */
  async verify(fromDay?: string, toDay?: string): Promise<SealVerification> {
    const seals = (await this.dataSource.query(
      `SELECT day::text AS day, events_count AS "eventsCount",
              row_changes_count AS "rowChangesCount", hash, prev_hash AS "prevHash"
       FROM audit_seals ORDER BY day`,
    )) as SealRow[];
    const result: SealVerification = {
      ok: true,
      checkedDays: 0,
      firstDay: null,
      lastDay: null,
      mismatch: null,
    };
    if (seals.length === 0) return result;

    const fail = (
      mismatch: NonNullable<SealVerification['mismatch']>,
    ): SealVerification => ({ ...result, ok: false, mismatch });

    if (!fromDay) {
      const { start } = utcDayBounds(seals[0].day);
      const [{ n }] = (await this.dataSource.query(
        `SELECT (SELECT count(*) FROM audit_events WHERE occurred_at < $1::timestamptz)
              + (SELECT count(*) FROM audit_row_changes WHERE at < $1::timestamptz) AS n`,
        [start.toISOString()],
      )) as { n: string }[];
      if (Number(n) > 0) {
        return fail({
          day: seals[0].day,
          reason: 'UNSEALED_BEFORE_FIRST_SEAL',
          message: `${n} ligne(s) du journal sont antérieures au premier sceau (${seals[0].day}) : elles ont été ajoutées après coup.`,
          actual: Number(n),
        });
      }
    }

    for (let i = 0; i < seals.length; i += 1) {
      const seal = seals[i];
      if ((fromDay && seal.day < fromDay) || (toDay && seal.day > toDay))
        continue;
      result.firstDay ??= seal.day;
      result.lastDay = seal.day;
      const previous = i > 0 ? seals[i - 1] : null;
      if (previous && addUtcDays(previous.day, 1) !== seal.day) {
        return fail({
          day: seal.day,
          reason: 'GAP',
          message: `Sceau manquant entre le ${dateFr(previous.day)} et le ${dateFr(seal.day)}.`,
        });
      }
      const expectedPrev = previous?.hash ?? null;
      if (seal.prevHash !== expectedPrev) {
        return fail({
          day: seal.day,
          reason: 'CHAIN',
          message: `Le sceau du ${dateFr(seal.day)} ne référence pas le sceau précédent : chaîne rompue.`,
          expected: expectedPrev,
          actual: seal.prevHash,
        });
      }
      const recomputed = await this.computeDay(
        this.dataSource.manager,
        seal.day,
        seal.prevHash,
      );
      if (
        recomputed.eventsCount !== seal.eventsCount ||
        recomputed.rowChangesCount !== seal.rowChangesCount
      ) {
        return fail({
          day: seal.day,
          reason: 'COUNT',
          message: `Le nombre de lignes du ${dateFr(seal.day)} ne correspond plus au sceau : des lignes ont été ajoutées ou retirées.`,
          expected: {
            events: seal.eventsCount,
            rowChanges: seal.rowChangesCount,
          },
          actual: {
            events: recomputed.eventsCount,
            rowChanges: recomputed.rowChangesCount,
          },
        });
      }
      if (recomputed.hash !== seal.hash) {
        return fail({
          day: seal.day,
          reason: 'HASH',
          message: `L’empreinte du ${dateFr(seal.day)} ne correspond plus au sceau : le journal de ce jour a été modifié.`,
          expected: seal.hash,
          actual: recomputed.hash,
        });
      }
      result.checkedDays += 1;
    }
    return result;
  }
}
