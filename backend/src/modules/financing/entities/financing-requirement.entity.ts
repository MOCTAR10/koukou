import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DocumentFormat, DocumentProvider, FinancingStep } from '../../../common/enums/financing.enum.js';

/**
 * Item of the bank's document checklist, by step. Seeded by the migration,
 * then edited by the bank (never deleted, only deactivated).
 */
@Index('UQ_financing_requirements_code', ['programId', 'code'], { unique: true })
@Entity('financing_requirements')
export class FinancingRequirement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @Column({ type: 'varchar', length: 60 })
  code: string;

  @Column({ type: 'varchar', length: 300 })
  label: string;

  @Column({ type: 'varchar', length: 20 })
  step: FinancingStep;

  @Column({ type: 'boolean', default: true })
  required: boolean;

  @Column({ name: 'legal_basis', type: 'varchar', length: 200, nullable: true })
  legalBasis: string | null;

  @Column({ type: 'text', nullable: true })
  help: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'int', default: 0 })
  sort: number;

  /** Who supplies the document; only EXPLOITANT items reach the farmer's list. */
  @Column({ name: 'provided_by', type: 'varchar', length: 10, default: DocumentProvider.BCEG })
  providedBy: DocumentProvider;

  /** Accepted formats; empty = both. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  formats: DocumentFormat[];

  /** Months a document stays valid after its issue date; null = never expires. */
  @Column({ name: 'validity_months', type: 'int', nullable: true })
  validityMonths: number | null;

  /** Blank form attached by the bank (bytes under UPLOADS_DIR/financing/templates). */
  @Column({ name: 'template_original_name', type: 'varchar', length: 255, nullable: true })
  templateOriginalName: string | null;

  @Column({ name: 'template_stored_name', type: 'varchar', length: 80, nullable: true })
  templateStoredName: string | null;

  @Column({ name: 'template_mime', type: 'varchar', length: 40, nullable: true })
  templateMime: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
