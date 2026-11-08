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
import { Farm } from '../../farms/entities/farm.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { CustomerType } from '../../../common/enums/customer-type.enum.js';
import type { Operator } from '../../trace/entities/operator.entity.js';

@Entity('customers')
@Index('IDX_customers_farm_phone', ['farmId', 'phone'])
@Index('IDX_customers_farm_buyer', ['farmId', 'buyerUserId'])
@Index('IDX_customers_farm_code', ['farmId', 'code'], { unique: true })
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  /** Code interne client (ex. CL-0001). Généré automatiquement à la création. */
  @Column({ name: 'code', type: 'varchar', nullable: true })
  code: string | null;

  @Column({ name: 'full_name' })
  fullName: string;

  /**
   * The Market account this customer record was created for. Market orders
   * match on this, never on the phone: sign-up doesn't verify phones, so a
   * matching number proves nothing and mustn't reach another customer's account.
   */
  @Column({ name: 'buyer_user_id', type: 'uuid', nullable: true })
  buyerUserId: string | null;

  /**
   * Programme operator this customer is (traceability, L7): optional link
   * set by the farm, e.g. the slaughterhouse it sells to.
   */
  @ManyToOne('Operator', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'operator_id' })
  operator?: Operator | null;

  @Column({ name: 'operator_id', type: 'uuid', nullable: true })
  operatorId: string | null;

  /** Nature du client (particulier, restaurant, hôtel…). Sépare le segment (valeur calculée). */
  @Column({ name: 'type', type: 'varchar', default: CustomerType.PARTICULIER })
  type: CustomerType | string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** Credit ceiling in FCFA on the outstanding balance; null = the farm default applies. */
  @Column({ name: 'credit_limit_fcfa', type: 'int', nullable: true })
  creditLimitFcfa: number | null;

  /** Days after the invoice day before an unpaid invoice is overdue; null = farm default. */
  @Column({ name: 'payment_term_days', type: 'int', nullable: true })
  paymentTermDays: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
