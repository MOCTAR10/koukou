import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { UserRole } from '../../common/enums/role.enum.js';
import { isUniqueViolation } from '../../common/utils/idempotency.js';
import { FarmStaffRole } from '../../common/enums/farm-staff-role.enum.js';
import { ContractType } from '../../common/enums/contract-type.enum.js';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import {
  defaultPermissionsFor,
  ELEVEUR_DEFAULT_PERMISSIONS,
  findStaffProfile,
  isPermissionCode,
  type PermissionCode,
  withDormantPermissions,
} from '../../common/permissions/permission-catalog.js';
import { CreateElevageDto } from './dto/create-eleveur.dto.js';
import { UpdateEleveurDto } from './dto/update-eleveur.dto.js';
import { User } from '../users/entities/user.entity.js';
import { FarmEmployee } from './entities/farm-employee.entity.js';
import { Farm } from './entities/farm.entity.js';
import { Province } from '../programme/entities/province.entity.js';
import type { InstitutionAccess } from '../access/access-rules.js';
import { institutionPermissions } from '../access/permission-domains.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';

/**
 * Editable details of a farm (owner settings, platform admin). A farm itself
 * is only created by the programme registry (`POST /programme/farms`).
 */
export interface FarmDetailsInput {
  /** Refused (400): the name belongs to the registry (duplicate check). */
  name?: unknown;
  administrativeCity?: string;
  /** Refused (400): buildings and capacity belong to the registry. */
  buildingCount?: unknown;
  capacityPerBuilding?: unknown;
  buildingAreaM2?: unknown;
  defaultSacKg?: number;
  /** Refused (400): the GPS point belongs to the registry (history, province check). */
  longitude?: unknown;
  latitude?: unknown;
  isVerified?: boolean;
}

export interface ProprietaireInput {
  /** Normalized (`normalizePhone`). */
  phone: string;
  email?: string | null;
  fullName: string;
  /** Login secret, hashed. */
  code: string;
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

/** Magic bytes of the accepted image formats (logos, declaration photos). */
export function hasImageSignature(buf: Buffer, extension: string): boolean {
  if (extension === 'png') {
    return buf.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  if (extension === 'jpg' || extension === 'jpeg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (extension === 'webp') {
    return (
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
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

/** Hides the HR record (salary, contract, notes) of a staff link. */
/** French message of the 400 when a farm is renamed outside the registry. */
export const FARM_NAME_IN_REGISTRY =
  'Le nom d’une ferme du programme se modifie dans le registre (fiche de la ferme, PATCH /programme/farms/:farmId), qui contrôle les doublons.';

/** French message of the 400 when a farm's GPS point is set outside the registry. */
export const FARM_GPS_IN_REGISTRY =
  'La position GPS d’une ferme du programme se modifie dans le registre (PUT /programme/farms/:farmId/gps), qui garde l’historique des relevés et contrôle la province.';

/** French message of the 400 when building or capacity fields are set outside the registry. */
export const FARM_CAPACITY_IN_REGISTRY =
  'Les bâtiments et la capacité d’une ferme du programme se modifient dans le registre (capacité en places : PATCH /programme/farms/:farmId ; infrastructures : PUT /programme/farms/:farmId/infrastructures).';

/** A farm as `GET /farms` serves it: its province code and name added. */
export type FarmWithProvince = Farm & {
  provinceCode: string | null;
  provinceName: string | null;
};

/** A member's stored codes as the apps see them: dormant ones left out. */
function servedPermissions(codes: readonly string[] | null | undefined): string[] {
  return (codes ?? []).filter(isPermissionCode);
}

function withoutHr<T extends Partial<FarmEmployee>>(link: T): T {
  return {
    ...link,
    department: null,
    contractType: null,
    hireDate: null,
    endDate: null,
    salaryFcfa: null,
    notes: null,
  };
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
    @InjectRepository(Province)
    private readonly provinceRepo: Repository<Province>,
    private readonly scope: ScopeResolver,
  ) {}

  /** Existing account holding this (normalized) phone or e-mail, if any. */
  async findAccount(
    phone: string,
    email?: string | null,
    em?: EntityManager,
  ): Promise<User | null> {
    const where: Array<Partial<{ phone: string; email: string }>> = [{ phone }];
    if (email) where.push({ email });
    return (em ? em.getRepository(User) : this.userRepo).findOne({ where });
  }

  /**
   * Creates a PROPRIETAIRE account (programme owner activation). The phone
   * must already be normalized (`normalizePhone`).
   * @throws ConflictException when the phone or e-mail has an account
   */
  async createProprietaire(
    input: ProprietaireInput,
    em?: EntityManager,
  ): Promise<User> {
    const repo = em ? em.getRepository(User) : this.userRepo;
    if (await this.findAccount(input.phone, input.email, em)) {
      throw new ConflictException(
        'Un compte existe déjà avec ce numéro ou cet e-mail.',
      );
    }
    try {
      return await repo.save(
        repo.create({
          phone: input.phone,
          email: input.email ?? null,
          fullName: input.fullName,
          passwordHash: await bcrypt.hash(input.code, 10),
          role: UserRole.PROPRIETAIRE,
        }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'Un compte existe déjà avec ce numéro ou cet e-mail.',
        );
      }
      throw err;
    }
  }

  /** The caller's farms (`GET /farms`), each with its province code and name. */
  async findMine(user: AuthUser): Promise<FarmWithProvince[]> {
    return this.withProvince(await this.farmsOf(user));
  }

  private async farmsOf(user: AuthUser): Promise<Farm[]> {
    if (user.role === UserRole.PLATFORM_ADMIN) {
      return this.farmRepo.find({ order: { name: 'ASC' } });
    }
    if (user.role === UserRole.PROPRIETAIRE) {
      return this.farmRepo.find({ where: { ownerId: user.id } });
    }
    if (user.role === UserRole.ACHETEUR || user.role === UserRole.OPERATEUR) {
      return [];
    }
    if (user.role === UserRole.INSTITUTION) {
      // The farms of the scope (none for AGGREGATE / AUDIT / FINANCED yet).
      const access = await this.scope.accessOf(user.id);
      if (!access) return [];
      return this.scope
        .applyFarmScope(this.farmRepo.createQueryBuilder('f'), 'f', access)
        .orderBy('f.name', 'ASC')
        .getMany();
    }
    const employments = await this.employeeRepo.find({
      where: { userId: user.id },
      relations: { farm: true },
    });
    return employments.map((e) => e.farm);
  }

  /**
   * Adds `provinceCode` / `provinceName` (null without a province) to farms,
   * with one query for all of them.
   */
  async withProvince(farms: Farm[]): Promise<FarmWithProvince[]> {
    const ids = [
      ...new Set(
        farms.map((f) => f.provinceId).filter((id): id is string => !!id),
      ),
    ];
    const provinces = ids.length
      ? await this.provinceRepo.find({
          where: { id: In(ids) },
          select: { id: true, code: true, name: true },
        })
      : [];
    const byId = new Map(provinces.map((p) => [p.id, p]));
    return farms.map((f) => {
      const p = f.provinceId ? byId.get(f.provinceId) : undefined;
      return Object.assign(f, {
        provinceCode: p?.code ?? null,
        provinceName: p?.name ?? null,
      });
    });
  }

  /**
   * Farm scope of a request on reference data (breeds, cultures, programs):
   * custom rows belong to one farm. Reads without a farm see shared rows
   * only; creating a shared row (no farm) is reserved to the platform admin.
   */
  async resourceScope(
    user: AuthUser,
    farmId: string | null | undefined,
    mode: 'read' | 'write',
  ): Promise<string | null> {
    if (farmId) {
      await this.assertAccessible(user, farmId);
      return farmId;
    }
    if (mode === 'write' && user.role !== UserRole.PLATFORM_ADMIN) {
      throw new BadRequestException(
        'Précisez la ferme (farmId) : un élément personnalisé appartient à une ferme.',
      );
    }
    return null;
  }

  async assertAccessible(user: AuthUser, farmId: string): Promise<Farm> {
    const farm = await this.farmRepo.findOne({ where: { id: farmId } });
    if (!farm) throw new NotFoundException('Ferme introuvable.');
    if (user.role === UserRole.PLATFORM_ADMIN) {
      return farm;
    }
    if (user.role === UserRole.INSTITUTION) {
      const access = await this.scope.requireAccess(user);
      this.scope.assertFarm(access, farm);
      return farm;
    }
    if (
      user.role === UserRole.PROPRIETAIRE &&
      farm.ownerId !== null &&
      farm.ownerId === user.id
    ) {
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

  /** Access of an institutional account to `farm`, or null when out of scope. */
  private async institutionAccessTo(
    user: AuthUser,
    farm: Farm,
  ): Promise<InstitutionAccess | null> {
    const access = await this.scope.accessOf(user.id);
    return access && this.scope.includes(access, farm) ? access : null;
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
  ): Promise<
    | 'ALL'
    | {
        role: FarmStaffRole | 'INSTITUTION';
        permissions: ReadonlySet<PermissionCode>;
      }
    | null
  > {
    if (user.role === UserRole.PLATFORM_ADMIN) return 'ALL';
    const farm = await this.farmRepo.findOne({ where: { id: farmId } });
    if (!farm) return null;
    if (user.role === UserRole.INSTITUTION) {
      // In scope: the farm codes its profile's matrix grants, never 'ALL'.
      const access = await this.institutionAccessTo(user, farm);
      return access
        ? {
            role: 'INSTITUTION',
            permissions: institutionPermissions(access.matrix),
          }
        : null;
    }
    if (user.role === UserRole.OPERATEUR) return null;
    // A programme farm may have no owner yet (ownerId null).
    if (farm.ownerId !== null && farm.ownerId === user.id) return 'ALL';
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
        role: 'PROPRIETAIRE' | FarmStaffRole | 'INSTITUTION';
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
    if (user.role === UserRole.INSTITUTION) {
      const access = farm ? await this.institutionAccessTo(user, farm) : null;
      if (!access) return null;
      return {
        farmId,
        role: 'INSTITUTION',
        jobTitle: access.profileLabel,
        buildingAssignment: null,
        active: true,
        permissions: [...institutionPermissions(access.matrix)],
      };
    }
    if (farm?.ownerId != null && farm.ownerId === user.id) {
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

  /** Liste toutes les fermes (plateforme) avec un aperçu du propriétaire
   *  (null pour une ferme du programme encore sans compte). */
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
        'farm.programId',
        'farm.code',
        'farm.statusCode',
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
    input: FarmDetailsInput,
  ): Promise<Farm> {
    const farm = await this.assertAccessible(user, farmId);
    if (input.name !== undefined) {
      // Renaming here would bypass the registry's duplicate detection.
      throw new BadRequestException(FARM_NAME_IN_REGISTRY);
    }
    // Same for the GPS point (history + province check) and the building /
    // capacity fields (registry capacity and infrastructures).
    if (input.latitude !== undefined || input.longitude !== undefined) {
      throw new BadRequestException(FARM_GPS_IN_REGISTRY);
    }
    if (
      input.buildingCount !== undefined ||
      input.capacityPerBuilding !== undefined ||
      input.buildingAreaM2 !== undefined
    ) {
      throw new BadRequestException(FARM_CAPACITY_IN_REGISTRY);
    }
    if (input.administrativeCity != null)
      farm.administrativeCity = input.administrativeCity;
    if (input.defaultSacKg != null) farm.defaultSacKg = input.defaultSacKg;
    if (input.isVerified != null) farm.isVerified = input.isVerified;
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
    // The declared type comes from the client: check the file really is one.
    if (!hasImageSignature(file.buffer, extension)) {
      throw new BadRequestException(
        'Le fichier n’est pas une image PNG, JPEG ou WEBP valide.',
      );
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

  /** Retire le logo personnalisé (retour au logo Fermia par défaut). */
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

  /**
   * Anti-escalation for team management by a non-owner ADMIN: cannot edit
   * their own link, cannot grant a permission they do not hold, and HR fields
   * need `rh:gerer`. Owner / platform admin ('ALL') are unrestricted.
   */
  private async assertCanDelegate(
    auth: AuthUser,
    farmId: string,
    granted: readonly string[],
    opts: {
      targetUserId?: string;
      touchesHr?: boolean;
      /** Current rights of the member being edited. */
      targetPermissions?: readonly string[];
    },
  ): Promise<void> {
    const eff = await this.resolveEffectivePermissions(auth, farmId);
    if (eff === 'ALL') return;
    if (eff == null) {
      throw new ForbiddenException('Accès refusé à cette ferme.');
    }
    if (opts.targetUserId === auth.id) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier votre propre rôle ou vos propres droits.',
      );
    }
    // Only the owner may edit (suspend, demote, strip) a member holding a
    // right the caller lacks.
    // Dormant (« Évolution ») codes grant nothing: they neither protect a
    // member nor need to be held to be kept on a link.
    const stronger = (opts.targetPermissions ?? []).filter(
      (c) => isPermissionCode(c) && !eff.permissions.has(c),
    );
    if (stronger.length > 0) {
      throw new ForbiddenException(
        `Vous ne pouvez pas modifier un membre qui a des droits que vous n’avez pas : ${stronger.join(', ')}.`,
      );
    }
    const missing = granted.filter(
      (c) => isPermissionCode(c) && !eff.permissions.has(c),
    );
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Vous ne pouvez pas accorder des droits que vous n’avez pas : ${missing.join(', ')}.`,
      );
    }
    if (opts.touchesHr && !eff.permissions.has('rh:gerer')) {
      throw new ForbiddenException(
        'Le dossier RH (contrat, salaire…) requiert la permission « rh:gerer ».',
      );
    }
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
          'Les permissions ne se règlent que pour un Administrateur Fermia (rôle Éleveur = droits fixes).',
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
    await this.assertCanDelegate(
      owner,
      farmId,
      permissions ?? profile?.permissions ?? defaultPermissionsFor(role),
      {
        touchesHr:
          dto.contractType != null ||
          dto.salaryFcfa != null ||
          dto.hireDate != null ||
          dto.endDate != null,
      },
    );
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
        'Seul un compte de la ferme peut être rattaché (Administrateur Fermia ou Éleveur Fermia).',
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
    const storedPermissions = link.permissions ?? [];
    const touchesHr =
      dto.department !== undefined ||
      dto.contractType !== undefined ||
      dto.hireDate !== undefined ||
      dto.endDate !== undefined ||
      dto.salaryFcfa !== undefined ||
      dto.notes !== undefined;
    // Self-edit and HR checks up front; granted permissions re-checked below.
    await this.assertCanDelegate(auth, farmId, [], {
      targetUserId: link.userId,
      touchesHr,
      // Éleveur links have the fixed base rights: any team manager may edit
      // them. An Administrateur may only be edited by someone holding all
      // of their rights.
      targetPermissions:
        this.staffRole(link.role) === FarmStaffRole.ADMIN
          ? (link.permissions ?? [])
          : [],
    });

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
          'Les permissions ne se règlent que pour un Administrateur Fermia (rôle Éleveur = droits fixes).',
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
    const replaced =
      profile !== undefined ||
      dto.role !== undefined ||
      dto.permissions !== undefined;
    if (replaced && link.role === FarmStaffRole.ADMIN) {
      // A replaced list keeps the dormant codes the link held.
      link.permissions = withDormantPermissions(
        link.permissions ?? [],
        storedPermissions,
      );
    }
    // Whatever path set them (profile, role switch, explicit list), the caller
    // must hold every permission the member ends up with.
    if (replaced) {
      await this.assertCanDelegate(auth, farmId, link.permissions ?? [], {});
    }

    // Normalise les anciens rattachements sans rôle (colonne ajoutée plus tard).
    if (link.role === null || link.role === undefined) {
      link.role = FarmStaffRole.ELEVEUR;
      if (!link.permissions || link.permissions.length === 0) {
        link.permissions = defaultPermissionsFor(FarmStaffRole.ELEVEUR);
      }
    }

    const saved = await this.employeeRepo.save(link);
    const shown = { ...saved, permissions: servedPermissions(saved.permissions) };
    return (await this.canReadHr(auth, farmId)) ? shown : withoutHr(shown);
  }

  /** Salary and contract data need rh:lire (owner and platform admin: always). */
  private async canReadHr(auth: AuthUser, farmId: string): Promise<boolean> {
    const eff = await this.resolveEffectivePermissions(auth, farmId);
    if (eff === 'ALL') return true;
    return (
      eff != null &&
      (eff.permissions.has('rh:lire') || eff.permissions.has('rh:gerer'))
    );
  }

  async listEmployees(
    auth: AuthUser,
    farmId: string,
  ): Promise<Array<Omit<FarmEmployee, 'user'> & { user: PublicUser }>> {
    const hr = await this.canReadHr(auth, farmId);
    const employments = await this.employeeRepo.find({
      where: { farmId },
      relations: { user: true },
      order: { role: 'ASC', createdAt: 'DESC' },
    });
    return employments.map((e) => {
      const { user, ...rest } = e;
      return {
        ...(hr ? rest : withoutHr(rest)),
        role: this.staffRole(rest.role),
        permissions:
          this.staffRole(rest.role) === FarmStaffRole.ADMIN
            ? servedPermissions(e.permissions)
            : [...ELEVEUR_DEFAULT_PERMISSIONS],
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
