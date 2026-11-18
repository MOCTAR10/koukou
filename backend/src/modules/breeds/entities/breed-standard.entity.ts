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
import { Breed } from './breed.entity.js';

@Entity('breed_standards')
export class BreedStandard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Breed, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'breed_id' })
  breed: Breed;

  @Column({ name: 'breed_id', type: 'uuid' })
  @Index()
  breedId: string;

  @Column({ type: 'int' })
  @Index()
  week: number;

  @Column({ name: 'target_avg_weight_kg', type: 'float', nullable: true })
  targetAvgWeightKg: number | null;

  @Column({ name: 'target_fcr', type: 'float', nullable: true })
  targetFcr: number | null;

  @Column({ name: 'target_lay_rate_percent', type: 'float', nullable: true })
  targetLayRatePercent: number | null;

  /**
   * Target feed per bird per day during the week, in grams. Derived from the
   * weight and cumulative FCR targets (see `derive-daily-feed.ts`); editable
   * through `PUT /breeds/:id/standards`. Indicative value, to be validated.
   */
  @Column({ name: 'target_daily_feed_g', type: 'float', nullable: true })
  targetDailyFeedG: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
