import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Farm } from '../../farms/entities/farm.entity.js';
import type { User } from '../../users/entities/user.entity.js';

/**
 * Status history of a programme farm. The current status is the latest row
 * (`from`, then `createdAt`); `Farm.statusCode` is a copy of it.
 */
@Index('IDX_farm_status_history_farm_from', ['farmId', 'from'])
@Entity('farm_status_history')
export class FarmStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('Farm', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'farm_id' })
  farm?: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId: string;

  /** Code of a STATUT_FERME list item. */
  @Column({ name: 'status_code', type: 'varchar', length: 40 })
  statusCode: string;

  /** Family of that item at the time (PREPARATION, OPERATIONNELLE, SUSPENDUE). */
  @Column({ name: 'status_family', type: 'varchar', length: 40 })
  statusFamily: string;

  /** Cohort of the farm when the status was set (COHORTE code). */
  @Column({ type: 'varchar', length: 40, nullable: true })
  cohort: string | null;

  /** Effective date of the status. */
  @Column({ name: 'from', type: 'timestamptz' })
  from: Date;

  @ManyToOne('User', { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
