import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  type ObjectLiteral,
  type SelectQueryBuilder,
} from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AccessScopeKind } from '../../common/enums/access-scope-kind.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import type { InstitutionAccess } from '../access/access-rules.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { ParametersService } from '../programme/parameters.service.js';
import { ProgrammeService } from '../programme/programme.service.js';

/** Who looks at the steering data, and how far it reaches. */
export interface PilotageView {
  programId: string;
  /** PLATEFORME (platform admin), SYSTEME (scheduled report) or the scope kind. */
  kind: 'PLATEFORME' | 'SYSTEME' | AccessScopeKind;
  /**
   * Aggregates only (MAEDR, AGGREGATE scope; reports without farm rows): no
   * farm row ever, and a group fed by fewer than `minGroupSize` farms is
   * hidden.
   */
  aggregateOnly: boolean;
  /** The institutional access behind the view (null: platform, system). */
  access: InstitutionAccess | null;
}

/** Registry filters of a steering query. */
export interface FarmFilters {
  /** Province ids (null = every province in scope). */
  provinceIds: string[] | null;
  /** COHORTE list code. */
  cohort: string | null;
  /** STATUT_FERME list code. */
  status: string | null;
}

export interface RawFilters {
  province?: string;
  cohort?: string;
  status?: string;
}

export const AGGREGATE_ONLY_MESSAGE =
  "Accès refusé : votre profil ne donne accès qu'aux données agrégées, sans ligne par ferme.";

/**
 * Scope of the steering queries. Every multi-farm read goes through
 * {@link scopedFarms}: the platform admin and the scheduled reports read the
 * whole programme; an institutional account reads what `ScopeResolver`
 * gives it (ALL, PROVINCES, FARMS through `applyFarmScope`), and an
 * AGGREGATE scope (MAEDR) the whole programme in aggregates only. Farm
 * owners never reach these routes (they only get the anonymous comparison of
 * their own band).
 */
@Injectable()
export class PilotageScopeService {
  constructor(
    private readonly scope: ScopeResolver,
    private readonly programme: ProgrammeService,
    private readonly parameters: ParametersService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async viewOf(user: AuthUser): Promise<PilotageView> {
    if (user.role === UserRole.PLATFORM_ADMIN) {
      const program = await this.programme.current();
      return {
        programId: program.id,
        kind: 'PLATEFORME',
        aggregateOnly: false,
        access: null,
      };
    }
    if (user.role !== UserRole.INSTITUTION) {
      throw new ForbiddenException(
        'Accès refusé : le pilotage du programme est réservé aux comptes institutionnels.',
      );
    }
    const access = await this.scope.requireAccess(user);
    return {
      programId: access.programId,
      kind: access.scopeKind,
      aggregateOnly: access.scopeKind === AccessScopeKind.AGGREGATE,
      access,
    };
  }

  /** View of a scheduled report: the whole programme, as `aggregateOnly` says. */
  async systemView(aggregateOnly: boolean): Promise<PilotageView> {
    const program = await this.programme.current();
    return {
      programId: program.id,
      kind: 'SYSTEME',
      aggregateOnly,
      access: null,
    };
  }

  /** @throws ForbiddenException for an aggregate-only view */
  assertFarmRows(view: PilotageView): void {
    if (view.aggregateOnly)
      throw new ForbiddenException(AGGREGATE_ONLY_MESSAGE);
  }

  /** Minimal group size of an aggregate (`PILOTAGE_GROUPE_MIN_FERMES`). */
  async minGroupSize(
    programId: string,
    at: Date = new Date(),
  ): Promise<number> {
    const resolver = await this.parameters.resolver(programId);
    return Number(resolver.value<number>('PILOTAGE_GROUPE_MIN_FERMES', at));
  }

  /**
   * Parses the registry filters (`province` = comma-separated province codes).
   * A PROVINCES scope may only ask for its own provinces.
   * @throws BadRequestException on an unknown province
   * @throws ForbiddenException on a province out of scope
   */
  async filters(view: PilotageView, raw: RawFilters): Promise<FarmFilters> {
    const codes = (raw.province ?? '')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    let provinceIds: string[] | null = null;
    if (codes.length > 0) {
      const rows: { id: string; code: string }[] = await this.dataSource.query(
        `SELECT id, code FROM provinces WHERE program_id = $1 AND code = ANY($2::text[])`,
        [view.programId, codes],
      );
      const unknown = codes.filter((c) => !rows.some((r) => r.code === c));
      if (unknown.length > 0) {
        throw new BadRequestException(
          `Province inconnue : ${unknown.join(', ')}.`,
        );
      }
      provinceIds = rows.map((r) => r.id);
      if (view.access?.scopeKind === AccessScopeKind.PROVINCES) {
        for (const id of provinceIds)
          this.scope.assertProvince(view.access, id);
      }
    }
    return {
      provinceIds,
      cohort: raw.cohort?.trim() || null,
      status: raw.status?.trim() || null,
    };
  }

  /**
   * SQL of the farms the view reaches, filtered (`id`, `province_id`, `code`,
   * `name`, `cohort`, `status_code`, `active`, `latitude`, `longitude`,
   * `capacity_places`, `owner_id`), with its positional parameters, to embed
   * as a CTE. Institutional scopes go through `ScopeResolver.applyFarmScope`.
   */
  scopedFarms(
    view: PilotageView,
    filters: FarmFilters,
  ): { sql: string; params: unknown[] } {
    const qb = this.dataSource
      .createQueryBuilder()
      .from(Farm, 'f')
      .select('f.id', 'id')
      .addSelect('f.province_id', 'province_id')
      .addSelect('f.code', 'code')
      .addSelect('f.name', 'name')
      .addSelect('f.cohort', 'cohort')
      .addSelect('f.status_code', 'status_code')
      .addSelect('f.active', 'active')
      .addSelect('f.latitude', 'latitude')
      .addSelect('f.longitude', 'longitude')
      .addSelect('f.capacity_places', 'capacity_places')
      .addSelect('f.gps_province_warning', 'gps_province_warning')
      .addSelect('f.owner_id', 'owner_id')
      .where('f.program_id = :pilotageProgramId', {
        pilotageProgramId: view.programId,
      });
    this.restrict(qb, view);
    if (filters.provinceIds) {
      if (filters.provinceIds.length === 0) qb.andWhere('1 = 0');
      else {
        qb.andWhere('f.province_id IN (:...pilotageProvinceIds)', {
          pilotageProvinceIds: filters.provinceIds,
        });
      }
    }
    if (filters.cohort) {
      qb.andWhere('f.cohort = :pilotageCohort', {
        pilotageCohort: filters.cohort,
      });
    }
    if (filters.status) {
      qb.andWhere('f.status_code = :pilotageStatus', {
        pilotageStatus: filters.status,
      });
    }
    const [sql, params] = qb.getQueryAndParameters();
    return { sql, params };
  }

  private restrict<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    view: PilotageView,
  ): void {
    // Platform, system and aggregate views read the whole programme (the
    // aggregate one never shows a farm row); the others their own scope.
    if (!view.access || view.aggregateOnly) return;
    this.scope.applyFarmScope(qb, 'f', view.access);
  }
}

/** Positional parameters appended after a CTE's own (`$n`). */
export class SqlParams {
  readonly values: unknown[];

  constructor(base: readonly unknown[] = []) {
    this.values = [...base];
  }

  /** Adds a value, returns its placeholder. */
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}
