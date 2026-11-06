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
import { ProgramListType } from '../../../common/enums/program-list-type.enum.js';
import { Program } from './program.entity.js';

/**
 * Item of a configurable programme list (statuses, inputs, exit reasons…).
 * Deactivated, never deleted; its code never changes. `family` maps the item
 * onto an internal behaviour (see `ref-list-families.ts`).
 */
@Index('UQ_ref_items_program_list_code', ['programId', 'listType', 'code'], {
  unique: true,
})
@Entity('ref_items')
export class RefItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Program, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'program_id' })
  program: Program;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @Column({ name: 'list_type', type: 'enum', enum: ProgramListType })
  listType: ProgramListType;

  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar' })
  label: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  family: string | null;

  @ManyToOne(() => RefItem, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: RefItem | null;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  meta: Record<string, unknown>;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
