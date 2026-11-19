import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  FinancingDecision,
  FinancingStep,
} from '../../../common/enums/financing.enum.js';
import type { FinancingFile } from './financing-file.entity.js';

/** One step passed by a financing file (history, never edited). */
@Index('IDX_financing_step_events_file', ['fileId', 'createdAt'])
@Entity('financing_step_events')
export class FinancingStepEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('FinancingFile', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'file_id' })
  file?: FinancingFile;

  @Column({ name: 'file_id', type: 'uuid' })
  fileId: string;

  @Column({ name: 'from_step', type: 'varchar', length: 20, nullable: true })
  fromStep: FinancingStep | null;

  @Column({ name: 'to_step', type: 'varchar', length: 20 })
  toStep: FinancingStep;

  @Column({ type: 'varchar', length: 10, nullable: true })
  decision: FinancingDecision | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'by_id', type: 'uuid', nullable: true })
  byId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
