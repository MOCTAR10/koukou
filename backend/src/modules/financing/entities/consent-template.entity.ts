import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Consent template filed by the bank (loi n° 001/2011 modifiée par la loi
 * n° 025/2023). Immutable once created; a new one deactivates the previous
 * (version = max + 1). Only `active` changes afterwards.
 */
@Index('UQ_consent_templates_version', ['programId', 'version'], { unique: true })
@Entity('consent_templates')
export class ConsentTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  purpose: string;

  @Column({ name: 'data_categories', type: 'jsonb' })
  dataCategories: string[];

  @Column({ type: 'text' })
  retention: string;

  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName: string;

  @Column({ name: 'stored_name', type: 'varchar', length: 80 })
  storedName: string;

  @Column({ type: 'varchar', length: 40 })
  mime: string;

  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes: number;

  @Column({ type: 'varchar', length: 64 })
  sha256: string;

  @Column({ name: 'confirmed_clauses', type: 'jsonb' })
  confirmedClauses: string[];

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
