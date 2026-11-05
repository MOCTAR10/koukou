import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Projection band × day of a POUFA band (architecture §8.2), rewritten in the
 * same transaction as each daily entry, sortie, sale, slaughter or sanitary
 * removal (`BandeStatsService.refresh`). Derived data only: it can always be
 * rebuilt from the source rows, so it is not journaled.
 */
@Index('IDX_bande_daily_stats_farm_day', ['farmId', 'day'])
@Index('IDX_bande_daily_stats_program_day', ['programId', 'day'])
@Entity('bande_daily_stats')
export class BandeDailyStat {
  @PrimaryColumn({ name: 'batch_id', type: 'uuid' })
  batchId: string;

  @PrimaryColumn({ type: 'date' })
  day: string;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId: string;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  /** Age of the birds that day (initial age + days since opening). */
  @Column({ name: 'age_days', type: 'int' })
  ageDays: number;

  /** Headcount at the start of the day (end of the previous day). */
  @Column({ name: 'present_start', type: 'int' })
  presentStart: number;

  /** Deaths of the day (daily entry + MORTALITE health events). */
  @Column({ type: 'int' })
  deaths: number;

  /** `FORMULE_MORTALITE_JOUR_PCT` in force that day; null when undefined. */
  @Column({ name: 'mortality_day_pct', type: 'float', nullable: true })
  mortalityDayPct: number | null;

  @Column({ name: 'deaths_cumulative', type: 'int' })
  deathsCumulative: number;

  /** Other exits of the day: sales, slaughter, culls, sorties. */
  @Column({ type: 'int' })
  removals: number;

  @Column({ name: 'removals_cumulative', type: 'int' })
  removalsCumulative: number;

  /** Headcount at the end of the day. */
  @Column({ type: 'int' })
  present: number;

  @Column({ name: 'feed_kg', type: 'float' })
  feedKg: number;

  @Column({ name: 'feed_cumulative_kg', type: 'float' })
  feedCumulativeKg: number;

  /** Last known average weight (g) on or before that day. */
  @Column({ name: 'last_weight_g', type: 'float', nullable: true })
  lastWeightG: number | null;

  /** A weighing was recorded that day. */
  @Column({ type: 'boolean' })
  weighed: boolean;

  @Column({ name: 'sample_size', type: 'int', nullable: true })
  sampleSize: number | null;

  /** A daily entry exists for that day. */
  @Column({ name: 'entry_done', type: 'boolean' })
  entryDone: boolean;

  @Column({ name: 'catch_up', type: 'boolean' })
  catchUp: boolean;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
