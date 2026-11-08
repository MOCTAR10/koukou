import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TaskSource } from '../../../common/enums/task-source.enum.js';
import { TaskStatus } from '../../../common/enums/task-status.enum.js';
import { ProductionBatch } from '../../batches/entities/production-batch.entity.js';
import { Farm } from '../../farms/entities/farm.entity.js';
import { User } from '../../users/entities/user.entity.js';

/** One generated task per (batch, source, step): regenerating never duplicates. */
@Index('UQ_farm_tasks_generated', ['batchId', 'source', 'stepId'], {
  unique: true,
  where: '"step_id" IS NOT NULL',
})
@Entity('farm_tasks')
export class FarmTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assignee_id' })
  assignee: User | null;

  @Column({ name: 'assignee_id', type: 'uuid', nullable: true })
  @Index()
  assigneeId: string | null;

  @ManyToOne(() => ProductionBatch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'batch_id' })
  batch: ProductionBatch | null;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId: string | null;

  /** MANUELLE, or the programme the task was generated from. */
  @Column({ type: 'varchar', length: 30, default: TaskSource.MANUELLE })
  source: TaskSource;

  /** Step of the programme (see `TaskSource`); null for a manual task. */
  @Column({ name: 'step_id', type: 'varchar', length: 120, nullable: true })
  stepId: string | null;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'due_date', type: 'date' })
  @Index()
  dueDate: string;

  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.A_FAIRE })
  status: TaskStatus;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** Set once the "task overdue" push went out; cleared when the due date moves. */
  @Column({ name: 'overdue_notified_at', type: 'timestamptz', nullable: true })
  overdueNotifiedAt: Date | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
