import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  AlertKind,
  AlertLevel,
  AlertStatus,
} from '../../../common/enums/alert-level.enum.js';

@Index('IDX_alerts_farm_status', ['farmId', 'status'])
@Entity('alerts')
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  @Index()
  batchId: string | null;

  @Column({ name: 'building_id', type: 'uuid', nullable: true })
  @Index()
  buildingId: string | null;

  @Column({ name: 'rule_id', type: 'uuid', nullable: true })
  ruleId: string | null;

  @Column({ type: 'enum', enum: AlertKind })
  kind: AlertKind;

  @Column({ type: 'enum', enum: AlertLevel })
  level: AlertLevel;

  @Column({ type: 'enum', enum: AlertStatus, default: AlertStatus.ACTIVE })
  status: AlertStatus;

  @Column()
  message: string;

  @Column({ name: 'recommendation', type: 'text', nullable: true })
  recommendation: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'context' })
  context: Record<string, unknown> | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
