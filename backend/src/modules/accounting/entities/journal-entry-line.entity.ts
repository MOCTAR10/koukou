import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
// Type-only import : la relation `ManyToOne('JournalEntry')` est résolue par
// nom au build des métadonnées TypeORM, ce qui évite le cycle d'évaluation
// ESM taud (journal-entry ↔ journal-entry-line) au démarrage.
import type { JournalEntry } from './journal-entry.entity.js';

/** Ligne d'écriture comptable (débit OU crédit, jamais les deux). */
@Entity('accounting_journal_entry_lines')
export class JournalEntryLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('JournalEntry', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entry_id' })
  entry: JournalEntry;

  @Column({ name: 'entry_id', type: 'uuid' })
  @Index()
  entryId: string;

  @Index()
  @Column({ name: 'account_code', type: 'varchar', length: 8 })
  accountCode: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  label: string | null;

  @Column({ name: 'debit_fcfa', type: 'int', default: 0 })
  debitFcfa: number;

  @Column({ name: 'credit_fcfa', type: 'int', default: 0 })
  creditFcfa: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}