import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { UserRole } from '../../common/enums/role.enum.js';
import { FarmStaffRole } from '../../common/enums/farm-staff-role.enum.js';
import { ContractType } from '../../common/enums/contract-type.enum.js';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import {
  defaultPermissionsFor,
  ELEVEUR_DEFAULT_PERMISSIONS,
  findStaffProfile,
  isPermissionCode,
  type PermissionCode,
} from '../../common/permissions/permission-catalog.js';
import { CreateElevageDto } from './dto/create-eleveur.dto.js';
import { UpdateEleveurDto } from './dto/update-eleveur.dto.js';
import { User } from '../users/entities/user.entity.js';
import { FarmEmployee } from './entities/farm-employee.entity.js';
import { Farm } from './entities/farm.entity.js';

export interface CreateFarmInput {
  name: string;
  administrativeCity: string;
  buildingCount?: number | null;
  capacityPerBuilding?: number | null;
  buildingAreaM2?: number | null;
  defaultSacKg?: number;
  longitude?: number | null;
  latitude?: number | null;
  isVerified?: boolean;
}

/** Fichier reçu en multipart. `multer` écrit en mémoire par défaut dans Nest,
 *  d'où `buffer`. Interface locale : `@types/multer` n'est pas installé et le
 *  tsconfig restreint les types globaux. */
export interface UploadedImageFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const LOGO_MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 Mo

/** Racine des fichiers servis par l'API (`app.useStaticAssets`). Surchargable
 *  via UPLOADS_DIR ; relatif au cwd du process (backend/ en dev). */
export function uploadsRoot(): string {
  return process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads');
}

@Injectable()
export class FarmsService {
  constructor(
    @InjectRepository(Farm)
    private readonly farmRepo: Repository<Farm>,
    @InjectRepository(FarmEmployee)
    private readonly employeeRepo: Repository<FarmEmployee>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(
    owner: AuthUser,
    input: CreateFarmInput,
    ownerId?: string,
  ): Promise<Farm> {
    const farm = this.farmRepo.create({
      name: input.name,
      administrativeCity: input.administrativeCity,
      ownerId: ownerId ?? owner.id,
      buildingCount: input.buildingCount ?? null,
      capacityPerBuilding: input.capacityPerBuilding ?? null,
      buildingAreaM2: input.buildingAreaM2 ?? null,
      defaultSacKg: input.defaultSacKg ?? 50,
      longitude: input.longitude ?? null,
      latitude: input.latitude ?? null,
    });
    return this.farmRepo.save(farm);
  }

  /** Provisionnement plateforme : compte Propriétaire + sa ferme (admin). */
  async provision(
    farmInput: CreateFarmInput,
    ownerInput: {
      phone: string;
      email?: string;
      fullName: string;
      code: string;
    },
  ): Promise<{ farm: Farm; owner: PublicUser }> {
    const where: Array<Partial<{ phone: string; email: string }>> = [
      { phone: ownerInput.phone },
    ];
    if (ownerInput.email) where.push({ email: ownerInput.email });
    const existing = await this.userRepo.findOne({ where });
    if (existing) {
      throw new ConflictException(
        'Un compte existe déjà avec ce numéro ou cet e-mail.',
      );
    }
    const owner = await this.userRepo.save(
      this.userRepo.create({
        phone: ownerInput.phone,
        email: ownerInput.email ?? null,
        fullName: ownerInput.fullName,
        passwordHash: await bcrypt.hash(ownerInput.code, 10),
        role: UserRole.PROPRIETAIRE,
      }),
    );
    const farm = await this.create(owner as AuthUser, farmInput, owner.id);
    return { farm, owner: this.publicUser(owner) };
  }

  async findMine(user: AuthUser): Promise<Farm[]> {
    if (user.role === UserRole.PLATFORM_ADMIN) {
      return this.farmRepo.find({ order: { name: 'ASC' } });
    }
    if (user.role === UserRole.PROPRIETAIRE) {
      return this.farmRepo.find({ where: { ownerId: user.id } });
    }
    const employments = await this.employeeRepo.find({
      where: { userId: user.id },
      relations: { farm: true },
    });
    return employments.map((e) => e.farm);
  }

  async assertAccessible(user: AuthUser, farmId: string): Promise<Farm> {
    const farm = await this.farmRepo.findOne({ where: { id: farmId } });
    if (!farm) throw new NotFoundException('Ferme introuvable.');
    if (user.role === UserRole.PLATFORM_ADMIN) {
      return farm;
    }
    if (user.role === UserRole.PROPRIETAIRE && farm.ownerId === user.id) {
      return farm;
    }
    if (user.role === UserRole.ELEVEUR) {
      const link = await this.employeeRepo.findOne({
        where: { farmId, userId: user.id },
      });
      if (link && link.active === false) {
        throw new ForbiddenException(
          'Accès refusé : votre compte a été désactivé par le propriétaire de la ferme.',
        );
      }
      if (link) return farm;
    }
    throw new ForbiddenException(
      'Accès refusé : cette ferme ne vous appartient pas ou vous n’y êtes pas rattaché.',
    );
  }

  /** Les rattachements créés avant le système de rôles n'ont pas de rôle : Éleveur par défaut. */
  private staffRole(role: FarmStaffRole | null | undefined): FarmStaffRole {
    return role === FarmStaffRole.ADMIN
      ? FarmStaffRole.ADMIN
      : FarmStaffRole.ELEVEUR;
  }

  /**
   * Résolution des droits effectifs d'un utilisateur sur une ferme, pour le
   * PermissionsGuard et les services : 'ALL' (Propriétaire/plateforme),
   * null (inaccessible ou membre inactif), sinon le set de permissions.
   */
  async resolveEffectivePermissions(
    user: AuthUser,
    farmId: string,
  ): Promise<'ALL' | { role: FarmStaffRole; permissions: ReadonlySet<PermissionCode> } | null> {
    if (user.role === UserRole.PLATFORM_ADMIN) return 'ALL';
    const farm = await this.farmRepo.findOne({ where: { id: farmId } });
    if (!farm) return null;
    if (farm.ownerId === user.id) return 'ALL';
    const link = await this.employeeRepo.findOne({
      where: { farmId, userId: user.id },
    });
    if (!link || link.active === false) return null;
    const role = this.staffRole(link.role);
    const permissions =
      role === FarmStaffRole.ADMIN
        ? new Set<PermissionCode>(
            (link.permissions ?? []).filter(isPermissionCode),
          )
        : ELEVEUR_DEFAULT_PERMISSIONS;
    return { role, permissions };
  }

  /** Profil « moi » sur une ferme : personnalité + poste + droits effectifs (mobile). */
  async profileOf(
    user: AuthUser,
    farmId: string,
  ): Promise<
    | {
        farmId: string;
        role: 'PROPRIETAIRE' | FarmStaffRole;
        jobTitle: string | null;
        buildingAssignment: string | null;
        active: boolean;
        permissions: string[];
      }
    | null
  > {
    await this.assertAccessible(user, farmId);
    if (user.role === UserRole.PLATFORM_ADMIN) {
      return {
        farmId,
        role: 'PROPRIETAIRE',
        jobTitle: 'Administrateur plateforme',
        buildingAssignment: null,
        active: true,
        permissions: ['*'],
      };
    }
    const farm = await this.farmRepo.findOne({ where: { id: farmId } });
    if (farm?.ownerId === user.id) {
      return {
        farmId,
        role: 'PROPRIETAIRE',
        jobTitle: 'Propriétaire',
        buildingAssignment: null,
        active: true,
        permissions: ['*'],
      };
    }
    const link = await this.employeeRepo.findOne({
      where: { farmId, userId: user.id },
    });
    if (!link) return null;
    const role = this.staffRole(link.role);
    return {
      farmId,
      role,
      jobTitle: link.jobTitle,
      buildingAssignment: link.buildingAssignment,
      active: link.active,
      permissions:
        role === FarmStaffRole.ADMIN
          ? (link.permissions ?? []).filter(isPermissionCode)
          : [...ELEVEUR_DEFAULT_PERMISSIONS],
    };
  }

  /** Liste toutes les fermes (plateforme) avec un aperçu du propriétaire. */
  async listAll(): Promise<Farm[]> {
    return this.farmRepo
      .createQueryBuilder('farm')
      .leftJoinAndSelect('farm.owner', 'owner')
      .select([
        'farm.id',
        'farm.name',
        'farm.administrativeCity',
        'farm.buildingCount',
        'farm.capacityPerBuilding',
        'farm.buildingAreaM2',
        'farm.defaultSacKg',
        'farm.longitude',
        'farm.latitude',
        'farm.isVerified',
        'farm.active',
        'farm.createdAt',
        'owner.id',
        'owner.fullName',
        'owner.phone',
        'owner.email',
        'owner.role',
        'owner.active',
      ])
      .orderBy('farm.createdAt', 'DESC')
      .getMany();
  }

  /** Mise à jour d'une ferme (Propriétaire de la ferme ou Administrateur plateforme). */
  async updateFarm(
    user: AuthUser,
    farmId: string,
    input: Partial<CreateFarmInput>,
  ): Promise<Farm> {
    const farm = await this.assertAccessible(user, farmId);
    if (input.name != null) farm.name = input.name;
    if (input.administrativeCity != null)
      farm.administrativeCity = input.administrativeCity;
    if (input.buildingCount !== undefined)
      farm.buildingCount = input.buildingCount ?? null;
    if (input.capacityPerBuilding !== undefined)
      farm.capacityPerBuilding = input.capacityPerBuilding ?? null;
    if (input.buildingAreaM2 !== undefined)
      farm.buildingAreaM2 = input.buildingAreaM2 ?? null;
    if (input.defaultSacKg != null) farm.defaultSacKg = input.defaultSacKg;
    if (input.longitude !== undefined) farm.longitude = input.longitude ?? null;
    if (input.latitude !== undefined) farm.latitude = input.latitude ?? null;
    if (input.isVerified != null) farm.isVerified = input.isVerified;
    return this.farmRepo.save(farm);
  }

  /** Suspendre / réactiver une ferme (plateforme uniquement). */
  async setFarmActive(farmId: string, active: boolean): Promise<Farm> {
    const farm = await this.farmRepo.findOne({ where: { id: farmId } });
    if (!farm) throw new NotFoundException('Ferme introuvable.');
    farm.active = active;
    return this.farmRepo.save(farm);
  }

  /** Remplace le logo de la ferme : écrit le fichier sous /uploads/logos et
   *  n'en garde que le chemin public. L'ancien fichier est supprimé. */
  async setFarmLogo(farm: Farm, file: UploadedImageFile): Promise<Farm> {
    const extension = LOGO_MIME_EXTENSIONS[file.mimetype];
    if (!extension) {
      throw new BadRequestException(
        'Format d’image non supporté. Utilisez un fichier PNG, JPEG ou WEBP.',
      );
    }
    if (file.size === 0 || file.buffer.length === 0) {
      throw new BadRequestException('Le fichier image est vide.');
    }
    if (file.size > LOGO_MAX_BYTES) {
      throw new BadRequestException('Le logo ne doit pas dépasser 2 Mo.');
    }

    const directory = join(uploadsRoot(), 'logos');
    await mkdir(directory, { recursive: true });
    const filename = `${farm.id}.${extension}`;
    await writeFile(join(directory, filename), file.buffer);

    const previous = farm.logoUrl;
    farm.logoUrl = `/uploads/logos/${filename}`;
    const saved = await this.farmRepo.save(farm);

    // Ménage best-effort : un logo replaced par un autre format laisse un orphelin.
    if (previous && previous !== saved.logoUrl) {
      const previousName = previous.split('/').pop();
      if (previousName && previousName !== filename) {
        await unlink(join(directory, previousName)).catch(() => undefined);
      }
    }
    return saved;
  }

  /** Retire le logo personnalisé (retour au logo KouKou par défaut). */
  async clearFarmLogo(farm: Farm): Promise<Farm> {
    const previous = farm.logoUrl;
    farm.logoUrl = null;
    const saved = await this.farmRepo.save(farm);
    if (previous) {
      const previousName = previous.split('/').pop();
      if (previousName) {
        await unlink(join(uploadsRoot(), 'logos', previousName)).catch(
          () => undefined,
        );
      }
    }
    return saved;
  }

  async createEmployee(owner: AuthUser, farmId: string, dto: CreateElevageDto) {
    await this.assertAccessible(owner, farmId);
    const existing = await this.userRepo.findOne({
      where: [{ phone: dto.phone }, { email: dto.email }],
    });
    if (existing) {
      throw new ConflictException(
        'Un compte existe déjà avec ce numéro ou cet e-mail.',
      );
    }
    // Un profil métier (Vétérinaire, Comptable…) pose la base ; les champs
    // explicites (role/permissions) du DTO la surchargent ensuite.
    const profile = dto.profileKey ? findStaffProfile(dto.profileKey) : undefined;
    if (dto.profileKey && !profile) {
      throw new BadRequestException(`Profil inconnu : ${dto.profileKey}.`);
    }
    const role = dto.role ?? profile?.role ?? FarmStaffRole.ELEVEUR;
    let permissions: PermissionCode[] | undefined;
    if (dto.permissions !== undefined) {
      if (role !== FarmStaffRole.ADMIN) {
        throw new BadRequestException(
          'Les permissions ne se règlent que pour un Administrateur KouKou (rôle Éleveur = droits fixes).',
        );
      }
      const invalid = dto.permissions.filter((c) => !isPermissionCode(c));
      if (invalid.length > 0) {
        throw new BadRequestException(
          `Permission(s) inconnue(s) : ${invalid.join(', ')}. Consultez le catalogue GET /farms/:farmId/permissions.`,
        );
      }
      permissions = dto.permissions as PermissionCode[];
    }
    const employee = await this.userRepo.save(
      this.userRepo.create({
        phone: dto.phone,
        email: dto.email ?? null,
        fullName: dto.fullName,
        passwordHash: await bcrypt.hash(dto.code, 10),
        role: UserRole.ELEVEUR,
      }),
    );
    const link = await this.linkEmployee(owner, farmId, employee.id, {
      role,
      jobTitle: dto.jobTitle ?? profile?.jobTitle ?? null,
      buildingAssignment: dto.buildingAssignment ?? null,
      permissions: permissions ?? profile?.permissions ?? defaultPermissionsFor(role),
      department: dto.department ?? null,
      contractType: dto.contractType ?? null,
      hireDate: dto.hireDate ?? null,
      endDate: dto.endDate ?? null,
      salaryFcfa: dto.salaryFcfa ?? null,
      notes: dto.notes ?? null,
    });
    return { user: this.publicUser(employee), employment: link };
  }

  async linkEmployee(
    owner: AuthUser,
    farmId: string,
    employeeUserId: string,
    options?: {
      role?: FarmStaffRole;
      jobTitle?: string | null;
      buildingAssignment?: string | null;
      permissions?: PermissionCode[];
      department?: string | null;
      contractType?: ContractType | null;
      hireDate?: string | null;
      endDate?: string | null;
      salaryFcfa?: number | null;
      notes?: string | null;
    },
  ): Promise<FarmEmployee> {
    await this.assertAccessible(owner, farmId);
    const employee = await this.userRepo.findOne({
      where: { id: employeeUserId },
    });
    if (!employee) throw new NotFoundException('Employé introuvable.');
    if (employee.role !== UserRole.ELEVEUR) {
      throw new BadRequestException(
        'Seul un compte de la ferme peut être rattaché (Administrateur KouKou ou Éleveur Koukou).',
      );
    }
    const existing = await this.employeeRepo.findOne({
      where: { farmId, userId: employeeUserId },
    });
    if (existing) return existing;
    const link = this.employeeRepo.create({
      farmId,
      userId: employeeUserId,
      role: options?.role ?? FarmStaffRole.ELEVEUR,
      jobTitle: options?.jobTitle ?? null,
      buildingAssignment: options?.buildingAssignment ?? null,
      permissions: options?.permissions ?? defaultPermissionsFor(FarmStaffRole.ELEVEUR),
      department: options?.department ?? null,
      contractType: options?.contractType ?? null,
      hireDate: options?.hireDate ?? null,
      endDate: options?.endDate ?? null,
      salaryFcfa: options?.salaryFcfa ?? null,
      notes: options?.notes ?? null,
    });
    return this.employeeRepo.save(link);
  }

  /** Éditer un membre : poste, rôle, bâtiment, suspension, permissions (si Administrateur). */
  async updateEmployee(
    auth: AuthUser,
    farmId: string,
    employmentId: string,
    dto: UpdateEleveurDto,
  ): Promise<FarmEmployee> {
    await this.assertAccessible(auth, farmId);
    const link = await this.employeeRepo.findOne({
      where: { id: employmentId, farmId },
    });
    if (!link) {
      throw new NotFoundException('Membre introuvable dans cette ferme.');
    }

    if (dto.jobTitle !== undefined) link.jobTitle = dto.jobTitle;
    if (dto.buildingAssignment !== undefined) {
      link.buildingAssignment = dto.buildingAssignment;
    }
    if (dto.active !== undefined) link.active = dto.active;

    /* ── Dossier RH ── */
    if (dto.department !== undefined) link.department = dto.department;
    if (dto.contractType !== undefined) link.contractType = dto.contractType;
    if (dto.hireDate !== undefined) link.hireDate = dto.hireDate;
    if (dto.endDate !== undefined) link.endDate = dto.endDate;
    if (dto.salaryFcfa !== undefined) link.salaryFcfa = dto.salaryFcfa;
    if (dto.notes !== undefined) link.notes = dto.notes;

    // Profil métier : pose rôle + permissions avant les surcharges explicites.
    const profile = dto.profileKey ? findStaffProfile(dto.profileKey) : undefined;
    if (dto.profileKey && !profile) {
      throw new BadRequestException(`Profil inconnu : ${dto.profileKey}.`);
    }
    if (profile) {
      link.role = profile.role;
      link.permissions =
        profile.role === FarmStaffRole.ADMIN
          ? [...profile.permissions]
          : defaultPermissionsFor(FarmStaffRole.ELEVEUR);
      if (dto.jobTitle === undefined && !link.jobTitle) {
        link.jobTitle = profile.jobTitle;
      }
    }

    if (dto.role !== undefined) {
      const nextRole = dto.role;
      if (nextRole === link.role) {
        // aucun changement
      } else if (nextRole === FarmStaffRole.ELEVEUR) {
        link.role = nextRole;
        link.permissions = defaultPermissionsFor(FarmStaffRole.ELEVEUR);
      } else {
        link.role = nextRole;
        link.permissions = defaultPermissionsFor(FarmStaffRole.ADMIN);
      }
    }

    if (dto.permissions !== undefined) {
      if (link.role !== FarmStaffRole.ADMIN) {
        throw new BadRequestException(
          'Les permissions ne se règlent que pour un Administrateur KouKou (rôle Éleveur = droits fixes).',
        );
      }
      const invalid = dto.permissions.filter((c) => !isPermissionCode(c));
      if (invalid.length > 0) {
        throw new BadRequestException(
          `Permission(s) inconnue(s) : ${invalid.join(', ')}. Consultez le catalogue GET /farms/:farmId/permissions.`,
        );
      }
      link.permissions = dto.permissions;
    }

    // Normalise les anciens rattachements sans rôle (colonne ajoutée plus tard).
    if (link.role === null || link.role === undefined) {
      link.role = FarmStaffRole.ELEVEUR;
      if (!link.permissions || link.permissions.length === 0) {
        link.permissions = defaultPermissionsFor(FarmStaffRole.ELEVEUR);
      }
    }

    return this.employeeRepo.save(link);
  }

  async listEmployees(
    farmId: string,
  ): Promise<Array<Omit<FarmEmployee, 'user'> & { user: PublicUser }>> {
    const employments = await this.employeeRepo.find({
      where: { farmId },
      relations: { user: true },
      order: { role: 'ASC', createdAt: 'DESC' },
    });
    return employments.map((e) => {
      const { user, ...rest } = e;
      return {
        ...rest,
        role: this.staffRole(rest.role),
        permissions: this.staffRole(rest.role) === FarmStaffRole.ADMIN ? e.permissions : [...ELEVEUR_DEFAULT_PERMISSIONS],
        user: this.publicUser(user),
      };
    });
  }

  private publicUser(user: User): PublicUser {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email ?? null,
      fullName: user.fullName,
      role: user.role,
    };
  }

  /** Équipe assignable pour une tâche (accès « planifier les tâches », sans exigence equipe:gerer). */
  async listAssignableTeam(auth: AuthUser, farmId: string) {
    await this.assertAccessible(auth, farmId);
    const employments = await this.employeeRepo.find({
      where: { farmId, active: true },
      relations: { user: true },
      order: { role: 'ASC', createdAt: 'DESC' },
    });
    return employments.map((e) => ({
      id: e.id,
      userId: e.user.id,
      fullName: e.user.fullName,
      role: this.staffRole(e.role),
      active: e.active,
    }));
  }
}

export interface PublicUser {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  role: UserRole;
}
