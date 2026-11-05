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
import type { Program } from '../../programme/entities/program.entity.js';
import type { AccessMatrix } from '../access-domains.js';

/**
 * Institutional access profile of a programme (DGE, veterinary services…):
 * a scope kind and a matrix domain → actions. System profiles (seeded) can be
 * tuned but never deleted, and their code and scope kind never change.
 */
@Index('UQ_access_profiles_program_code', ['programId', 'code'], {
  unique: true,
})
@Entity('access_profiles')
export class AccessProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('Program', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'program_id' })
  program?: Program;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  /** Stable code (`VETERINAIRE`), also the parameters' owner profile. */
  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({
    name: 'scope_kind',
    type: 'enum',
    enum: AccessScopeKind,
    enumName: 'access_scope_kind_enum',
  })
  scopeKind: AccessScopeKind;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  matrix: AccessMatrix;

  @Column({ type: 'boolean', default: false })
  system: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
