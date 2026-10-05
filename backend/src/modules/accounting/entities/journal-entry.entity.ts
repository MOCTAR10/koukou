import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Farm } from '../../farms/entities/farm.entity.js';
import { Exercice } from './exercice.entity.js';
import { JournalEntryLine } from './journal-entry-line.entity.js';

/** Origine d'une écriture (source métier, sert aussi à l'idempotence). */
export type AccountingSource =
  | 'SALE'
  | 'PAYMENT'
  | 'EXPENSE'
  | 'CAISSE'
  | 'ORDER'
  | 'INPUT'
  | 'REGULARISATION'
  | 'STOCK'
  | 'CLOTURE';

export enum JournalEntryStatus {
  POSTED = 'POSTED',
  CANCELLED = 'CANCELLED',
}

/** Tête d'écriture comptable (une écriture = plusieurs lignes équilibrées). */
@Index('UQ_accounting_entries_source', ['farmId', 'source', 'sourceId'], {
  unique: true,
})
@Entity('accounting_journal_entries')
export class JournalEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  @ManyToOne(() => Exercice, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'exercice_id' })
  exercice: Exercice | null;

  @Column({ name: 'exercice_id', type: 'uuid', nullable: true })
  exerciceId: string | null;

  /** Référence EC (journal) : EC-YYYYMMDD-######. */
  @Column({ name: 'reference', type: 'varchar', unique: true })
  reference: string;

  @Column({ name: 'entry_date', type: 'date' })
  entryDate: string;

  @Column({ type: 'varchar', length: 200 })
  label: string;

  @Column({ type: 'varchar', length: 16 })
  source: AccountingSource;

  /** Identifiant métier source — dédup (ferme, source, sourceId) unique. */
  @Column({ name: 'source_id', type: 'varchar', length: 64 })
  sourceId: string;

  @Column({
    type: 'enum',
    enum: JournalEntryStatus,
    default: JournalEntryStatus.POSTED,
  })
  status: JournalEntryStatus;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => JournalEntryLine, (line) => line.entry)
  lines: JournalEntryLine[];
}