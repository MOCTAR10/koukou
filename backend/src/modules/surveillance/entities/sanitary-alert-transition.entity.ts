import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SanitaryAlertTransitionKind } from '../../../common/enums/sanitary-alert.enum.js';
import type { SanitaryAlert } from './sanitary-alert.entity.js';

/**
 * Timestamped history of an official sanitary alert (CDC « historique
 * horodaté »): opening, every status change and the publication, with
 * author and comment. Rows are only ever added.
 */
@Index('IDX_sanitary_alert_transitions_alert', ['alertId', 'createdAt'])
@Entity('sanitary_alert_transitions')
export class SanitaryAlertTransition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('SanitaryAlert', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'alert_id' })
  alert?: SanitaryAlert;

  @Column({ name: 'alert_id', type: 'uuid' })
  alertId: string;

  @Column({ type: 'enum', enum: SanitaryAlertTransitionKind })
  kind: SanitaryAlertTransitionKind;

  @Column({ name: 'from_status_code', type: 'varchar', length: 40, nullable: true })
  fromStatusCode: string | null;

  @Column({ name: 'to_status_code', type: 'varchar', length: 40 })
  toStatusCode: string;

  @Column({ name: 'to_family', type: 'varchar', length: 40 })
  toFamily: string;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  /** Null for an automatic opening. */
  @Column({ name: 'author_id', type: 'uuid', nullable: true })
  authorId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
