import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type SyncConflictWinner = 'SERVEUR' | 'APPAREIL';

/**
 * One field of an offline write that met a change made meanwhile from
 * another device (architecture §14, `backend/docs/poufa-conflits-hors-ligne.md`). The
 * latest capture wins; the losing value is kept here, never lost.
 */
@Index('IDX_sync_conflicts_farm_created', ['farmId', 'createdAt'])
@Index('IDX_sync_conflicts_entity', ['entityType', 'entityId'])
@Entity('sync_conflicts')
export class SyncConflict {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId: string;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId: string | null;

  /** `DAILY_ENTRY` for now. */
  @Column({ name: 'entity_type', type: 'varchar', length: 30 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  /** Business key shown to people (e.g. the entry date). */
  @Column({ name: 'entity_label', type: 'varchar', length: 80, nullable: true })
  entityLabel: string | null;

  @Column({ type: 'varchar', length: 40 })
  field: string;

  @Column({ type: 'varchar', length: 10 })
  winner: SyncConflictWinner;

  @Column({ name: 'server_value', type: 'jsonb', nullable: true })
  serverValue: unknown;

  @Column({ name: 'incoming_value', type: 'jsonb', nullable: true })
  incomingValue: unknown;

  @Column({ name: 'server_captured_at', type: 'timestamptz', nullable: true })
  serverCapturedAt: Date | null;

  @Column({ name: 'server_user_id', type: 'uuid', nullable: true })
  serverUserId: string | null;

  @Column({ name: 'server_device_id', type: 'varchar', length: 80, nullable: true })
  serverDeviceId: string | null;

  /** Capture time used for the decision (corrected when the clock was off). */
  @Column({ name: 'incoming_captured_at', type: 'timestamptz' })
  incomingCapturedAt: Date;

  /** Capture time as sent by the phone. */
  @Column({ name: 'incoming_captured_at_raw', type: 'timestamptz', nullable: true })
  incomingCapturedAtRaw: Date | null;

  @Column({ name: 'incoming_user_id', type: 'uuid', nullable: true })
  incomingUserId: string | null;

  @Column({ name: 'incoming_device_id', type: 'varchar', length: 80, nullable: true })
  incomingDeviceId: string | null;

  /** Phone clock − server clock (ms) measured with that write. */
  @Column({ name: 'clock_skew_ms', type: 'float', nullable: true })
  clockSkewMs: number | null;

  @Column({ name: 'clock_corrected', type: 'boolean', default: false })
  clockCorrected: boolean;

  /** Set by the notify lot once the agent and the farmer were told. */
  @Column({ name: 'notified_at', type: 'timestamptz', nullable: true })
  notifiedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
