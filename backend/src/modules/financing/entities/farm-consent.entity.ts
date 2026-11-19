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
  ConsentMethod,
  ConsentRecordStatus,
} from '../../../common/enums/financing.enum.js';
import type { Farm } from '../../farms/entities/farm.entity.js';

/**
 * A farmer's consent to share his farm's data with the financer (loi
 * n° 001/2011 modifiée, art. 72 : the proof). One ACTIVE row per farm at most
 * (partial unique index); a withdrawal keeps the row (WITHDRAWN, effective
 * at once, never retroactive) and a later consent is a new row.
 */
@Index('IDX_farm_consents_farm', ['farmId', 'createdAt'])
@Index('UQ_farm_consents_active', ['farmId'], {
  unique: true,
  where: `"status" = 'ACTIVE'`,
})
@Entity('farm_consents')
export class FarmConsent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @ManyToOne('Farm', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'farm_id' })
  farm?: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId: string;

  @Column({ type: 'varchar', length: 10, default: ConsentRecordStatus.ACTIVE })
  status: ConsentRecordStatus;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @Column({ name: 'template_version', type: 'int' })
  templateVersion: number;

  @Column({ name: 'template_sha256', type: 'varchar', length: 64 })
  templateSha256: string;

  @Column({ type: 'varchar', length: 10 })
  method: ConsentMethod;

  @Column({ name: 'signer_name', type: 'varchar', length: 200 })
  signerName: string;

  @Column({ name: 'signer_quality', type: 'varchar', length: 200, nullable: true })
  signerQuality: string | null;

  @Column({ name: 'granted_at', type: 'timestamptz' })
  grantedAt: Date;

  /** User who gave it online, or the bank agent who recorded the paper. */
  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 400, nullable: true })
  userAgent: string | null;

  @Column({ name: 'proof_original_name', type: 'varchar', length: 255, nullable: true })
  proofOriginalName: string | null;

  @Column({ name: 'proof_stored_name', type: 'varchar', length: 80, nullable: true })
  proofStoredName: string | null;

  @Column({ name: 'proof_mime', type: 'varchar', length: 40, nullable: true })
  proofMime: string | null;

  @Column({ name: 'proof_sha256', type: 'varchar', length: 64, nullable: true })
  proofSha256: string | null;

  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt: Date | null;

  @Column({ name: 'withdrawn_by_id', type: 'uuid', nullable: true })
  withdrawnById: string | null;

  @Column({ name: 'withdrawn_by_side', type: 'varchar', length: 10, nullable: true })
  withdrawnBySide: 'FARMER' | 'BANK' | null;

  @Column({ name: 'withdraw_reason', type: 'text', nullable: true })
  withdrawReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
