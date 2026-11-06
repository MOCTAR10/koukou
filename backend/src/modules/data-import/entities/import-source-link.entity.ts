import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Kinds of records a source key points to. */
export type ImportLinkKind = 'BANDE';

/**
 * Source key → record created by a recovery (a legacy band id → the band),
 * unique per programme: re-running a file, or another file holding the same
 * band, never creates it twice. Farms need no link: their AMI reference sits
 * on the registry sheet and the registry rules match them.
 */
@Index('UQ_import_source_links_key', ['programId', 'kind', 'sourceKey'], {
  unique: true,
})
@Entity('import_source_links')
export class ImportSourceLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @Column({ type: 'varchar', length: 20 })
  kind: ImportLinkKind;

  @Column({ name: 'source_key', type: 'varchar', length: 200 })
  sourceKey: string;

  @Column({ name: 'target_id', type: 'uuid' })
  @Index()
  targetId: string;

  @Column({ name: 'target_code', type: 'varchar', length: 60, nullable: true })
  targetCode: string | null;

  /** Job that created the record. */
  @Column({ name: 'job_id', type: 'uuid' })
  jobId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
