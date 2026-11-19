import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RepaymentMethod } from '../../../common/enums/financing.enum.js';
import type { FinancingFile } from './financing-file.entity.js';

/** Repayment received by the bank. Never deleted: cancelled with a reason. */
@Index('IDX_financing_repayments_file', ['fileId', 'paidOn'])
@Entity('financing_repayments')
export class FinancingRepayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('FinancingFile', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'file_id' })
  file?: FinancingFile;

  @Column({ name: 'file_id', type: 'uuid' })
  fileId: string;

  @Column({ name: 'paid_on', type: 'date' })
  paidOn: string;

  @Column({ name: 'amount_fcfa', type: 'int' })
  amountFcfa: number;

  @Column({ type: 'varchar', length: 20 })
  method: RepaymentMethod;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reference: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason: string | null;

  @Column({ name: 'cancelled_by_id', type: 'uuid', nullable: true })
  cancelledById: string | null;

  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
