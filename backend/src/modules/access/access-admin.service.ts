import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, EntityManager, In } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AccessScopeKind } from '../../common/enums/access-scope-kind.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { isUniqueViolation } from '../../common/utils/idempotency.js';
import { generateLoginCode } from '../../common/utils/login-code.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { Province } from '../programme/entities/province.entity.js';
import { ProgrammeService } from '../programme/programme.service.js';
import { User } from '../users/entities/user.entity.js';
import {
  ACCESS_ACTIONS,
  ACTION_LABELS,
  DOMAIN_LABELS,
  PROGRAMME_DOMAINS,
} from './access-domains.js';
import {
  SCOPE_KIND_LABELS,
  matrixExcessRefusal,
  scopeExcess,
  scopeKindRefusal,
  validateMatrix,
  type InstitutionAccess,
} from './access-rules.js';
import {
  CreateAccessProfileDto,
  CreateMembershipDto,
  UpdateAccessProfileDto,
  UpdateMembershipDto,
} from './dto/access.dto.js';
import { AccessProfile } from './entities/access-profile.entity.js';
import { ProgramMembership } from './entities/program-membership.entity.js';
import { ScopeResolver } from './scope-resolver.service.js';

/** Refusal when an institutional admin edits an account or profile beyond its own. */
const PHONE_TAKEN_MESSAGE =
  'Ce numéro de téléphone est déjà celui d’un autre compte : renseignez un autre numéro.';
const BUYER_PHONE_TAKEN_MESSAGE =
  'Ce numéro appartient à un compte acheteur du Market : il ne peut pas devenir celui d’un compte institutionnel. Renseignez un autre numéro.';
const EMAIL_TAKEN_MESSAGE =
  'Cette adresse e-mail est déjà celle d’un autre compte.';

const BEYOND_OWN_ACCESS_MESSAGE =
  "Accès refusé : ce compte ou ce profil a des droits ou un périmètre plus larges que les vôtres ; seul un administrateur qui les détient (ou l'administrateur de la plateforme) peut le modifier.";

/**
 * Administration of the institutional access (programme admin and platform
 * admin): access profiles and memberships. Every change goes through a
 * transaction, so the row journal ties it to the request.
 */
@Injectable()
export class AccessAdminService {
  constructor(
    private readonly programme: ProgrammeService,
    private readonly scope: ScopeResolver,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Domains, actions and scope kinds, for the administration screens. */
  catalog() {
    return {
      domains: PROGRAMME_DOMAINS.map((code) => ({
        code,
        label: DOMAIN_LABELS[code],
      })),
      actions: ACCESS_ACTIONS.map((code) => ({
        code,
        label: ACTION_LABELS[code],
      })),
      scopeKinds: Object.values(AccessScopeKind).map((code) => ({
        code,
        label: SCOPE_KIND_LABELS[code],
      })),
    };
  }

  /** The caller's own access (institutional account): profile, matrix, scope. */
  async me(actor: AuthUser) {
    const access = await this.scope.requireAccess(actor);
    const provinces = await this.provinceCodes(access.programId);
    const m = await this.dataSource
      .getRepository(ProgramMembership)
      .findOneByOrFail({ id: access.membershipId });
    return {
      profile: {
        id: access.profileId,
        code: access.profileCode,
        label: access.profileLabel,
        scopeKind: access.scopeKind,
        matrix: access.matrix,
      },
      provinceCodes: access.provinceIds
        .map((id) => provinces.get(id))
        .filter((c): c is string => !!c),
      farmIds: access.farmIds,
      validUntil: m.validUntil,
    };
  }

  // ----- Profiles -----

  async listProfiles(): Promise<AccessProfile[]> {
    const program = await this.programme.current();
    return this.dataSource.getRepository(AccessProfile).find({
      where: { programId: program.id },
      order: { system: 'DESC', code: 'ASC' },
    });
  }

  async createProfile(
    actor: AuthUser,
    dto: CreateAccessProfileDto,
  ): Promise<AccessProfile> {
    const program = await this.programme.current();
    this.assertScopeKindOpen(dto.scopeKind);
    const matrix = this.checkedMatrix(dto.matrix, dto.scopeKind);
    // An institutional admin never creates a profile broader than itself.
    this.assertMayGrantProfile(await this.granterOf(actor), {
      scopeKind: dto.scopeKind,
      matrix,
      label: dto.label,
    });
    const repo = this.dataSource.getRepository(AccessProfile);
    try {
      return await this.dataSource.transaction((em) =>
        em.getRepository(AccessProfile).save(
          repo.create({
            programId: program.id,
            code: dto.code,
            label: dto.label,
            scopeKind: dto.scopeKind,
            matrix,
            system: false,
          }),
        ),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `Un profil existe déjà avec le code « ${dto.code} ».`,
        );
      }
      throw err;
    }
  }

  async updateProfile(
    actor: AuthUser,
    id: string,
    dto: UpdateAccessProfileDto,
  ): Promise<AccessProfile> {
    await this.assertNotOwnProfile(actor, id);
    const granter = await this.granterOf(actor);
    return this.dataSource.transaction(async (em) => {
      const profile = await this.lockedProfile(em, id);
      this.assertWithinOwnProfile(granter, profile);
      const scopeKind = dto.scopeKind ?? profile.scopeKind;
      if (scopeKind !== profile.scopeKind) {
        if (profile.system) {
          throw new BadRequestException(
            "Le périmètre d'un profil système ne change pas.",
          );
        }
        this.assertScopeKindOpen(scopeKind);
        const used = await em
          .getRepository(ProgramMembership)
          .exists({ where: { profileId: id } });
        if (used) {
          throw new ConflictException(
            'Ce profil a des comptes rattachés : son périmètre ne peut plus changer.',
          );
        }
      }
      const matrix = this.checkedMatrix(
        dto.matrix ?? profile.matrix,
        scopeKind,
      );
      this.assertMayGrantProfile(granter, {
        scopeKind,
        matrix,
        label: dto.label ?? profile.label,
      });
      return em.getRepository(AccessProfile).save({
        ...profile,
        label: dto.label ?? profile.label,
        scopeKind,
        matrix,
      });
    });
  }

  async deleteProfile(actor: AuthUser, id: string): Promise<{ deleted: true }> {
    await this.assertNotOwnProfile(actor, id);
    const granter = await this.granterOf(actor);
    await this.dataSource.transaction(async (em) => {
      const profile = await this.lockedProfile(em, id);
      this.assertWithinOwnProfile(granter, profile);
      if (profile.system) {
        throw new BadRequestException(
          'Un profil système ne peut pas être supprimé.',
        );
      }
      const used = await em
        .getRepository(ProgramMembership)
        .exists({ where: { profileId: id } });
      if (used) {
        throw new ConflictException(
          'Ce profil a des comptes rattachés : changez-les de profil avant de le supprimer.',
        );
      }
      await em.getRepository(AccessProfile).remove(profile);
    });
    return { deleted: true };
  }

  // ----- Memberships -----

  async listMemberships() {
    const program = await this.programme.current();
    const rows = await this.dataSource
      .getRepository(ProgramMembership)
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.profile', 'p')
      .innerJoinAndSelect('m.user', 'u')
      .where('p.program_id = :programId', { programId: program.id })
      .orderBy('u.full_name', 'ASC')
      .getMany();
    const provinces = await this.provinceCodes(program.id);
    return rows.map((m) => this.membershipView(m, provinces));
  }

  /**
   * Creates an institutional account and its membership. The login code is
   * returned once; the account then signs in with it plus an SMS code.
   */
  async createMembership(actor: AuthUser, dto: CreateMembershipDto) {
    const program = await this.programme.current();
    const granter = await this.granterOf(actor);
    const code = generateLoginCode();
    const passwordHash = await bcrypt.hash(code, 10);
    try {
      const membershipId = await this.dataSource.transaction(async (em) => {
        const profile = await this.profileByCode(
          em,
          program.id,
          dto.profileCode,
        );
        const scope = await this.resolveScope(em, program.id, profile, dto, {
          provinceIds: [],
          farmIds: [],
        });
        await this.assertMayGrant(em, granter, profile, scope);
        const users = em.getRepository(User);
        const taken = await users.exists({
          where: [
            { phone: dto.phone },
            ...(dto.email ? [{ email: dto.email }] : []),
          ],
        });
        if (taken) {
          throw new ConflictException(
            'Un compte existe déjà avec ce numéro ou cet e-mail.',
          );
        }
        const user = await users.save(
          users.create({
            phone: dto.phone,
            email: dto.email ?? null,
            fullName: dto.fullName,
            passwordHash,
            role: UserRole.INSTITUTION,
          }),
        );
        const saved = await em.getRepository(ProgramMembership).save(
          em.getRepository(ProgramMembership).create({
            userId: user.id,
            profileId: profile.id,
            ...scope,
            operatorId: null,
            active: true,
            createdById: actor.id,
          }),
        );
        return saved.id;
      });
      return { ...(await this.membershipById(membershipId)), loginCode: code };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'Un compte existe déjà avec ce numéro ou cet e-mail.',
        );
      }
      throw err;
    }
  }

  /**
   * Change of profile or scope, suspension (`active: false`), validity, and
   * the account's name, phone (its login) and e-mail.
   */
  async updateMembership(
    actor: AuthUser,
    id: string,
    dto: UpdateMembershipDto,
  ) {
    const program = await this.programme.current();
    const granter = await this.granterOf(actor);
    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(ProgramMembership);
      const m = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!m) throw new NotFoundException('Rattachement introuvable.');
      if (m.userId === actor.id) {
        throw new ForbiddenException(
          'Vous ne pouvez pas modifier votre propre rattachement.',
        );
      }
      const current = await em.getRepository(AccessProfile).findOneByOrFail({
        id: m.profileId,
      });
      if (current.programId !== program.id) {
        throw new NotFoundException('Rattachement introuvable.');
      }
      // The account as it is must be within the caller's own access...
      await this.assertWithinOwnAccess(em, granter, current, m);
      const profile = dto.profileCode
        ? await this.profileByCode(em, program.id, dto.profileCode)
        : current;
      const scope = await this.resolveScope(em, program.id, profile, dto, m);
      // ...and so must the access it is given.
      await this.assertMayGrant(em, granter, profile, scope);
      await repo.save({
        ...m,
        profileId: profile.id,
        ...scope,
        active: dto.active ?? m.active,
      });
      await this.updateAccount(em, m.userId, dto);
    }).catch((err: unknown) => {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'Ce numéro ou cette adresse e-mail est déjà celui d’un autre compte.',
        );
      }
      throw err;
    });
    return this.membershipById(id);
  }

  /**
   * Name, phone and e-mail of an institutional account. The phone is the
   * login: another account's (a Market buyer's included) is refused, as is
   * another account's e-mail.
   * @throws ConflictException
   */
  private async updateAccount(
    em: EntityManager,
    userId: string,
    dto: Pick<UpdateMembershipDto, 'fullName' | 'phone' | 'email'>,
  ): Promise<void> {
    if (
      dto.fullName === undefined &&
      dto.phone === undefined &&
      dto.email === undefined
    ) {
      return;
    }
    const users = em.getRepository(User);
    const user = await users.findOneOrFail({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    const patch: Partial<User> = {};
    if (dto.fullName !== undefined && dto.fullName !== user.fullName) {
      patch.fullName = dto.fullName;
    }
    if (dto.phone !== undefined && dto.phone !== user.phone) {
      const holder = await users.findOne({ where: { phone: dto.phone } });
      if (holder && holder.id !== user.id) {
        if (holder.role === UserRole.ACHETEUR) {
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message: BUYER_PHONE_TAKEN_MESSAGE,
            buyerAccount: true,
          });
        }
        throw new ConflictException(PHONE_TAKEN_MESSAGE);
      }
      patch.phone = dto.phone;
    }
    if (dto.email !== undefined && dto.email !== user.email) {
      if (dto.email !== null) {
        const holder = await users.findOne({ where: { email: dto.email } });
        if (holder && holder.id !== user.id) {
          throw new ConflictException(EMAIL_TAKEN_MESSAGE);
        }
      }
      patch.email = dto.email;
    }
    if (Object.keys(patch).length > 0) {
      await users.save({ ...user, ...patch });
    }
  }

  // ----- Helpers -----

  private checkedMatrix(raw: unknown, scopeKind: AccessScopeKind) {
    const checked = validateMatrix(raw, scopeKind);
    if (!checked.ok) throw new BadRequestException(checked.error);
    return checked.matrix;
  }

  private assertScopeKindOpen(kind: AccessScopeKind): void {
    if (kind === AccessScopeKind.OPERATOR) {
      throw new BadRequestException(
        'Le périmètre « opérateur » sera ouvert avec le module de traçabilité.',
      );
    }
  }

  /** No self-escalation: an institutional admin cannot edit his own profile. */
  private async assertNotOwnProfile(actor: AuthUser, profileId: string) {
    if (actor.role !== UserRole.INSTITUTION) return;
    const access: InstitutionAccess | null = await this.scope.accessOf(
      actor.id,
    );
    if (access?.profileId === profileId) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier votre propre profil d’accès.',
      );
    }
  }

  /**
   * The caller's own access when it is an institutional administrator; null
   * for the platform admin, who is not limited.
   */
  private async granterOf(actor: AuthUser): Promise<InstitutionAccess | null> {
    if (actor.role !== UserRole.INSTITUTION) return null;
    return this.scope.requireAccess(actor);
  }

  /**
   * No escalation through a profile: an institutional admin grants (or
   * creates) only a scope kind within its own (ALL > PROVINCES > FARMS; the
   * other kinds by an ALL scope only) and only rights its own matrix holds.
   * @throws ForbiddenException
   */
  private assertMayGrantProfile(
    granter: InstitutionAccess | null,
    profile: Pick<AccessProfile, 'scopeKind' | 'matrix' | 'label'>,
  ): void {
    if (!granter) return;
    const refusal =
      scopeKindRefusal(granter.scopeKind, profile.scopeKind) ??
      matrixExcessRefusal(granter.matrix, profile.matrix ?? {}, profile.label);
    if (refusal) throw new ForbiddenException(refusal);
  }

  /**
   * {@link assertMayGrantProfile}, plus the membership's provinces and farms
   * within the caller's own scope.
   * @throws ForbiddenException
   */
  private async assertMayGrant(
    em: EntityManager,
    granter: InstitutionAccess | null,
    profile: Pick<AccessProfile, 'scopeKind' | 'matrix' | 'label'>,
    scope: { provinceIds: readonly string[]; farmIds: readonly string[] },
  ): Promise<void> {
    if (!granter) return;
    this.assertMayGrantProfile(granter, profile);
    const farms = scope.farmIds.length
      ? await em.getRepository(Farm).find({
          where: { id: In([...scope.farmIds]) },
          select: { id: true, provinceId: true },
        })
      : [];
    const excess = scopeExcess(granter, {
      scopeKind: profile.scopeKind,
      provinceIds: scope.provinceIds,
      farms,
    });
    if (excess.provinceIds.length > 0) {
      const codes = await this.provinceCodes(granter.programId);
      const list = excess.provinceIds.map((id) => codes.get(id) ?? id);
      throw new ForbiddenException(
        `Accès refusé : province hors de votre périmètre (${list.join(', ')}).`,
      );
    }
    if (excess.farmIds.length > 0) {
      throw new ForbiddenException(
        excess.farmIds.length === 1
          ? 'Accès refusé : une ferme demandée est hors de votre périmètre.'
          : `Accès refusé : ${excess.farmIds.length} fermes demandées sont hors de votre périmètre.`,
      );
    }
  }

  /** An institutional admin edits only a profile it could grant. */
  private assertWithinOwnProfile(
    granter: InstitutionAccess | null,
    profile: AccessProfile,
  ): void {
    if (!granter) return;
    try {
      this.assertMayGrantProfile(granter, profile);
    } catch (err) {
      if (err instanceof ForbiddenException) {
        throw new ForbiddenException(BEYOND_OWN_ACCESS_MESSAGE);
      }
      throw err;
    }
  }

  /**
   * An institutional admin manages only an account it could have granted
   * (profile and scope within its own): no suspending, rescoping or resetting
   * the code of a broader account.
   * @throws ForbiddenException
   */
  private async assertWithinOwnAccess(
    em: EntityManager,
    granter: InstitutionAccess | null,
    profile: AccessProfile,
    m: Pick<ProgramMembership, 'provinceIds' | 'farmIds'>,
  ): Promise<void> {
    if (!granter) return;
    try {
      await this.assertMayGrant(em, granter, profile, {
        provinceIds: m.provinceIds ?? [],
        farmIds: m.farmIds ?? [],
      });
    } catch (err) {
      if (err instanceof ForbiddenException) {
        throw new ForbiddenException(BEYOND_OWN_ACCESS_MESSAGE);
      }
      throw err;
    }
  }

  private async lockedProfile(
    em: EntityManager,
    id: string,
  ): Promise<AccessProfile> {
    const program = await this.programme.current();
    const profile = await em.getRepository(AccessProfile).findOne({
      where: { id, programId: program.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!profile) throw new NotFoundException("Profil d'accès introuvable.");
    return profile;
  }

  private async profileByCode(
    em: EntityManager,
    programId: string,
    code: string,
  ): Promise<AccessProfile> {
    const profile = await em
      .getRepository(AccessProfile)
      .findOne({ where: { programId, code } });
    if (!profile) {
      throw new BadRequestException(`Profil d'accès inconnu : « ${code} ».`);
    }
    return profile;
  }

  /**
   * Scope lists of a membership for its profile's scope kind: provinces for
   * PROVINCES, programme farms for FARMS, nothing for the others. A list not
   * sent keeps its current value.
   */
  private async resolveScope(
    em: EntityManager,
    programId: string,
    profile: AccessProfile,
    dto: {
      provinceCodes?: string[];
      farmIds?: string[];
      validUntil?: string | null;
    },
    current: {
      provinceIds: string[];
      farmIds: string[];
      validUntil?: Date | null;
    },
  ): Promise<{
    provinceIds: string[];
    farmIds: string[];
    validUntil: Date | null;
  }> {
    this.assertScopeKindOpen(profile.scopeKind);
    let validUntil = current.validUntil ?? null;
    if (dto.validUntil !== undefined) {
      validUntil = dto.validUntil === null ? null : new Date(dto.validUntil);
      if (validUntil && validUntil.getTime() <= Date.now()) {
        throw new BadRequestException(
          'La fin de validité du rattachement doit être dans le futur.',
        );
      }
    }
    let provinceIds: string[] = [];
    let farmIds: string[] = [];
    if (profile.scopeKind === AccessScopeKind.PROVINCES) {
      provinceIds = dto.provinceCodes
        ? await this.provinceIdsOf(em, programId, dto.provinceCodes)
        : current.provinceIds;
      if (provinceIds.length === 0) {
        throw new BadRequestException(
          'Un périmètre « provinces » demande au moins une province.',
        );
      }
    } else if (profile.scopeKind === AccessScopeKind.FARMS) {
      farmIds = dto.farmIds
        ? await this.farmIdsOf(em, programId, dto.farmIds)
        : current.farmIds;
      if (farmIds.length === 0) {
        throw new BadRequestException(
          'Un périmètre « fermes » demande au moins une ferme.',
        );
      }
    }
    return { provinceIds, farmIds, validUntil };
  }

  private async provinceIdsOf(
    em: EntityManager,
    programId: string,
    codes: string[],
  ): Promise<string[]> {
    const wanted = [...new Set(codes.map((c) => c.trim().toUpperCase()))];
    if (wanted.length === 0) return [];
    const rows = await em
      .getRepository(Province)
      .find({ where: { programId, code: In(wanted) } });
    const missing = wanted.filter((c) => !rows.some((p) => p.code === c));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Province inconnue : ${missing.join(', ')}.`,
      );
    }
    return rows.map((p) => p.id);
  }

  private async farmIdsOf(
    em: EntityManager,
    programId: string,
    ids: string[],
  ): Promise<string[]> {
    const wanted = [...new Set(ids)];
    if (wanted.length === 0) return [];
    const rows = await em.getRepository(Farm).find({
      where: { id: In(wanted), programId },
      select: { id: true },
    });
    if (rows.length !== wanted.length) {
      throw new BadRequestException(
        'Le périmètre ne peut contenir que des fermes du programme.',
      );
    }
    return wanted;
  }

  private async provinceCodes(programId: string): Promise<Map<string, string>> {
    const rows = await this.dataSource
      .getRepository(Province)
      .find({ where: { programId }, select: { id: true, code: true } });
    return new Map(rows.map((p) => [p.id, p.code]));
  }

  private async membershipById(id: string) {
    const m = await this.dataSource.getRepository(ProgramMembership).findOne({
      where: { id },
      relations: { profile: true, user: true },
    });
    if (!m) throw new NotFoundException('Rattachement introuvable.');
    const provinces = m.profile
      ? await this.provinceCodes(m.profile.programId)
      : new Map<string, string>();
    return this.membershipView(m, provinces);
  }

  private membershipView(m: ProgramMembership, provinces: Map<string, string>) {
    return {
      id: m.id,
      active: m.active,
      validUntil: m.validUntil,
      user: m.user
        ? {
            id: m.user.id,
            fullName: m.user.fullName,
            phone: m.user.phone,
            email: m.user.email ?? null,
            role: m.user.role,
            active: m.user.active,
          }
        : null,
      profile: m.profile
        ? {
            id: m.profile.id,
            code: m.profile.code,
            label: m.profile.label,
            scopeKind: m.profile.scopeKind,
          }
        : null,
      provinceIds: m.provinceIds,
      provinceCodes: m.provinceIds
        .map((id) => provinces.get(id))
        .filter((c): c is string => !!c),
      farmIds: m.farmIds,
      operatorId: m.operatorId,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }
}
