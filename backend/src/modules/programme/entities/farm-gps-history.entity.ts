import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { GpsSource } from '../../../common/enums/gps-source.enum.js';
import type { Farm } from '../../farms/entities/farm.entity.js';
import type { User } from '../../users/entities/user.entity.js';

/**
 * Every GPS fix of a programme farm (capture at enrolment, then manual
 * corrections): a correction never erases the previous point. The current
 * point is a copy on `Farm`.
 */
@Index('IDX_farm_gps_history_farm_created', ['farmId', 'createdAt'])
@Index('UQ_farm_gps_history_farm_idempotency', ['farmId', 'idempotencyKey'], {
  unique: true,
  where: '"idempotency_key" IS NOT NULL',
})
@Entity('farm_gps_history')
export class FarmGpsHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('Farm', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'farm_id' })
  farm?: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId: string;

  @Column({ type: 'float' })
  latitude: number;

  @Column({ type: 'float' })
  longitude: number;

  @Column({ name: 'captured_at', type: 'timestamptz' })
  capturedAt: Date;

  @Column({ type: 'enum', enum: GpsSource })
  source: GpsSource;

  @Column({ name: 'accuracy_m', type: 'float', nullable: true })
  accuracyM: number | null;

  @Column({ name: 'province_warning', type: 'text', nullable: true })
  provinceWarning: string | null;

  @ManyToOne('User', { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  /** Offline replay key (unique per farm): a replay adds no second point. */
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  idempotencyKey: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
