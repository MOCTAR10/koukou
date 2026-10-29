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
import { BatchType } from '../../../common/enums/batch-type.enum.js';
import { Species } from '../../../common/enums/species.enum.js';
import { Farm } from '../../farms/entities/farm.entity.js';

// Codes are unique among shared rows and within each farm.
@Index('UQ_sanitary_protocols_shared_code', ['code'], {
  unique: true,
  where: '"farm_id" IS NULL',
})
@Index('UQ_sanitary_protocols_farm_code', ['farmId', 'code'], {
  unique: true,
})
@Entity('sanitary_protocols')
export class SanitaryProtocol {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  code: string;

  /**
   * Owning farm of a custom vaccination program; null = shared reference data (seeded).
   * A farm only sees and uses the shared rows plus its own.
   */
  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm | null;

  @Column({ name: 'farm_id', type: 'uuid', nullable: true })
  farmId: string | null;

  @Column({ type: 'enum', enum: Species })
  @Index()
  species: Species;

  @Column({ type: 'enum', enum: BatchType })
  @Index()
  type: BatchType;

  @Column()
  name: string;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'is_editable', default: true })
  isEditable: boolean;

  /**
   * Shared program published by the platform admin. Keeps the boot repair
   * (assignLegacyCustomResources) from handing it to the first farm using it.
   */
  @Column({ name: 'admin_shared', default: false })
  adminShared: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
