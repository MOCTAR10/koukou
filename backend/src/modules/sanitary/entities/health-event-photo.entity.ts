import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { HealthEvent } from './health-event.entity.js';

/**
 * Photo of a sanitary declaration (CDC « Proposé : photo »), sent after the
 * declaration's text (the phone compresses it and queues it offline). The
 * file lives under `UPLOADS_DIR/sanitary/<farmId>/`, outside the public
 * static route: it is served only through the declaration's own route, to
 * the farm and the veterinary services (`SanitaryDeclarationPolicy`).
 */
@Index('UQ_health_event_photos_event_sha', ['healthEventId', 'sha256'], {
  unique: true,
})
@Entity('health_event_photos')
export class HealthEventPhoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => HealthEvent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'health_event_id' })
  healthEvent?: HealthEvent;

  @Column({ name: 'health_event_id', type: 'uuid' })
  healthEventId: string;

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
