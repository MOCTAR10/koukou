import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Phone clock versus server clock, measured on each synchronized write that
 * sends the phone time (`deviceSentAt`). Beyond `SYNC_ECART_HORLOGE_MAX_S`
 * the capture time of that write is corrected by the skew.
 */
@Index('IDX_sync_clock_samples_user_created', ['userId', 'createdAt'])
@Entity('sync_clock_samples')
export class SyncClockSample {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'farm_id', type: 'uuid', nullable: true })
  farmId: string | null;

  @Column({ name: 'device_id', type: 'varchar', length: 80, nullable: true })
  deviceId: string | null;

  @Column({ name: 'device_time', type: 'timestamptz' })
  deviceTime: Date;

  @Column({ name: 'server_time', type: 'timestamptz' })
  serverTime: Date;

  /** deviceTime − serverTime, in ms (positive: the phone is ahead). */
  @Column({ name: 'skew_ms', type: 'float' })
  skewMs: number;

  /** The skew exceeded the threshold: capture times were corrected. */
  @Column({ type: 'boolean' })
  corrected: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
