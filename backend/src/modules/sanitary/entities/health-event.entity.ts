import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AlertLevel } from '../../../common/enums/alert-level.enum.js';
import { DiseaseSeverity } from '../../../common/enums/disease-severity.enum.js';
import { HealthEventKind } from '../../../common/enums/health-event-kind.enum.js';
import { HealthEventStatus } from '../../../common/enums/health-event-status.enum.js';

/**
 * Événement sanitaire enregistré sur un lot : maladie, pic de mortalité,
 * réforme/culling sanitaire (DISTINCT de l'abattage de production), symptôme,
 * visite vétérinaire, autre. Servent de chronologie santé et alimentent
 * l'agrégat « santé » de l'écran Sanitaire (onglet Maladies).
 */
@Index('UQ_health_events_farm_idempotency', ['farmId', 'idempotencyKey'], {
  unique: true,
  where: '"idempotency_key" IS NOT NULL',
})
@Entity('health_events')
export class HealthEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  @Column({ name: 'batch_id', type: 'uuid' })
  @Index()
  batchId: string;

  @Column({ name: 'kind', type: 'enum', enum: HealthEventKind })
  kind: HealthEventKind;

  @Column({ name: 'occurred_at', type: 'date' })
  @Index()
  occurredAt: string;

  @Column({ name: 'severity', type: 'enum', enum: AlertLevel })
  severity: AlertLevel;

  @Column({ name: 'status', type: 'enum', enum: HealthEventStatus })
  status: HealthEventStatus;

  @Column({ name: 'quantity', type: 'int', default: 0 })
  quantity: number;

  @Column({ name: 'title', type: 'varchar', length: 160 })
  title: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'symptoms', type: 'text', nullable: true })
  symptoms: string | null;

  @Column({ name: 'disease', type: 'varchar', length: 120, nullable: true })
  disease: string | null;

  @Column({
    name: 'disease_severity',
    type: 'enum',
    enum: DiseaseSeverity,
    nullable: true,
  })
  diseaseSeverity: DiseaseSeverity | null;

  @Column({ name: 'treatment_given', type: 'text', nullable: true })
  treatmentGiven: string | null;

  @Column({ name: 'vet_consulted', type: 'boolean', default: false })
  vetConsulted: boolean;

  @Column({ name: 'vet_name', type: 'varchar', length: 120, nullable: true })
  vetName: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  /**
   * Clinical signs observed: codes of the SIGNE_CLINIQUE programme list
   * (maintained by the veterinary services), checked at creation.
   */
  @Column({
    name: 'clinical_signs',
    type: 'jsonb',
    default: () => "'[]'",
  })
  clinicalSigns: string[];

  /**
   * Declared as a suspicion of disease: opens an official sanitary alert
   * (`SanitaryAlert`, origin DECLARATION).
   */
  @Column({ name: 'suspicion', type: 'boolean', default: false })
  suspicion: boolean;

  /** Offline replay key (`op.id`): a replay returns the existing declaration. */
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  idempotencyKey: string | null;

  @Column({ name: 'resolved_at', type: 'date', nullable: true })
  resolvedAt: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
