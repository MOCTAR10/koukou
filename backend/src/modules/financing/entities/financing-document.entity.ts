import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DocumentSource, FinancingDocumentStatus } from '../../../common/enums/financing.enum.js';
import type { FinancingFile } from './financing-file.entity.js';

/**
 * Document filed on a financing file (PDF/JPEG/PNG/WebP, 10 MiB). The bytes
 * live in `UPLOADS_DIR/financing/<farmId>/<storedName>`, never served
 * statically. Never deleted: a wrong document is rejected.
 */
@Index('IDX_financing_documents_file', ['fileId'])
@Entity('financing_documents')
export class FinancingDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('FinancingFile', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'file_id' })
  file?: FinancingFile;

  @Column({ name: 'file_id', type: 'uuid' })
  fileId: string;

  @Column({ name: 'requirement_id', type: 'uuid', nullable: true })
  requirementId: string | null;

  @Column({ type: 'varchar', length: 300 })
  label: string;

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

  @Column({ type: 'varchar', length: 10, default: FinancingDocumentStatus.DEPOSE })
  status: FinancingDocumentStatus;

  @Column({ name: 'reject_reason', type: 'text', nullable: true })
  rejectReason: string | null;

  @Column({ type: 'varchar', length: 10, default: DocumentSource.BCEG })
  source: DocumentSource;

  /** Issue date given at filing (validity runs from it, or from the upload day). */
  @Column({ name: 'issued_on', type: 'date', nullable: true })
  issuedOn: string | null;

  @Column({ name: 'expires_on', type: 'date', nullable: true })
  expiresOn: string | null;

  @Column({ name: 'uploaded_by_id', type: 'uuid', nullable: true })
  uploadedById: string | null;

  @CreateDateColumn({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt: Date;

  @Column({ name: 'reviewed_by_id', type: 'uuid', nullable: true })
  reviewedById: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;
}
