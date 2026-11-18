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
 * Voice note of a sanitary declaration: many farmers cannot read or write, so
 * they describe the problem aloud. Same life cycle as the photos: the file
 * lives under `UPLOADS_DIR/sanitary/<farmId>/`, outside the public static
 * route, and is served only through the declaration's own route, to the farm
 * and the veterinary services (`SanitaryDeclarationPolicy`).
 */
@Index('UQ_health_event_audio_event_sha', ['healthEventId', 'sha256'], {
  unique: true,
})
@Entity('health_event_audio')
export class HealthEventAudio {
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

  /** Length announced by the recorder, in milliseconds (informative). */
  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  /** Content hash: a re-sent note (offline retry) is not stored twice. */
  @Column({ type: 'varchar', length: 64 })
  sha256: string;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
