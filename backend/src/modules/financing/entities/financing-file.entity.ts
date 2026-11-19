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
import {
  ClaimFlag,
  FinancingDecision,
  FinancingPeriodicity,
  FinancingStep,
} from '../../../common/enums/financing.enum.js';
import type { Farm } from '../../farms/entities/farm.entity.js';

/**
 * Financing file of a farm with the bank (financer workspace, matrix domain
 * FINANCEMENT). Money is integer FCFA. `reference` = `BCEG-<year>-<4 digits>`,
 * unique per programme. Files are never deleted: a refused file is closed.
 */
@Index('UQ_financing_files_reference', ['programId', 'reference'], {
  unique: true,
})
@Index('IDX_financing_files_farm', ['farmId'])
@Entity('financing_files')
export class FinancingFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @ManyToOne('Farm', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'farm_id' })
  farm?: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId: string;

  @Column({ type: 'varchar', length: 24 })
  reference: string;

  @Column({ type: 'text' })
  purpose: string;

  @Column({ type: 'varchar', length: 20, default: FinancingStep.DEMANDE })
  step: FinancingStep;

  @Column({ type: 'varchar', length: 10, nullable: true })
  decision: FinancingDecision | null;

  @Column({ name: 'decision_date', type: 'date', nullable: true })
  decisionDate: string | null;

  @Column({ name: 'decision_note', type: 'text', nullable: true })
  decisionNote: string | null;

  @Column({ name: 'requested_fcfa', type: 'int', nullable: true })
  requestedFcfa: number | null;

  @Column({ name: 'granted_fcfa', type: 'int', nullable: true })
  grantedFcfa: number | null;

  @Column({ name: 'amount_note', type: 'text', nullable: true })
  amountNote: string | null;

  /** Annual rate in percent, two decimals at most. */
  @Column({
    name: 'rate_pct',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : Number(v)),
    },
  })
  ratePct: number | null;

  @Column({ name: 'duration_months', type: 'int', nullable: true })
  durationMonths: number | null;

  @Column({ name: 'grace_months', type: 'int', nullable: true })
  graceMonths: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  periodicity: FinancingPeriodicity | null;

  @Column({ type: 'text', nullable: true })
  guarantees: string | null;

  @Column({ name: 'guarantee_fund', type: 'varchar', length: 200, nullable: true })
  guaranteeFund: string | null;

  @Column({
    name: 'guarantee_pct',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : Number(v)),
    },
  })
  guaranteePct: number | null;

  @Column({ name: 'claim_flag', type: 'varchar', length: 20, nullable: true })
  claimFlag: ClaimFlag | null;

  @Column({ name: 'claim_flag_note', type: 'text', nullable: true })
  claimFlagNote: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
