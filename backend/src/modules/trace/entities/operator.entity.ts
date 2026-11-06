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
import type { Localite } from '../../programme/entities/localite.entity.js';
import type { Program } from '../../programme/entities/program.entity.js';

/**
 * Operator of the programme (CDC « Registre des opérateurs »): slaughterhouse,
 * buyer, distributor… that receives lots. One registry for the whole
 * programme; deactivated, never deleted. `code` (`OP-0001`, IdCounter) never
 * changes (DB trigger).
 */
@Index('UQ_operators_program_code', ['programId', 'code'], { unique: true })
@Entity('operators')
export class Operator {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('Program', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'program_id' })
  program?: Program;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @Column({ type: 'varchar', length: 20 })
  code: string;

  /** TYPE_OPERATEUR list item code (its family says what it is). */
  @Column({ name: 'type_code', type: 'varchar', length: 40 })
  typeCode: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @ManyToOne('Localite', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'localite_id' })
  localite?: Localite | null;

  @Column({ name: 'localite_id', type: 'uuid', nullable: true })
  localiteId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({
    name: 'contact_name',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  contactName: string | null;

  @Column({
    name: 'contact_phone',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  contactPhone: string | null;

  @Column({
    name: 'contact_email',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  contactEmail: string | null;

  /** Reference of the convention signed with the programme. */
  @Column({
    name: 'convention_ref',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  conventionRef: string | null;

  @Column({ name: 'convention_signed_at', type: 'date', nullable: true })
  conventionSignedAt: string | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
