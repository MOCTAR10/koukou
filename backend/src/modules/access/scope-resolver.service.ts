import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  type ObjectLiteral,
  type SelectQueryBuilder,
} from 'typeorm';
import {
  RequestContext,
  isUuid,
} from '../../common/context/request-context.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { Farm } from '../farms/entities/farm.entity.js';
import {
  NO_MEMBERSHIP_MESSAGE,
  OUT_OF_SCOPE_MESSAGE,
  consults,
  farmScopeSql,
  includesFarm,
  includesProvince,
  isMembershipEffective,
  type InstitutionAccess,
} from './access-rules.js';
import { ProgramMembership } from './entities/program-membership.entity.js';
import type { GrantableDomain } from './access-domains.js';
import { requireProgramCode } from '../programme/program-code.js';

/** Farm columns the scope reads. */
type ScopedFarm = Pick<Farm, 'id' | 'programId' | 'provinceId'>;

/**
 * The single source of an institutional account's scope (POUFA plan §5.3):
 * its effective membership, whether a farm or a province is in scope, and the
 * SQL condition for multi-farm lists. Resolved once per request (cached on
 * the request context).
 */
@Injectable()
export class ScopeResolver {
  private readonly cache = new WeakMap<
    object,
    Map<string, Promise<InstitutionAccess | null>>
  >();

  /** `PROGRAM_CODE` (mandatory: the boot stops without it). */
  private readonly programCode: string;

  constructor(
    config: ConfigService,
    @InjectRepository(ProgramMembership)
    private readonly memberships: Repository<ProgramMembership>,
    @InjectRepository(Farm) private readonly farms: Repository<Farm>,
  ) {
    this.programCode = requireProgramCode(config.get<string>('PROGRAM_CODE'));
  }

  isInstitution(user: Pick<AuthUser, 'role'> | null | undefined): boolean {
    return user?.role === UserRole.INSTITUTION;
  }

  /**
   * Effective access of an account: its membership, active and not expired,
   * on a profile of the configured programme. Null otherwise (no
   * membership, another programme's profile, suspended, expired).
   */
  accessOf(userId: string): Promise<InstitutionAccess | null> {
    const store = RequestContext.current();
    if (!store) return this.load(userId);
    let perRequest = this.cache.get(store);
    if (!perRequest) {
      perRequest = new Map();
      this.cache.set(store, perRequest);
    }
    let pending = perRequest.get(userId);
    if (!pending) {
      pending = this.load(userId);
      perRequest.set(userId, pending);
    }
    return pending;
  }

  /** @throws ForbiddenException without an effective membership */
  async requireAccess(user: Pick<AuthUser, 'id'>): Promise<InstitutionAccess> {
    const access = await this.accessOf(user.id);
    if (!access) throw new ForbiddenException(NO_MEMBERSHIP_MESSAGE);
    return access;
  }

  /**
   * Whether `user` reads the data of `domain` (gating, never masking: CDC
   * §3/§8 « chacun n'accède qu'aux informations qui le concernent »). Farm
   * accounts and the platform admin: always (their farm rights apply);
   * an institutional account: « Consulter » on that domain in its matrix.
   */
  async consults(
    user: Pick<AuthUser, 'id' | 'role'>,
    domain: GrantableDomain,
  ): Promise<boolean> {
    if (!this.isInstitution(user)) return true;
    const access = await this.accessOf(user.id);
    return !!access && consults(access, domain);
  }

  /** Whether `farm` is in the scope of `access`. */
  includes(access: InstitutionAccess, farm: ScopedFarm): boolean {
    return includesFarm(access, farm);
  }

  /**
   * Checks a farm against the scope.
   * @throws ForbiddenException
   */
  assertFarm(access: InstitutionAccess, farm: ScopedFarm): void {
    if (!includesFarm(access, farm)) {
      throw new ForbiddenException(OUT_OF_SCOPE_MESSAGE);
    }
  }

  /**
   * Checks a farm id against the scope. A farm that does not exist is
   * answered like one out of scope (403), so ids cannot be probed.
   * @throws ForbiddenException
   */
  async assertFarmId(access: InstitutionAccess, farmId: string): Promise<void> {
    const farm = isUuid(farmId)
      ? await this.farms.findOne({
          where: { id: farmId },
          select: { id: true, programId: true, provinceId: true },
        })
      : null;
    if (!farm) throw new ForbiddenException(OUT_OF_SCOPE_MESSAGE);
    this.assertFarm(access, farm);
  }

  /**
   * An institutional account may create a farm in, or move one to, a
   * province of its scope only.
   * @throws ForbiddenException
   */
  assertProvince(access: InstitutionAccess, provinceId: string): void {
    if (!includesProvince(access, provinceId)) {
      throw new ForbiddenException(
        'Accès refusé : cette province est hors de votre périmètre.',
      );
    }
  }

  /** Restricts a query on `farms` (alias `alias`) to the scope. */
  applyFarmScope<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    access: InstitutionAccess,
  ): SelectQueryBuilder<T> {
    const { sql, params } = farmScopeSql(access, alias);
    return qb.andWhere(`(${sql})`, params);
  }

  private async load(userId: string): Promise<InstitutionAccess | null> {
    if (!isUuid(userId)) return null;
    const m = await this.memberships.findOne({
      where: { userId },
      relations: { profile: { program: true } },
    });
    const profile = m?.profile;
    if (!m || !profile || profile.program?.code !== this.programCode) {
      return null;
    }
    if (!isMembershipEffective(m)) return null;
    return {
      membershipId: m.id,
      userId: m.userId,
      programId: profile.programId,
      profileId: profile.id,
      profileCode: profile.code,
      profileLabel: profile.label,
      scopeKind: profile.scopeKind,
      matrix: profile.matrix ?? {},
      provinceIds: m.provinceIds ?? [],
      farmIds: m.farmIds ?? [],
      operatorId: m.operatorId,
    };
  }
}
