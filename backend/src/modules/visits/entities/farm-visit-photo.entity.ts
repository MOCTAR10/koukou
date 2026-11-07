import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { FarmVisit } from './farm-visit.entity.js';

/**
 * Photo taken during a technical visit, sent after the visit's text (like the
 * photos of a sanitary declaration: the phone compresses it and queues it
 * offline). The visit itself stays immutable; the photo is bound to it. The
 * file lives under `UPLOADS_DIR/visits/<farmId>/`, outside the public static
 * route, and is served only through the visit's own route.
 */
@Index('UQ_farm_visit_photos_visit_sha', ['visitId', 'sha256'], {
  unique: true,
})
@Entity('farm_visit_photos')
export class FarmVisitPhoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('FarmVisit', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_id' })
  visit?: FarmVisit;

  @Column({ name: 'visit_id', type: 'uuid' })
  visitId: string;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  /** File name under the farm's directory (`<id>.<ext>`). */
  @Column({ name: 'file_name', type: 'varchar', length: 80 })
  fileName: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 40 })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes: number;

  /** Content hash: a re-sent photo (offline retry) is not stored twice. */
  @Column({ type: 'varchar', length: 64 })
  sha256: string;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
