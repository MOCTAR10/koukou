import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QrScanResult } from '../../../common/enums/trace.enum.js';
import type { TraceLot } from './trace-lot.entity.js';

/**
 * One public QR scan (CDC §7.5 « tous les scans sont journalisés »), whatever
 * its outcome. Append-only (DB trigger). Never the raw IP: `ipHash` is an
 * HMAC with the server key, enough to count distinct devices. `geoCell` is a
 * coarse area (0.1°) the page may send with the visitor's consent.
 */
@Index('IDX_qr_scans_lot_at', ['lotId', 'scannedAt'])
@Entity('qr_scans')
export class QrScan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Lot matched by the code (null when unknown). */
  @ManyToOne('TraceLot', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'lot_id' })
  lot?: TraceLot | null;

  @Column({ name: 'lot_id', type: 'uuid', nullable: true })
  lotId: string | null;

  /** Code read from the address (truncated). */
  @Column({ type: 'varchar', length: 80 })
  code: string;

  /** Signature read from the address (truncated), null when absent. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  token: string | null;

  @CreateDateColumn({ name: 'scanned_at', type: 'timestamptz' })
  scannedAt: Date;

  @Column({ name: 'ip_hash', type: 'varchar', length: 64, nullable: true })
  ipHash: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 300, nullable: true })
  userAgent: string | null;

  @Column({ name: 'geo_cell', type: 'varchar', length: 24, nullable: true })
  geoCell: string | null;

  @Column({ type: 'enum', enum: QrScanResult })
  result: QrScanResult;
}
