import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BiosecurityAnswer } from '../../../common/enums/visit.enum.js';
import type { FarmVisit } from './farm-visit.entity.js';

/**
 * One answer of a visit's biosecurity grid. The criterion's label, category
 * and weight are copied from the CRITERE_BIOSECURITE item when the visit is
 * recorded, so a later edit of the grid never changes an old score.
 */
@Index('UQ_farm_visit_answers_visit_criterion', ['visitId', 'criterionCode'], {
  unique: true,
})
@Entity('farm_visit_answers')
export class FarmVisitAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('FarmVisit', 'answers', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_id' })
  visit?: FarmVisit;

  @Column({ name: 'visit_id', type: 'uuid' })
  visitId: string;

  @Column({ name: 'criterion_code', type: 'varchar', length: 40 })
  criterionCode: string;

  @Column({ name: 'criterion_label', type: 'varchar' })
  criterionLabel: string;

  @Column({ name: 'criterion_category', type: 'varchar', nullable: true })
  criterionCategory: string | null;

  @Column({ type: 'int' })
  weight: number;

  @Column({
    type: 'enum',
    enum: BiosecurityAnswer,
  })
  answer: BiosecurityAnswer;

  @Column({ type: 'varchar', length: 500, nullable: true })
  comment: string | null;
}
