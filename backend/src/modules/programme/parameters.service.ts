import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { mayChangeParameter } from '../access/access-rules.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import { ProgramParameter } from './entities/program-parameter.entity.js';
import {
  checkFormulaSet,
  checkParameterValue,
  PARAMETER_CATALOG,
  parameterDefinition,
  type ParameterDefinition,
} from './parameter-catalog.js';
import { versionInForce, versionsInForce } from './parameter-resolution.js';
import { ProgrammeService } from './programme.service.js';

/** Clock skew tolerated on a `validFrom` sent by a client. */
const PAST_TOLERANCE_MS = 60_000;

export interface ParameterView {
  readonly key: string;
  readonly label: string;
  readonly type: ParameterDefinition['type'];
  readonly unit: string | null;
  readonly ownerProfile: string;
  readonly min: number | null;
  readonly max: number | null;
  /** Null when no version is in force at the date asked. */
  readonly value: unknown;
  readonly validFrom: Date | null;
  readonly reason: string | null;
  readonly createdById: string | null;
  readonly versionId: string | null;
}

/**
 * Every version of one programme's parameters, resolved at any date without a
 * query per reading (indicators evaluate one formula set per day of a band).
 */
export class ParameterResolver {
  private readonly byKey = new Map<string, ProgramParameter[]>();

  constructor(rows: readonly ProgramParameter[]) {
    for (const row of rows) {
      const list = this.byKey.get(row.key);
      if (list) list.push(row);
      else this.byKey.set(row.key, [row]);
    }
  }

  /** Version of `key` in force at `at`, or null (none stored yet). */
  version(key: string, at: Date): ProgramParameter | null {
    return versionInForce(this.byKey.get(key) ?? [], at);
  }

  /** Value in force at `at`, else the catalog « Proposé » default. */
  value<T = unknown>(key: string, at: Date): T {
    const row = this.version(key, at);
    if (row) return row.value as T;
    const def = parameterDefinition(key);
    if (!def) throw new BadRequestException(`Paramètre inconnu : ${key}.`);
    return def.defaultValue as T;
  }
}

/**
 * Versioned programme parameters. Rows are immutable: `set` inserts a new
 * version, and a reading picks the version in force at the date of the fact.
 */
@Injectable()
export class ParametersService {
  constructor(
    private readonly programme: ProgrammeService,
    @InjectRepository(ProgramParameter)
    private readonly params: Repository<ProgramParameter>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly scope: ScopeResolver,
  ) {}

  /** @throws BadRequestException on a key outside the catalog */
  definition(key: string): ParameterDefinition {
    const def = parameterDefinition(key);
    if (!def) throw new BadRequestException(`Paramètre inconnu : ${key}.`);
    return def;
  }

  /** Value of `key` in force at `at` (default now), null before its first version. */
  async get<T = unknown>(
    key: string,
    at: Date = new Date(),
  ): Promise<T | null> {
    this.definition(key);
    const program = await this.programme.current();
    const rows = await this.params.find({
      where: { programId: program.id, key },
    });
    return (versionInForce(rows, at)?.value as T | undefined) ?? null;
  }

  /**
   * Resolver over every version of `programId`'s parameters (a farm's
   * programme). Pass `em` to read inside the caller's transaction.
   */
  async resolver(
    programId: string,
    em?: EntityManager,
  ): Promise<ParameterResolver> {
    const repo = em ? em.getRepository(ProgramParameter) : this.params;
    return new ParameterResolver(await repo.find({ where: { programId } }));
  }

  /** Every catalog parameter with the version in force at `at` (default now). */
  async getAll(at: Date = new Date()): Promise<ParameterView[]> {
    const program = await this.programme.current();
    const rows = await this.params.find({ where: { programId: program.id } });
    const inForce = versionsInForce(rows, at);
    return PARAMETER_CATALOG.map((def) => this.view(def, inForce.get(def.key)));
  }

  /** Every version of `key`, newest effective date first. */
  async history(key: string): Promise<ProgramParameter[]> {
    this.definition(key);
    const program = await this.programme.current();
    return this.params.find({
      where: { programId: program.id, key },
      order: { validFrom: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * Records a new version of `key`, effective at `validFrom` (default now,
   * never in the past). A formula is accepted only if the whole indicator set
   * still compiles with it, at its effective date and at every later
   * scheduled change.
   * @throws BadRequestException (French message) on any invalid input
   */
  async set(
    key: string,
    value: unknown,
    actor: AuthUser | null,
    reason: string,
    validFrom?: Date,
  ): Promise<ProgramParameter> {
    const def = this.definition(key);
    await this.assertOwner(def, actor);
    const checked = checkParameterValue(def, value);
    if (!checked.ok) throw new BadRequestException(checked.error);
    const now = Date.now();
    const from = validFrom ?? new Date(now);
    if (Number.isNaN(from.getTime())) {
      throw new BadRequestException("Date d'effet invalide.");
    }
    if (from.getTime() < now - PAST_TOLERANCE_MS) {
      throw new BadRequestException(
        "La date d'effet ne peut pas être dans le passé.",
      );
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new BadRequestException('Le motif du changement est obligatoire.');
    }
    const program = await this.programme.current();

    return this.dataSource.transaction(async (em) => {
      // One writer per programme at a time: two formula changes validated
      // separately could otherwise form a cycle together.
      await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `program_parameters:${program.id}`,
      ]);
      if (def.type === 'formula') {
        await this.assertFormulaSet(
          em,
          program.id,
          key,
          String(checked.value),
          from,
        );
      }
      return em.getRepository(ProgramParameter).save(
        em.getRepository(ProgramParameter).create({
          programId: program.id,
          key,
          value: checked.value,
          ownerProfile: def.ownerProfile,
          validFrom: from,
          createdById: actor?.id ?? null,
          reason: trimmedReason,
        }),
      );
    });
  }

  /**
   * A parameter is changed by its owner profile only (a VETERINAIRE threshold
   * by the veterinary services); the platform admin may change any. A null
   * actor is the server itself (seed).
   * @throws ForbiddenException
   */
  private async assertOwner(
    def: ParameterDefinition,
    actor: AuthUser | null,
  ): Promise<void> {
    if (!actor) return;
    const profileCode =
      actor.role === UserRole.INSTITUTION
        ? ((await this.scope.accessOf(actor.id))?.profileCode ?? null)
        : null;
    if (!mayChangeParameter(actor.role, profileCode, def.ownerProfile)) {
      throw new ForbiddenException(
        `Accès refusé : le paramètre « ${def.label} » relève du profil « ${def.ownerProfile} ».`,
      );
    }
  }

  private async assertFormulaSet(
    em: EntityManager,
    programId: string,
    key: string,
    expression: string,
    from: Date,
  ): Promise<void> {
    const formulaDefs = PARAMETER_CATALOG.filter((d) => d.type === 'formula');
    const rows = await em.getRepository(ProgramParameter).find({
      where: { programId, key: In(formulaDefs.map((d) => d.key)) },
    });
    const candidate = {
      key,
      value: expression,
      validFrom: from,
      createdAt: new Date(8.64e15), // wins any tie on validFrom
    };
    const versions = [...rows, candidate];
    // The set changes at `from` and at every later scheduled formula version.
    const dates = [
      from,
      ...rows
        .map((r) => r.validFrom)
        .filter((d) => d.getTime() > from.getTime()),
    ];
    for (const at of dates) {
      const inForce = versionsInForce(versions, at);
      const expressions = new Map(
        formulaDefs.map((d) => [
          d.key,
          String(inForce.get(d.key)?.value ?? d.defaultValue),
        ]),
      );
      const error = checkFormulaSet(expressions);
      if (error) {
        throw new BadRequestException(
          at === from
            ? error
            : `À partir du ${at.toISOString().slice(0, 10)} : ${error}`,
        );
      }
    }
  }

  private view(
    def: ParameterDefinition,
    row: ProgramParameter | undefined,
  ): ParameterView {
    return {
      key: def.key,
      label: def.label,
      type: def.type,
      unit: def.unit,
      ownerProfile: def.ownerProfile,
      min: def.min ?? null,
      max: def.max ?? null,
      value: row ? row.value : null,
      validFrom: row?.validFrom ?? null,
      reason: row?.reason ?? null,
      createdById: row?.createdById ?? null,
      versionId: row?.id ?? null,
    };
  }
}
