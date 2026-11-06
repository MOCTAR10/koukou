import type { Farm, PublicUser } from './types';

export type TaskStatus = 'A_FAIRE' | 'EN_COURS' | 'FAIT' | 'ANNULEE';

export interface FarmTask {
  id: string;
  farmId: string;
  assigneeId: string | null;
  batchId: string | null;
  title: string;
  notes: string | null;
  dueDate: string;
  status: TaskStatus;
  completedAt: string | null;
}

export interface CreateTaskInput {
  title: string;
  dueDate: string;
  notes?: string;
  assigneeId?: string;
  batchId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  dueDate?: string;
  notes?: string | null;
  assigneeId?: string | null;
  batchId?: string | null;
  status?: TaskStatus;
}

export type StaffRole = 'ADMIN' | 'ELEVEUR';
export type ContractType = 'CDI' | 'CDD' | 'JOURNALIER' | 'STAGE' | 'APPRENTISSAGE' | 'AUTRE';

/** GET /farms/:id/team: active members only. */
export interface AssignableMember {
  id: string;
  userId: string;
  fullName: string;
  role: StaffRole;
  active: boolean;
}

/** GET /farms/:id/eleveurs: one employment link, user nested. */
export interface FarmMember {
  id: string;
  farmId: string;
  userId: string;
  role: StaffRole;
  active: boolean;
  jobTitle: string | null;
  buildingAssignment: string | null;
  permissions: string[];
  department: string | null;
  contractType: ContractType | null;
  hireDate: string | null;
  endDate: string | null;
  salaryFcfa: number | null;
  notes: string | null;
  user: Omit<PublicUser, 'active'>;
}

export interface PermissionGroup {
  key: string;
  label: string;
  items: Array<{ code: string; label: string; description: string }>;
}

export interface StaffProfile {
  key: string;
  label: string;
  role: StaffRole;
  jobTitle: string;
  permissions: string[];
}

export interface PermissionCatalog {
  groups: PermissionGroup[];
  profiles: StaffProfile[];
}

/** GET /farms/:id/me. */
export interface FarmMemberProfile {
  farmId: string;
  /** INSTITUTION: an institutional account on a farm of its scope (`jobTitle` = its access profile). */
  role: 'PROPRIETAIRE' | StaffRole | 'INSTITUTION';
  jobTitle: string | null;
  buildingAssignment: string | null;
  active: boolean;
  permissions: string[];
}

export interface BuildingOption {
  id: string;
  name: string;
}

export type FarmWithLogo = Farm & { logoUrl?: string | null };
