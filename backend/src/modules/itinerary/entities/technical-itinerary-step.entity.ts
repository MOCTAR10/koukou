import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BatchType } from '../../../common/enums/batch-type.enum.js';
import { FeedPhase } from '../../../common/enums/feed-phase.enum.js';
import { ItineraryCategory } from '../../../common/enums/itinerary-category.enum.js';
import { Species } from '../../../common/enums/species.enum.js';

/**
 * One step of the technical itinerary of a species and production type: what
 * to do between two ages (in days). Steps carrying a `feedPhase` are the
 * server-owned age → feed phase mapping. Reference data, never deleted
 * (deactivated through `active`).
 */
@Index('IDX_technical_itinerary_steps_scope', [
  'species',
  'productionType',
  'dayFrom',
])
@Entity('technical_itinerary_steps')
export class TechnicalItineraryStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: Species })
  species: Species;

  @Column({ name: 'production_type', type: 'enum', enum: BatchType })
  productionType: BatchType;

  /** Age in days from which the step applies (inclusive). */
  @Column({ name: 'day_from', type: 'int' })
  dayFrom: number;

  /** Age in days up to which the step applies (inclusive); null = until the end. */
  @Column({ name: 'day_to', type: 'int', nullable: true })
  dayTo: number | null;

  @Column({ name: 'feed_phase', type: 'enum', enum: FeedPhase, nullable: true })
  feedPhase: FeedPhase | null;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text' })
  instructions: string;

  @Column({ type: 'enum', enum: ItineraryCategory })
  category: ItineraryCategory;

  /** Code of a TEXTE_REFERENCE list item (e.g. DECRET_0190_2022). */
  @Column({ name: 'legal_ref', type: 'varchar', length: 40, nullable: true })
  legalRef: string | null;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
