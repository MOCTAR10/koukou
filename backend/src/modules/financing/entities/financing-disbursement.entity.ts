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
import { DisbursementStatus } from '../../../common/enums/financing.enum.js';
import type { FinancingFile } from './financing-file.entity.js';

/** Tranche of a financing file (planned, released or cancelled; never deleted). */
@Index('UQ_financing_disbursements_number', ['fileId', 'number'], { unique: true })
@Entity('financing_disbursements')
export class FinancingDisbursement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('FinancingFile', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'file_id' })
  file?: FinancingFile;

  @Column({ name: 'file_id', type: 'uuid' })
  fileId: string;

  @Column({ type: 'int' })
  number: number;

  @Column({ name: 'planned_date', type: 'date', nullable: true })
  plannedDate: string | null;

  @Column({ name: 'amount_fcfa', type: 'int' })
  amountFcfa: number;

  @Column({ type: 'text', nullable: true })
  condition: string | null;

  @Column({ type: 'varchar', length: 10, default: DisbursementStatus.PREVUE })
  status: DisbursementStatus;

  @Column({ name: 'released_on', type: 'date', nullable: true })
  releasedOn: string | null;

  /** Technical visit used as the field check (no foreign key: plain reference). */
  @Column({ name: 'visit_id', type: 'uuid', nullable: true })
  visitId: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
