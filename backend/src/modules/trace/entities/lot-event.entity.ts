import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LotEventType } from '../../../common/enums/trace.enum.js';
import type { Operator } from './operator.entity.js';
import type { TraceLot } from './trace-lot.entity.js';

/**
 * What happened to a lot along the chain (architecture §11.1). Today only
 * CESSION is written (with the sub-lot, in the sortie's transaction);
 * RECEPTION by the receiving operator and the downstream events come later.
 */
@Index('IDX_lot_events_lot_at', ['lotId', 'occurredAt'])
@Entity('lot_events')
export class LotEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('TraceLot', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'lot_id' })
  lot?: TraceLot;

  @Column({ name: 'lot_id', type: 'uuid' })
  lotId: string;

  @Column({ type: 'enum', enum: LotEventType })
  type: LotEventType;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  /** Account that recorded it. */
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @ManyToOne('Operator', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'operator_id' })
  operator?: Operator | null;

  @Column({ name: 'operator_id', type: 'uuid', nullable: true })
  operatorId: string | null;

  /** Sortie behind a CESSION. */
  @Column({ name: 'sortie_id', type: 'uuid', nullable: true })
  sortieId: string | null;

  /** Facts of the event (counts, weights, references), by type. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  data: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
