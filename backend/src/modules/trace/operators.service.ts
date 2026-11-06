import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { isUuid } from '../../common/context/request-context.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AccessScopeKind } from '../../common/enums/access-scope-kind.enum.js';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { normalizePhone } from '../../common/utils/phone.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import { Localite } from '../programme/entities/localite.entity.js';
import { Province } from '../programme/entities/province.entity.js';
import { RefItem } from '../programme/entities/ref-item.entity.js';
import { IdCounterService } from '../programme/id-counter.service.js';
import { ProgrammeService } from '../programme/programme.service.js';
import type {
  CreateOperatorDto,
  ListOperatorsQueryDto,
  UpdateOperatorDto,
} from './dto/operator.dto.js';
import { Operator } from './entities/operator.entity.js';
import { operatorCode, operatorCounterScope } from './trace-codes.js';

export interface OperatorView {
  id: string;
  code: string;
  typeCode: string;
  typeLabel: string | null;
  typeFamily: string | null;
  name: string;
  localite: {
    id: string;
    code: string;
    name: string;
    provinceCode: string;
    provinceName: string;
  } | null;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  conventionRef: string | null;
  conventionSignedAt: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Same name once accents, case, punctuation and spaces are ignored. */
export function operatorNameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const blankToNull = (v: string | null | undefined) =>
  v == null ? null : v.trim() || null;

/**
 * Registry of the programme's operators (CDC « Registre des opérateurs »):
 * slaughterhouses, buyers, distributors… that lots are ceded to. One registry
 * per programme, managed nationally (platform admin, or an institutional
 * profile with an ALL scope and ADMINISTRATION). Read by every programme
 * account and by the farms (active ones), which pick the operator of a
 * cession. Deactivated, never deleted.
 */
@Injectable()
export class OperatorsService {
  constructor(
    private readonly programme: ProgrammeService,
    private readonly idCounter: IdCounterService,
    private readonly scope: ScopeResolver,
    @InjectRepository(Operator)
    private readonly operators: Repository<Operator>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async list(
    user: AuthUser,
    query: ListOperatorsQueryDto,
  ): Promise<OperatorView[]> {
    const includeInactive = query.all === 'true';
    if (includeInactive) await this.assertMayReadInactive(user);
    const program = await this.programme.current();
    const qb = this.operators
      .createQueryBuilder('o')
      .where('o.program_id = :programId', { programId: program.id })
      .orderBy('o.name', 'ASC')
      .addOrderBy('o.code', 'ASC');
    if (!includeInactive) qb.andWhere('o.active = true');
    if (query.type) qb.andWhere('o.type_code = :type', { type: query.type });
    if (query.q?.trim()) {
      qb.andWhere('(o.name ILIKE :q OR o.code ILIKE :q)', {
        q: `%${query.q.trim().replace(/[%_\\]/g, '\\$&')}%`,
      });
    }
    return this.views(await qb.getMany());
  }

  async get(user: AuthUser, id: string): Promise<OperatorView> {
    const operator = await this.find(id);
    if (!operator.active) await this.assertMayReadInactive(user);
    return (await this.views([operator]))[0];
  }

  async create(user: AuthUser, dto: CreateOperatorDto): Promise<OperatorView> {
    await this.assertNational(user);
    const program = await this.programme.current();
    const saved = await this.dataSource.transaction(async (em) => {
      await this.lockRegistry(em, program.id);
      await this.assertType(em, program.id, dto.typeCode);
      if (dto.localiteId) {
        await this.assertLocalite(em, program.id, dto.localiteId);
      }
      await this.assertUniqueName(em, program.id, dto.name);
      const rank = await this.idCounter.next(
        operatorCounterScope(program.code),
        em,
      );
      const repo = em.getRepository(Operator);
      return repo.save(
        repo.create({
          programId: program.id,
          code: operatorCode(rank),
          typeCode: dto.typeCode,
          name: dto.name.trim(),
          localiteId: dto.localiteId ?? null,
          address: blankToNull(dto.address),
          contactName: blankToNull(dto.contactName),
          contactPhone: dto.contactPhone
            ? normalizePhone(dto.contactPhone)
            : null,
          contactEmail: blankToNull(dto.contactEmail),
          conventionRef: blankToNull(dto.conventionRef),
          conventionSignedAt: dto.conventionSignedAt?.slice(0, 10) ?? null,
          active: true,
        }),
      );
    });
    return (await this.views([saved]))[0];
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateOperatorDto,
  ): Promise<OperatorView> {
    await this.assertNational(user);
    const program = await this.programme.current();
    const saved = await this.dataSource.transaction(async (em) => {
      await this.lockRegistry(em, program.id);
      const repo = em.getRepository(Operator);
      const operator = isUuid(id)
        ? await repo.findOne({ where: { id, programId: program.id } })
        : null;
      if (!operator) throw new NotFoundException('Opérateur introuvable.');
      if (dto.typeCode !== undefined && dto.typeCode !== operator.typeCode) {
        await this.assertType(em, program.id, dto.typeCode);
        operator.typeCode = dto.typeCode;
      }
      if (dto.name !== undefined && dto.name.trim() !== operator.name) {
        await this.assertUniqueName(em, program.id, dto.name, operator.id);
        operator.name = dto.name.trim();
      }
      if (dto.localiteId !== undefined) {
        if (dto.localiteId) {
          await this.assertLocalite(em, program.id, dto.localiteId);
        }
        operator.localiteId = dto.localiteId ?? null;
      }
      if (dto.address !== undefined) operator.address = blankToNull(dto.address);
      if (dto.contactName !== undefined) {
        operator.contactName = blankToNull(dto.contactName);
      }
      if (dto.contactPhone !== undefined) {
        operator.contactPhone = dto.contactPhone
          ? normalizePhone(dto.contactPhone)
          : null;
      }
      if (dto.contactEmail !== undefined) {
        operator.contactEmail = blankToNull(dto.contactEmail);
      }
      if (dto.conventionRef !== undefined) {
        operator.conventionRef = blankToNull(dto.conventionRef);
      }
      if (dto.conventionSignedAt !== undefined) {
        operator.conventionSignedAt =
          dto.conventionSignedAt?.slice(0, 10) ?? null;
      }
      if (dto.active !== undefined) operator.active = dto.active;
      return repo.save(operator);
    });
    return (await this.views([saved]))[0];
  }

  /** Display of operators (lot views, history). */
  async views(rows: Operator[]): Promise<OperatorView[]> {
    if (rows.length === 0) return [];
    const localiteIds = [
      ...new Set(rows.map((r) => r.localiteId).filter((v) => v != null)),
    ];
    const programIds = [...new Set(rows.map((r) => r.programId))];
    const [types, localites] = await Promise.all([
      this.dataSource.getRepository(RefItem).find({
        where: {
          programId: In(programIds),
          listType: ProgramListType.TYPE_OPERATEUR,
        },
      }),
      localiteIds.length
        ? this.dataSource
            .getRepository(Localite)
            .find({ where: { id: In(localiteIds) }, relations: { province: true } })
        : Promise.resolve([] as Localite[]),
    ]);
    const typeOf = new Map(types.map((t) => [`${t.programId}:${t.code}`, t]));
    const localiteOf = new Map(localites.map((l) => [l.id, l]));
    return rows.map((o) => {
      const type = typeOf.get(`${o.programId}:${o.typeCode}`);
      const loc = o.localiteId ? localiteOf.get(o.localiteId) : undefined;
      return {
        id: o.id,
        code: o.code,
        typeCode: o.typeCode,
        typeLabel: type?.label ?? null,
        typeFamily: type?.family ?? null,
        name: o.name,
        localite: loc
          ? {
              id: loc.id,
              code: loc.code,
              name: loc.name,
              provinceCode: loc.province.code,
              provinceName: loc.province.name,
            }
          : null,
        address: o.address,
        contactName: o.contactName,
        contactPhone: o.contactPhone,
        contactEmail: o.contactEmail,
        conventionRef: o.conventionRef,
        conventionSignedAt: o.conventionSignedAt,
        active: o.active,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      };
    });
  }

  private async find(id: string): Promise<Operator> {
    const program = await this.programme.current();
    const operator = isUuid(id)
      ? await this.operators.findOne({ where: { id, programId: program.id } })
      : null;
    if (!operator) throw new NotFoundException('Opérateur introuvable.');
    return operator;
  }

  /** Inactive operators: the administration and traceability side only. */
  private async assertMayReadInactive(user: AuthUser): Promise<void> {
    if (user.role === UserRole.PLATFORM_ADMIN) return;
    if (user.role === UserRole.INSTITUTION) {
      const access = await this.scope.requireAccess(user);
      if (access.matrix.ADMINISTRATION?.length || access.matrix.TRACABILITE?.length) {
        return;
      }
    }
    throw new ForbiddenException(
      'Les opérateurs désactivés sont réservés à l’administration du programme.',
    );
  }

  /**
   * The registry is common to the programme: managed nationally. The route
   * guard already checked ADMINISTRATION; a provincial or farm-scoped
   * administrator does not manage it.
   */
  private async assertNational(user: AuthUser): Promise<void> {
    if (user.role === UserRole.PLATFORM_ADMIN) return;
    if (user.role === UserRole.INSTITUTION) {
      const access = await this.scope.requireAccess(user);
      if (access.scopeKind === AccessScopeKind.ALL) return;
    }
    throw new ForbiddenException(
      'Accès refusé : le registre des opérateurs est géré au niveau national.',
    );
  }

  private async lockRegistry(em: EntityManager, programId: string) {
    await em.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `operators:${programId}`,
    ]);
  }

  private async assertType(
    em: EntityManager,
    programId: string,
    typeCode: string,
  ): Promise<void> {
    const item = await em.getRepository(RefItem).findOne({
      where: { programId, listType: ProgramListType.TYPE_OPERATEUR, code: typeCode },
    });
    if (!item || !item.active) {
      throw new BadRequestException(
        `Type d'opérateur inconnu ou inactif : ${typeCode} (liste TYPE_OPERATEUR).`,
      );
    }
  }

  private async assertLocalite(
    em: EntityManager,
    programId: string,
    localiteId: string,
  ): Promise<void> {
    const loc = await em
      .getRepository(Localite)
      .createQueryBuilder('l')
      .innerJoin(Province, 'p', 'p.id = l.province_id')
      .where('l.id = :id AND p.program_id = :programId', {
        id: localiteId,
        programId,
      })
      .getOne();
    if (!loc) throw new BadRequestException('Localité inconnue.');
  }

  private async assertUniqueName(
    em: EntityManager,
    programId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const key = operatorNameKey(name);
    if (!key) {
      throw new BadRequestException("Le nom de l'opérateur est obligatoire.");
    }
    const others = await em.getRepository(Operator).find({
      where: { programId },
      select: { id: true, code: true, name: true },
    });
    const same = others.find(
      (o) => o.id !== exceptId && operatorNameKey(o.name) === key,
    );
    if (same) {
      throw new ConflictException(
        `Un opérateur porte déjà ce nom : ${same.code} (${same.name}).`,
      );
    }
  }
}
