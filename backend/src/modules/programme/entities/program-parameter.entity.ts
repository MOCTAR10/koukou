import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Program } from './program.entity.js';

/**
 * One version of a programme parameter. Rows are immutable (a database trigger
 * refuses UPDATE and DELETE): a change inserts a new row with its effective
 * date `validFrom`. See `parameter-resolution.ts` for the value in force.
 */
@Index('IDX_program_parameters_program_key_from', [
  'programId',
  'key',
  'validFrom',
])
@Entity('program_parameters')
export class ProgramParameter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Program, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'program_id' })
  program: Program;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @Column({ type: 'varchar', length: 80 })
  key: string;

  @Column({ type: 'jsonb' })
  value: unknown;

  /** Profile in charge of the value ('DGE', 'VETERINAIRE', 'ADMIN'…). */
  @Column({ name: 'owner_profile', type: 'varchar', length: 40 })
  ownerProfile: string;

  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom: Date;

  /**
   * Author (null for the seed). Deliberately no foreign key: the row is a
   * permanent record and must outlive the user, and an ON DELETE SET NULL
   * would be an UPDATE the immutability trigger refuses.
   */
  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
