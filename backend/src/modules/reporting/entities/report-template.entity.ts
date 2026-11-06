import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccessScopeKind } from '../../../common/enums/access-scope-kind.enum.js';
import {
  ReportLevel,
  ReportPeriodicity,
  ReportSection,
} from '../../../common/enums/report.enum.js';
import type { Program } from '../../programme/entities/program.entity.js';

/** Who a template's runs are announced to (in-app « rapport disponible »). */
export interface ReportAudience {
  /**
   * Institutional scope kinds reached (members holding PILOTAGE:CONSULTER
   * whose scope covers the run). AGGREGATE members only get runs without
   * farm rows.
   */
  scopeKinds: AccessScopeKind[];
  /** Restricts to these profile codes (empty = every profile). */
  profileCodes: string[];
  /** The farm's owner account (band level). */
  farmOwners: boolean;
}

/**
 * Scheduled report model (CDC « Rapports périodiques automatiques »,
 * « Modèles et périodicité paramétrables »): what a run covers, how often,
 * which sections, and its audience. Seeded once per programme (weekly,
 * end of band, national monthly), then tuned by the administration.
 */
@Index('UQ_report_templates_program_code', ['programId', 'code'], {
  unique: true,
})
@Entity('report_templates')
export class ReportTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('Program', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'program_id' })
  program?: Program;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  /** Never changes once created. */
  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 160 })
  label: string;

  @Column({ type: 'varchar', length: 20 })
  periodicity: ReportPeriodicity;

  @Column({ type: 'varchar', length: 20 })
  level: ReportLevel;

  @Column({ type: 'jsonb' })
  sections: ReportSection[];

  @Column({ type: 'jsonb' })
  audience: ReportAudience;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
