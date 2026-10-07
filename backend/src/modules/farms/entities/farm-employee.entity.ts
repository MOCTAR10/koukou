import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Farm } from './farm.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { FarmStaffRole } from '../../../common/enums/farm-staff-role.enum.js';
import { ContractType } from '../../../common/enums/contract-type.enum.js';

@Entity('farm_employees')
@Unique(['farm', 'user'])
export class FarmEmployee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** Rôle au sein de la ferme : Administrateur KouKou (droits flexibles) ou Éleveur Koukou (droits fixes). */
  @Column({ type: 'enum', enum: FarmStaffRole, default: FarmStaffRole.ELEVEUR })
  role: FarmStaffRole;

  /** Intitulé du poste, saisie libre (Comptable, RH, Responsable ponte…). */
  @Column({ name: 'job_title', type: 'varchar', nullable: true })
  jobTitle: string | null;

  /** Permissions accordées (Administrateur KouKou). Ignorées pour l'Éleveur (droits fixes en code). */
  @Column({ type: 'jsonb', default: '[]' })
  permissions: string[];

  /** Membre actif : un compte désactivé perd tout accès à la ferme sans être supprimé. */
  @Column({ default: true })
  active: boolean;

  @Column({ name: 'building_assignment', type: 'varchar', nullable: true })
  buildingAssignment: string | null;

  /* ── Dossier RH (fiche employé) ── */

  /** Service / département (saisie libre). */
  @Column({ type: 'varchar', nullable: true })
  department: string | null;

  /** Nature du contrat (CDI, CDD, journalier…). */
  @Column({ name: 'contract_type', type: 'enum', enum: ContractType, nullable: true })
  contractType: ContractType | null;

  /** Date d'embauche (ISO YYYY-MM-DD). */
  @Column({ name: 'hire_date', type: 'date', nullable: true })
  hireDate: string | null;

  /** Fin de contrat prévue (ISO YYYY-MM-DD), nulle pour un CDI. */
  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  /** Salaire de référence en FCFA (entier). */
  @Column({ name: 'salary_fcfa', type: 'int', nullable: true })
  salaryFcfa: number | null;

  /** Note libre (observations RH). */
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;
}