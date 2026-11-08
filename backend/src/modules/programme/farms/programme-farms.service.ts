import { gpsIdempotencyKey, staleGpsMessage } from './gps-rules.js';
import { verifiedAfterStatus } from './verification-rules.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import type { AuthUser } from '../../../common/decorators/current-user.decorator.js';
import { BatchStatus } from '../../../common/enums/batch-type.enum.js';
import { GpsSource } from '../../../common/enums/gps-source.enum.js';
import { ProgramListType } from '../../../common/enums/program-list-type.enum.js';
import { UserRole } from '../../../common/enums/role.enum.js';
import { normalizePhone } from '../../../common/utils/phone.js';
import { ProductionBatch } from '../../batches/entities/production-batch.entity.js';
import { Farm } from '../../farms/entities/farm.entity.js';
import { FarmsService } from '../../farms/farms.service.js';
import {
  generateLoginCode,
  newLoginCode,
} from '../../../common/utils/login-code.js';
import {
  consults,
  includesFarm,
  scopeReachesFarms,
  type InstitutionAccess,
} from '../../access/access-rules.js';
import { ScopeResolver } from '../../access/scope-resolver.service.js';
import { PilotageBiosecurityService } from '../../reporting/pilotage-biosecurity.service.js';
import { POUFA_BASE_VARIABLE_NAMES } from '../../indicators/formula/formula-catalog.js';
import {
  evaluateFormula,
  parseFormula,
} from '../../indicators/formula/formula.js';
import { User } from '../../users/entities/user.entity.js';
import { FarmEmployee } from '../../farms/entities/farm-employee.entity.js';
import type {
  ActivateOwnerDto,
  CreateProgrammeFarmDto,
  FarmGpsDto,
  FarmInfrastructureDto,
  ListProgrammeFarmsQueryDto,
  SetFarmGpsDto,
  SetFarmStatusDto,
  SetFarmVerificationDto,
  UpdateProgrammeFarmDto,
} from '../dto/programme-farm.dto.js';
import { FarmGpsHistory } from '../entities/farm-gps-history.entity.js';
import { FarmInfrastructure } from '../entities/farm-infrastructure.entity.js';
import { FarmStatusHistory } from '../entities/farm-status-history.entity.js';
import { Localite } from '../entities/localite.entity.js';
import type { Program } from '../entities/program.entity.js';
import { Province } from '../entities/province.entity.js';
import type { RefItem } from '../entities/ref-item.entity.js';
import { GeoService } from '../geo.service.js';
import { IdCounterService } from '../id-counter.service.js';
import { formulaParameterKey } from '../parameter-catalog.js';
import { ParametersService } from '../parameters.service.js';
import { ProgrammeService } from '../programme.service.js';
import { RefListsService } from '../ref-lists.service.js';
import { TerritoryService } from '../territory.service.js';
import {
  DUPLICATE_REASON_LABELS,
  duplicateScore,
  isProbableDuplicate,
  normalizeAmiRef,
  normalizeFarmName,
  type DuplicateScore,
} from './registry-rules.js';

/** Family of STATUT_FERME that deactivates the farm (`Farm.active = false`). */
export const SUSPENDED_FAMILY = 'SUSPENDUE';
/** Family of the default status of a new programme farm. */
export const DEFAULT_STATUS_FAMILY = 'PREPARATION';

/** 409 of `activate-owner` when the exploitant's phone holds a buyer account. */
export const BUYER_PHONE_MESSAGE =
  "Ce numéro appartient à un compte acheteur du Market : un compte acheteur ne peut pas devenir exploitant. Renseignez un autre numéro de téléphone pour l'exploitant sur la fiche, puis activez son compte.";

const FALLBACK_OCCUPATION_FORMULA = 'mis_en_place / capacite_places * 100';

/** A registry farm, as compared by the duplicate detection. */
export interface RegistryEntry {
  readonly id: string | null;
  readonly code: string | null;
  readonly name: string;
  readonly normalizedName: string;
  readonly provinceId: string | null;
  readonly localiteId: string | null;
  readonly phone: string | null;
  readonly exploitantName: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly amiRef: string | null;
  /** Import only: line of the file that will create it (dry run). */
  readonly line?: number;
}

export interface DuplicateCandidate {
  readonly farmId: string | null;
  readonly code: string | null;
  readonly name: string;
  /** Province of the candidate (null when it has none). */
  readonly provinceCode: string | null;
  readonly provinceName: string | null;
  readonly score: number;
  readonly reasons: string[];
  readonly line?: number;
}

/** A candidate out of the caller's scope: neither its code nor its name is shown. */
export interface HiddenDuplicate {
  readonly hidden: true;
  readonly score: number;
  readonly reasons: string[];
}

/** Code and name of the provinces, by id (duplicate candidates). */
export type ProvinceLabels = ReadonlyMap<
  string,
  { readonly code: string; readonly name: string }
>;

/** A database candidate with what the scope check needs. */
interface ScopedDuplicate extends DuplicateCandidate {
  readonly farmId: string;
  readonly provinceId: string | null;
}

export interface GpsFix {
  readonly latitude: number;
  readonly longitude: number;
  readonly capturedAt: Date;
  readonly source: GpsSource;
  readonly accuracyM: number | null;
}

/** A validated programme farm entry, ready to be written. */
export interface ResolvedEntry {
  readonly name: string;
  readonly province: Province;
  readonly localite: Localite | null;
  readonly exploitantName: string | null;
  readonly exploitantPhone: string | null;
  readonly amiRef: string | null;
  readonly cohort: string | null;
  readonly capacityPlaces: number | null;
  readonly status: RefItem;
  readonly gps: GpsFix | null;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Farm registry of the programme (POUFA §5.1): identification sheet with a
 * never-changing code, GPS with its province check (warning only), capacity
 * and infrastructures, status with history, duplicate blocking and activation of
 * the exploitant's account.
 *
 * Writes that run the duplicate check take a per-programme advisory lock, so
 * two concurrent creations can't both miss each other.
 */
@Injectable()
export class ProgrammeFarmsService {
  constructor(
    private readonly programme: ProgrammeService,
    private readonly territory: TerritoryService,
    private readonly lists: RefListsService,
    private readonly counters: IdCounterService,
    private readonly geo: GeoService,
    private readonly parameters: ParametersService,
    private readonly farmsService: FarmsService,
    private readonly scope: ScopeResolver,
    private readonly biosecurity: PilotageBiosecurityService,
    @InjectRepository(Farm) private readonly farms: Repository<Farm>,
    @InjectRepository(FarmStatusHistory)
    private readonly statusRows: Repository<FarmStatusHistory>,
    @InjectRepository(FarmInfrastructure)
    private readonly infraRows: Repository<FarmInfrastructure>,
    @InjectRepository(FarmGpsHistory)
    private readonly gpsRows: Repository<FarmGpsHistory>,
    @InjectRepository(Localite)
    private readonly localites: Repository<Localite>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------
  // Shared building blocks (also used by the import)
  // ---------------------------------------------------------------------

  /** Serializes the registry writes of a programme until commit. */
  async lockRegistry(em: EntityManager, programId: string): Promise<void> {
    await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `programme-farms:${programId}`,
    ]);
  }

  /** Active STATUT_FERME items; the default is the first PREPARATION one. */
  async statusItems(): Promise<RefItem[]> {
    return this.lists.list(ProgramListType.STATUT_FERME);
  }

  defaultStatus(items: readonly RefItem[]): RefItem {
    const item = items.find((i) => i.family === DEFAULT_STATUS_FAMILY);
    if (!item) {
      throw new BadRequestException(
        'Aucun statut actif de la famille PREPARATION dans la liste STATUT_FERME.',
      );
    }
    return item;
  }

  async resolveStatus(code: string | undefined): Promise<RefItem> {
    const items = await this.statusItems();
    if (!code) return this.defaultStatus(items);
    const item = items.find((i) => i.code === code);
    if (!item)
      throw new BadRequestException(`Statut inconnu ou désactivé : ${code}.`);
    return item;
  }

  async resolveCohort(code: string | null | undefined): Promise<string | null> {
    if (code === undefined || code === null || code === '') return null;
    const items = await this.lists.list(ProgramListType.COHORTE);
    if (!items.some((i) => i.code === code)) {
      throw new BadRequestException(
        `Cohorte inconnue ou désactivée : ${code}.`,
      );
    }
    return code;
  }

  async resolveLocalite(
    province: Province,
    localiteId: string | null | undefined,
  ): Promise<Localite | null> {
    if (!localiteId) return null;
    const localite = await this.localites.findOne({
      where: { id: localiteId, provinceId: province.id },
    });
    if (!localite) {
      throw new BadRequestException(
        `La localité indiquée n'appartient pas à la province ${province.code} (${province.name}).`,
      );
    }
    return localite;
  }

  gpsFix(dto: FarmGpsDto, defaultSource: GpsSource): GpsFix {
    const capturedAt = dto.capturedAt ? new Date(dto.capturedAt) : new Date();
    if (capturedAt.getTime() > Date.now() + 5 * 60_000) {
      throw new BadRequestException(
        'La date du relevé GPS ne peut pas être future.',
      );
    }
    return {
      latitude: dto.latitude,
      longitude: dto.longitude,
      capturedAt,
      source: dto.source ?? defaultSource,
      accuracyM: dto.accuracyM ?? null,
    };
  }

  entryOf(farm: Farm): RegistryEntry {
    return {
      id: farm.id,
      code: farm.code,
      name: farm.name,
      normalizedName: normalizeFarmName(farm.name),
      provinceId: farm.provinceId,
      localiteId: farm.localiteId,
      phone: farm.exploitantPhone,
      exploitantName: farm.exploitantName,
      latitude: farm.latitude,
      longitude: farm.longitude,
      amiRef: farm.amiRef,
    };
  }

  /** Every farm of the programme, as registry entries (import). */
  async loadEntries(
    em: EntityManager,
    programId: string,
  ): Promise<RegistryEntry[]> {
    const rows = await em.getRepository(Farm).find({
      where: { programId },
      select: {
        id: true,
        code: true,
        name: true,
        provinceId: true,
        localiteId: true,
        exploitantPhone: true,
        exploitantName: true,
        latitude: true,
        longitude: true,
        amiRef: true,
      },
    });
    return rows.map((f) => this.entryOf(f));
  }

  /** Code and name of every province of the programme, by id. */
  async provinceLabels(
    em: EntityManager,
    programId: string,
  ): Promise<ProvinceLabels> {
    const rows = await em.getRepository(Province).find({
      where: { programId },
      select: { id: true, code: true, name: true },
    });
    return new Map(rows.map((p) => [p.id, { code: p.code, name: p.name }]));
  }

  /** Probable duplicates of `entry` among `pool`, best first (10 at most). */
  scoreAgainst(
    entry: RegistryEntry,
    pool: readonly RegistryEntry[],
    provinces: ProvinceLabels,
  ): DuplicateCandidate[] {
    const found: { e: RegistryEntry; s: DuplicateScore }[] = [];
    for (const other of pool) {
      if (entry.id && other.id === entry.id) continue;
      const s = duplicateScore(entry, other);
      if (isProbableDuplicate(s)) found.push({ e: other, s });
    }
    return found
      .sort((a, b) => b.s.score - a.s.score)
      .slice(0, 10)
      .map(({ e, s }) => ({
        farmId: e.id,
        code: e.code,
        name: e.name,
        provinceCode:
          (e.provinceId && provinces.get(e.provinceId)?.code) || null,
        provinceName:
          (e.provinceId && provinces.get(e.provinceId)?.name) || null,
        score: Math.round(s.score * 100) / 100,
        reasons: s.reasons.map((r) => DUPLICATE_REASON_LABELS[r]),
        ...(e.line !== undefined ? { line: e.line } : {}),
      }));
  }

  /**
   * Probable duplicates in the database. Every farm of the programme is
   * scored (a name that resembles counts in any province, for a farm entered
   * in the wrong one); the programme holds a few hundred farms.
   */
  async findDuplicates(
    em: EntityManager,
    programId: string,
    entry: RegistryEntry,
  ): Promise<ScopedDuplicate[]> {
    const pool = (await this.loadEntries(em, programId)).filter(
      (e) => !entry.id || e.id !== entry.id,
    );
    const provinces = new Map(pool.map((e) => [e.id, e.provinceId]));
    const labels = await this.provinceLabels(em, programId);
    return this.scoreAgainst(entry, pool, labels).map((c) => ({
      ...c,
      farmId: c.farmId as string,
      provinceId: provinces.get(c.farmId) ?? null,
    }));
  }

  /**
   * Blocks a creation or a sheet change that looks like an existing farm
   * (CDC §5 « blocage des doublons »). Candidates out of an institutional
   * caller's scope are masked (CDC §3 and §8, cloisonnement), and such a
   * caller cannot confirm against them: a national administrator, who sees
   * both sheets, decides.
   * @returns the candidates confirmed (recorded in `duplicateOverride`)
   * @throws ConflictException
   */
  private async checkDuplicates(
    user: AuthUser,
    programId: string,
    duplicates: ScopedDuplicate[],
    confirm: boolean | undefined,
  ): Promise<DuplicateCandidate[]> {
    if (duplicates.length === 0) return [];
    const access: InstitutionAccess | null = this.scope.isInstitution(user)
      ? await this.scope.requireAccess(user)
      : null;
    const visible: DuplicateCandidate[] = [];
    const hidden: HiddenDuplicate[] = [];
    for (const d of duplicates) {
      const inScope =
        !access ||
        includesFarm(access, {
          id: d.farmId,
          programId,
          provinceId: d.provinceId,
        });
      if (inScope) {
        visible.push({
          farmId: d.farmId,
          code: d.code,
          name: d.name,
          provinceCode: d.provinceCode,
          provinceName: d.provinceName,
          score: d.score,
          reasons: d.reasons,
        });
      } else {
        hidden.push({ hidden: true, score: d.score, reasons: d.reasons });
      }
    }
    if (hidden.length > 0 || !confirm) {
      throw this.duplicateConflict(visible, hidden);
    }
    return visible;
  }

  duplicateConflict(
    candidates: DuplicateCandidate[],
    hidden: HiddenDuplicate[] = [],
  ): ConflictException {
    const parts: string[] = [];
    if (candidates.length > 0) {
      const list = candidates
        .map((c) => `${c.code ?? `ligne ${c.line}`} « ${c.name} »`)
        .join(', ');
      parts.push(`Doublon probable : ${list}.`);
    }
    if (hidden.length > 0) {
      const reasons = [...new Set(hidden.flatMap((h) => h.reasons))].join(', ');
      parts.push(
        hidden.length === 1
          ? `Une ferme hors de votre périmètre ressemble à cette fiche (${reasons}).`
          : `${hidden.length} fermes hors de votre périmètre ressemblent à cette fiche (${reasons}).`,
      );
      parts.push(
        "Seul un administrateur national du programme peut confirmer l'enregistrement : transmettez-lui la fiche.",
      );
    } else {
      parts.push(
        "Vérifiez la fiche, ou renvoyez la demande avec confirmDuplicate: true pour l'enregistrer quand même.",
      );
    }
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      message: parts.join(' '),
      duplicates: [...candidates, ...hidden],
    });
  }

  /** @throws ConflictException when another farm of the programme holds this AMI reference */
  async assertAmiRefFree(
    em: EntityManager,
    programId: string,
    amiRef: string | null,
    exceptFarmId?: string,
  ): Promise<void> {
    if (!amiRef) return;
    const other = await em.getRepository(Farm).findOne({
      where: { programId, amiRef },
      select: { id: true, code: true },
    });
    if (other && other.id !== exceptFarmId) {
      throw this.amiRefTaken(amiRef, other.code);
    }
  }

  amiRefTaken(amiRef: string, code: string | null): ConflictException {
    return new ConflictException(
      `La référence AMI « ${amiRef} » est déjà attribuée à la ferme ${code ?? 'sans code'}.`,
    );
  }

  /**
   * Writes the sheet of a NEW programme farm (code drawn from IdCounter,
   * first status row, GPS fix). Runs in the caller's transaction.
   */
  async insertEntry(
    em: EntityManager,
    program: Program,
    entry: ResolvedEntry,
    actorId: string | null,
    duplicates: DuplicateCandidate[],
    gpsReason: string | null = null,
  ): Promise<Farm> {
    const repo = em.getRepository(Farm);
    const code = await this.counters.nextFarmCode(entry.province.code, em);
    const farm = await repo.save(
      repo.create({
        name: entry.name,
        administrativeCity: entry.localite?.name ?? entry.province.name,
        ownerId: null,
        defaultSacKg: 50,
        isVerified: false,
        active: true,
        programId: program.id,
        code,
        provinceId: entry.province.id,
        localiteId: entry.localite?.id ?? null,
        amiRef: entry.amiRef,
        cohort: entry.cohort,
        capacityPlaces: entry.capacityPlaces,
        exploitantName: entry.exploitantName,
        exploitantPhone: entry.exploitantPhone,
        duplicateOverride: this.override(duplicates, actorId),
      }),
    );
    await this.recordStatus(em, farm, entry.status, new Date(), actorId, null);
    if (entry.gps) {
      await this.applyGps(
        em,
        farm,
        entry.province,
        entry.gps,
        actorId,
        gpsReason,
      );
    }
    return farm;
  }

  private override(duplicates: DuplicateCandidate[], actorId: string | null) {
    if (duplicates.length === 0) return null;
    return {
      confirmedAt: new Date().toISOString(),
      confirmedById: actorId,
      candidateCodes: duplicates
        .map((d) => d.code)
        .filter((c): c is string => !!c),
    };
  }

  /** Appends a status row and aligns `statusCode`, `statusSince` and `active`. */
  private async recordStatus(
    em: EntityManager,
    farm: Farm,
    item: RefItem,
    from: Date,
    actorId: string | null,
    reason: string | null,
  ): Promise<FarmStatusHistory> {
    const repo = em.getRepository(FarmStatusHistory);
    const row = await repo.save(
      repo.create({
        farmId: farm.id,
        statusCode: item.code,
        statusFamily: item.family ?? '',
        cohort: farm.cohort,
        from,
        createdById: actorId,
        reason,
      }),
    );
    farm.statusCode = item.code;
    farm.statusSince = from;
    farm.active = item.family !== SUSPENDED_FAMILY;
    // POUFA lot A droits (F8): an operational farm is verified for the Market.
    farm.isVerified = verifiedAfterStatus(item.family, farm.isVerified);
    await em.getRepository(Farm).update(farm.id, {
      statusCode: farm.statusCode,
      statusSince: farm.statusSince,
      active: farm.active,
      isVerified: farm.isVerified,
    });
    return row;
  }

  /**
   * Stores a GPS fix (history row + current point) with its province check,
   * in the caller's transaction (also used by the data recovery).
   */
  async applyGps(
    em: EntityManager,
    farm: Farm,
    province: Province,
    fix: GpsFix,
    actorId: string | null,
    reason: string | null,
    idempotencyKey: string | null = null,
  ): Promise<string | null> {
    const check = await this.geo.checkPoint(
      fix.latitude,
      fix.longitude,
      province.code,
    );
    const repo = em.getRepository(FarmGpsHistory);
    await repo.save(
      repo.create({
        farmId: farm.id,
        latitude: fix.latitude,
        longitude: fix.longitude,
        capturedAt: fix.capturedAt,
        source: fix.source,
        accuracyM: fix.accuracyM,
        provinceWarning: check.warning,
        createdById: actorId,
        reason,
        idempotencyKey,
      }),
    );
    Object.assign(farm, {
      latitude: fix.latitude,
      longitude: fix.longitude,
      gpsCapturedAt: fix.capturedAt,
      gpsSource: fix.source,
      gpsAccuracyM: fix.accuracyM,
      gpsProvinceWarning: check.warning,
    });
    await em.getRepository(Farm).update(farm.id, {
      latitude: fix.latitude,
      longitude: fix.longitude,
      gpsCapturedAt: fix.capturedAt,
      gpsSource: fix.source,
      gpsAccuracyM: fix.accuracyM,
      gpsProvinceWarning: check.warning,
    });
    return check.warning;
  }

  // ---------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------

  /** An institutional account writes farms in the provinces of its scope only. */
  private async assertProvinceInScope(
    user: AuthUser,
    provinceId: string,
  ): Promise<void> {
    if (!this.scope.isInstitution(user)) return;
    this.scope.assertProvince(await this.scope.requireAccess(user), provinceId);
  }

  /** One programme farm (POST /programme/farms). */
  async create(user: AuthUser, dto: CreateProgrammeFarmDto) {
    const program = await this.programme.current();
    const province = await this.territory.provinceByCode(dto.provinceCode);
    await this.assertProvinceInScope(user, province.id);
    const entry: ResolvedEntry = {
      name: dto.name.trim(),
      province,
      localite: await this.resolveLocalite(province, dto.localiteId),
      exploitantName: dto.exploitantName?.trim() || null,
      exploitantPhone: dto.exploitantPhone || null,
      amiRef: normalizeAmiRef(dto.amiRef),
      cohort: await this.resolveCohort(dto.cohort),
      capacityPlaces: dto.capacityPlaces ?? null,
      status: await this.resolveStatus(dto.statusCode),
      gps: dto.gps ? this.gpsFix(dto.gps, GpsSource.APPAREIL) : null,
    };
    const infra = dto.infrastructures
      ? await this.checkInfrastructures(dto.infrastructures, [])
      : null;
    const farm = await this.dataSource.transaction(async (em) => {
      await this.lockRegistry(em, program.id);
      await this.assertAmiRefFree(em, program.id, entry.amiRef);
      const duplicates = await this.checkDuplicates(
        user,
        program.id,
        await this.findDuplicates(em, program.id, {
          id: null,
          code: null,
          name: entry.name,
          normalizedName: normalizeFarmName(entry.name),
          provinceId: province.id,
          localiteId: entry.localite?.id ?? null,
          phone: entry.exploitantPhone,
          exploitantName: entry.exploitantName,
          latitude: entry.gps?.latitude ?? null,
          longitude: entry.gps?.longitude ?? null,
          amiRef: entry.amiRef,
        }),
        dto.confirmDuplicate,
      );
      const created = await this.insertEntry(
        em,
        program,
        entry,
        user.id,
        duplicates,
      );
      if (infra) await this.writeInfrastructures(em, created.id, infra);
      return created;
    });
    return this.sheetFor(user, farm.id);
  }

  /** Sheet corrections; the code and the programme never change. */
  async update(user: AuthUser, farmId: string, dto: UpdateProgrammeFarmDto) {
    const program = await this.programme.current();
    await this.dataSource.transaction(async (em) => {
      await this.lockRegistry(em, program.id);
      const farm = await this.lockedProgrammeFarm(em, program.id, farmId);
      let province = await em
        .getRepository(Province)
        .findOneByOrFail({ id: farm.provinceId as string });
      const provinceChanged =
        dto.provinceCode !== undefined && dto.provinceCode !== province.code;
      if (provinceChanged) {
        province = await this.territory.provinceByCode(
          dto.provinceCode as string,
        );
        await this.assertProvinceInScope(user, province.id);
      }
      const patch: Partial<
        Pick<
          Farm,
          | 'name'
          | 'provinceId'
          | 'localiteId'
          | 'administrativeCity'
          | 'exploitantName'
          | 'exploitantPhone'
          | 'amiRef'
          | 'cohort'
          | 'capacityPlaces'
          | 'duplicateOverride'
          | 'gpsProvinceWarning'
        >
      > = {};
      if (dto.name !== undefined) patch.name = dto.name.trim();
      if (provinceChanged) {
        patch.provinceId = province.id;
        // A locality belongs to one province.
        if (dto.localiteId === undefined) patch.localiteId = null;
      }
      if (dto.localiteId !== undefined) {
        const localite = await this.resolveLocalite(province, dto.localiteId);
        patch.localiteId = localite?.id ?? null;
        // Single source of the place: the registry locality (A8).
        patch.administrativeCity = localite?.name ?? province.name;
      } else if (provinceChanged) {
        patch.administrativeCity = province.name;
      }
      if (dto.exploitantName !== undefined) {
        patch.exploitantName = dto.exploitantName?.trim() || null;
      }
      if (dto.exploitantPhone !== undefined) {
        patch.exploitantPhone = dto.exploitantPhone || null;
      }
      if (dto.amiRef !== undefined) {
        patch.amiRef = normalizeAmiRef(dto.amiRef);
        await this.assertAmiRefFree(em, program.id, patch.amiRef, farm.id);
      }
      if (dto.cohort !== undefined)
        patch.cohort = await this.resolveCohort(dto.cohort);
      if (dto.capacityPlaces !== undefined) {
        patch.capacityPlaces = dto.capacityPlaces ?? null;
      }
      const next = { ...farm, ...patch } as Farm;
      const identityChanged =
        patch.name !== undefined ||
        provinceChanged ||
        patch.localiteId !== undefined ||
        patch.exploitantName !== undefined ||
        patch.exploitantPhone !== undefined;
      if (identityChanged) {
        const duplicates = await this.checkDuplicates(
          user,
          program.id,
          await this.findDuplicates(em, program.id, this.entryOf(next)),
          dto.confirmDuplicate,
        );
        if (duplicates.length > 0) {
          patch.duplicateOverride = this.override(duplicates, user.id);
        }
      }
      if (provinceChanged && farm.latitude != null && farm.longitude != null) {
        patch.gpsProvinceWarning = (
          await this.geo.checkPoint(
            farm.latitude,
            farm.longitude,
            province.code,
          )
        ).warning;
      }
      if (Object.keys(patch).length > 0) {
        await em.getRepository(Farm).update(farm.id, patch);
      }
    });
    return this.sheetFor(user, farmId);
  }

  async setStatus(user: AuthUser, farmId: string, dto: SetFarmStatusDto) {
    const program = await this.programme.current();
    const item = await this.resolveStatus(dto.statusCode);
    const from = dto.from ? new Date(dto.from) : new Date();
    if (from.getTime() > Date.now() + 5 * 60_000) {
      throw new BadRequestException(
        "La date d'effet du statut ne peut pas être future.",
      );
    }
    const reason = dto.reason?.trim() || null;
    if (item.family === SUSPENDED_FAMILY && !reason) {
      throw new BadRequestException(
        'Le motif est obligatoire pour suspendre une ferme.',
      );
    }
    await this.dataSource.transaction(async (em) => {
      const farm = await this.lockedProgrammeFarm(em, program.id, farmId);
      if (farm.statusCode === item.code) {
        throw new BadRequestException(
          `La ferme a déjà le statut « ${item.label} ».`,
        );
      }
      if (farm.statusSince && from < farm.statusSince) {
        throw new BadRequestException(
          `La date d'effet précède celle du statut en cours (${farm.statusSince.toISOString().slice(0, 10)}).`,
        );
      }
      await this.recordStatus(em, farm, item, from, user.id, reason);
    });
    return this.sheetFor(user, farmId);
  }

  async statusHistory(farmId: string) {
    const program = await this.programme.current();
    await this.programmeFarm(program.id, farmId);
    const labels = await this.labels(ProgramListType.STATUT_FERME);
    const rows = await this.statusRows.find({
      where: { farmId },
      relations: { createdBy: true },
      order: { from: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((r) => ({
      id: r.id,
      statusCode: r.statusCode,
      statusLabel: labels.get(r.statusCode) ?? r.statusCode,
      statusFamily: r.statusFamily,
      cohort: r.cohort,
      from: r.from,
      reason: r.reason,
      createdBy: r.createdBy
        ? { id: r.createdBy.id, fullName: r.createdBy.fullName }
        : null,
      createdAt: r.createdAt,
    }));
  }

  /** Replaces the farm's infrastructures with `items`. */
  async setInfrastructures(farmId: string, items: FarmInfrastructureDto[]) {
    const program = await this.programme.current();
    await this.programmeFarm(program.id, farmId);
    const current = await this.infraRows.find({ where: { farmId } });
    const checked = await this.checkInfrastructures(
      items,
      current.map((c) => c.refItemCode),
    );
    await this.dataSource.transaction((em) =>
      this.writeInfrastructures(em, farmId, checked),
    );
    return (await this.sheetOf(farmId)).infrastructures;
  }

  private async checkInfrastructures(
    items: FarmInfrastructureDto[],
    alreadyOnFarm: string[],
  ): Promise<FarmInfrastructureDto[]> {
    const all = await this.lists.list(ProgramListType.INFRASTRUCTURE, true);
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.code)) {
        throw new BadRequestException(
          `Infrastructure en double : ${item.code}.`,
        );
      }
      seen.add(item.code);
      const ref = all.find((r) => r.code === item.code);
      if (!ref || (!ref.active && !alreadyOnFarm.includes(item.code))) {
        throw new BadRequestException(
          `Infrastructure inconnue ou désactivée : ${item.code}.`,
        );
      }
    }
    return items;
  }

  private async writeInfrastructures(
    em: EntityManager,
    farmId: string,
    items: FarmInfrastructureDto[],
  ): Promise<void> {
    const repo = em.getRepository(FarmInfrastructure);
    const current = await repo.find({ where: { farmId } });
    const keep = new Set(items.map((i) => i.code));
    const gone = current.filter((c) => !keep.has(c.refItemCode));
    if (gone.length > 0) await repo.delete(gone.map((g) => g.id));
    for (const item of items) {
      const row = current.find((c) => c.refItemCode === item.code);
      await repo.save(
        repo.create({
          ...row,
          farmId,
          refItemCode: item.code,
          count: item.count,
          surfaceM2: item.surfaceM2 ?? null,
        }),
      );
    }
  }

  /**
   * GPS capture or manual correction: the previous point stays in the
   * history. Field fixes (owner, éleveur, agent technique) may come late from
   * an offline queue: a replay of the same `idempotencyKey` adds no second
   * point, and a fix taken before the current point is ignored (200,
   * `applied: false` with a French `message`).
   */
  async setGps(user: AuthUser, farmId: string, dto: SetFarmGpsDto) {
    const program = await this.programme.current();
    const fix = this.gpsFix(dto, GpsSource.MANUEL);
    const idempotencyKey = gpsIdempotencyKey(dto.idempotencyKey);
    const result = await this.dataSource.transaction(async (em) => {
      const farm = await this.lockedProgrammeFarm(em, program.id, farmId);
      if (idempotencyKey) {
        const replay = await em
          .getRepository(FarmGpsHistory)
          .findOne({ where: { farmId, idempotencyKey } });
        if (replay) {
          return {
            applied: false,
            replay: true,
            previous: null,
            warning: replay.provinceWarning,
            message: null,
          };
        }
      }
      const stale = staleGpsMessage(fix.capturedAt, farm.gpsCapturedAt);
      if (stale) {
        return {
          applied: false,
          replay: false,
          previous: null,
          warning: null,
          message: stale,
        };
      }
      const previous =
        farm.latitude != null && farm.longitude != null
          ? {
              latitude: farm.latitude,
              longitude: farm.longitude,
              capturedAt: farm.gpsCapturedAt,
              source: farm.gpsSource,
            }
          : null;
      const province = await em
        .getRepository(Province)
        .findOneByOrFail({ id: farm.provinceId as string });
      // A point outside the declared province is not saved on a simple
      // warning: it needs an explicit confirmation with a reason, kept in the
      // GPS history (who, when, why) and flagged on the map.
      const check = await this.geo.checkPoint(
        fix.latitude,
        fix.longitude,
        province.code,
      );
      const reason = dto.reason?.trim() || null;
      if (check.warning && check.inside === false) {
        if (dto.confirmOutsideProvince !== true || !reason || reason.length < 5) {
          throw new ConflictException({
            statusCode: 409,
            code: 'GPS_HORS_PROVINCE',
            message: `${check.warning} Pour enregistrer quand même ce point, confirmez-le en indiquant le motif (au moins 5 caractères).`,
            provinceWarning: check.warning,
          });
        }
      }
      const warning = await this.applyGps(
        em,
        farm,
        province,
        fix,
        user.id,
        check.inside === false && reason
          ? `Hors province confirmé : ${reason}`.slice(0, 500)
          : reason,
        idempotencyKey,
      );
      return { applied: true, replay: false, previous, warning, message: null };
    });
    return {
      gps: (await this.sheetOf(farmId)).gps,
      previous: result.previous,
      provinceWarning: result.warning,
      applied: result.applied,
      replay: result.replay,
      message: result.message,
    };
  }

  /**
   * Market verification by the programme (REGISTRE:VALIDER or the platform
   * admin; POUFA audit F8): the publication condition of the Market. The
   * status OPERATIONNELLE also verifies the farm (`verifiedAfterStatus`).
   */
  async setVerification(
    user: AuthUser,
    farmId: string,
    dto: SetFarmVerificationDto,
  ) {
    const program = await this.programme.current();
    await this.dataSource.transaction(async (em) => {
      const farm = await this.lockedProgrammeFarm(em, program.id, farmId);
      await em
        .getRepository(Farm)
        .update(farm.id, { isVerified: dto.verified });
    });
    return this.sheetFor(user, farmId);
  }

  async gpsHistory(farmId: string) {
    const program = await this.programme.current();
    await this.programmeFarm(program.id, farmId);
    const rows = await this.gpsRows.find({
      where: { farmId },
      relations: { createdBy: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => ({
      id: r.id,
      latitude: r.latitude,
      longitude: r.longitude,
      capturedAt: r.capturedAt,
      source: r.source,
      accuracyM: r.accuracyM,
      provinceWarning: r.provinceWarning,
      reason: r.reason,
      createdBy: r.createdBy
        ? { id: r.createdBy.id, fullName: r.createdBy.fullName }
        : null,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Gives the exploitant an account: a new PROPRIETAIRE created from the
   * sheet's phone and name (the login code is returned once), or, with
   * `linkExistingUser`, the PROPRIETAIRE account already holding that phone
   * (one exploitant may own several farms).
   */
  async activateOwner(farmId: string, dto: ActivateOwnerDto) {
    const program = await this.programme.current();
    return this.dataSource.transaction(async (em) => {
      const farm = await this.lockedProgrammeFarm(em, program.id, farmId);
      if (farm.ownerId) {
        throw new ConflictException(
          'Cette ferme a déjà un compte propriétaire.',
        );
      }
      if (!farm.exploitantPhone) {
        throw new BadRequestException(
          "Renseignez le téléphone de l'exploitant sur la fiche avant d'activer son compte.",
        );
      }
      if (!farm.exploitantName) {
        throw new BadRequestException(
          "Renseignez le nom de l'exploitant sur la fiche avant d'activer son compte.",
        );
      }
      const phone = normalizePhone(farm.exploitantPhone);
      const existing = await this.farmsService.findAccount(phone, null, em);
      let owner: User;
      let code: string | null = null;
      if (existing) {
        // Checked before `linkExistingUser`: no flag turns a buyer, a member
        // or an institutional account into an exploitant.
        if (existing.role === UserRole.ACHETEUR) {
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message: BUYER_PHONE_MESSAGE,
            buyerAccount: true,
          });
        }
        if (existing.role !== UserRole.PROPRIETAIRE) {
          throw new ConflictException(
            "Ce numéro appartient à un compte qui n'est pas un compte Propriétaire : la ferme ne peut pas y être rattachée. Renseignez un autre numéro pour l'exploitant sur la fiche.",
          );
        }
        if (!dto.linkExistingUser) {
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message:
              'Un compte existe déjà pour ce numéro de téléphone. Pour rattacher la ferme à ce compte, renvoyez la demande avec linkExistingUser: true.',
            existingAccount: true,
          });
        }
        owner = existing;
      } else {
        code = generateLoginCode();
        owner = await this.farmsService.createProprietaire(
          { phone, fullName: farm.exploitantName, code },
          em,
        );
        // TODO(notify lot): send the code to the exploitant by SMS instead of
        // returning it to the administrator.
      }
      await em.getRepository(Farm).update(farm.id, { ownerId: owner.id });
      return {
        farm: { id: farm.id, code: farm.code, name: farm.name },
        owner: { id: owner.id, fullName: owner.fullName, phone: owner.phone },
        linkedExistingAccount: existing !== null,
        /** Shown once; null when an existing account was linked. */
        loginCode: code,
      };
    });
  }

  /**
   * New login code for the farm's owner account (the same code service as
   * `POST /admin/users/:userId/login-code`): returned once, the previous code
   * stops working, open sessions stay valid until they expire. The farm must
   * have an owner account; never the caller's own; an institutional caller
   * needs every farm of that owner in its scope (the code opens them all).
   */
  async regenerateOwnerLoginCode(user: AuthUser, farmId: string) {
    const program = await this.programme.current();
    const access: InstitutionAccess | null = this.scope.isInstitution(user)
      ? await this.scope.requireAccess(user)
      : null;
    const { code, hash } = await newLoginCode();
    return this.dataSource.transaction(async (em) => {
      const farm = await this.programmeFarm(program.id, farmId);
      if (!farm.ownerId) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message:
            "Cette ferme n'a pas encore de compte propriétaire : activez d'abord le compte de l'exploitant.",
          noOwnerAccount: true,
        });
      }
      if (farm.ownerId === user.id) {
        throw new ForbiddenException(
          'Vous ne pouvez pas régénérer votre propre code de connexion.',
        );
      }
      const users = em.getRepository(User);
      const owner = await users.findOne({
        where: { id: farm.ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!owner) {
        throw new NotFoundException('Compte propriétaire introuvable.');
      }
      if (owner.role === UserRole.PLATFORM_ADMIN) {
        throw new BadRequestException(
          "Le code d'un administrateur plateforme ne se régénère pas ici.",
        );
      }
      if (access) {
        const owned = await em.getRepository(Farm).find({
          where: { ownerId: owner.id },
          select: { id: true, programId: true, provinceId: true },
        });
        if (owned.some((f) => !includesFarm(access, f))) {
          throw new ForbiddenException(
            'Accès refusé : cet exploitant a aussi des fermes hors de votre périmètre ; seul un administrateur qui les voit toutes peut régénérer son code.',
          );
        }
      }
      await users.save({
        ...owner,
        passwordHash: hash,
        failedLogins: 0,
        lockedUntil: null,
        credentialsChangedAt: new Date(),
      });
      return {
        farm: { id: farm.id, code: farm.code, name: farm.name },
        owner: { id: owner.id, fullName: owner.fullName, phone: owner.phone },
        /** Shown once. */
        loginCode: code,
      };
    });
  }

  /**
   * Paginated, filtered list of the programme farms (administration), cut
   * to the scope of an institutional account (ScopeResolver).
   */
  async list(user: AuthUser, query: ListProgrammeFarmsQueryDto) {
    const program = await this.programme.current();
    const access = this.scope.isInstitution(user)
      ? await this.scope.requireAccess(user)
      : null;
    if (access && !scopeReachesFarms(access.scopeKind)) {
      throw new ForbiddenException(
        'Accès refusé : votre profil ne donne accès à aucune fiche de ferme.',
      );
    }
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const qb = this.farms
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.province', 'p')
      .leftJoinAndSelect('f.localite', 'l')
      .where('f.program_id = :programId', { programId: program.id });
    if (access) this.scope.applyFarmScope(qb, 'f', access);
    if (query.province) {
      qb.andWhere('UPPER(p.code) = UPPER(:province)', {
        province: query.province.trim(),
      });
    }
    if (query.localiteId) {
      qb.andWhere('f.localite_id = :localiteId', {
        localiteId: query.localiteId,
      });
    }
    if (query.cohort)
      qb.andWhere('f.cohort = :cohort', { cohort: query.cohort });
    if (query.status) {
      qb.andWhere('f.status_code = :status', { status: query.status });
    }
    // Biosecurity belongs to the TECHNIQUE domain: column and filter follow it.
    const readsBiosecurity = !access || consults(access, 'TECHNIQUE');
    if (query.biosecurity) {
      if (!readsBiosecurity) {
        throw new ForbiddenException(
          'Accès refusé : votre profil ne consulte pas les contrôles de biosécurité.',
        );
      }
      const latest = `(SELECT v.classification::text FROM farm_visits v
          WHERE v.farm_id = f.id AND v.classification IS NOT NULL
          ORDER BY v.visit_date DESC, v.created_at DESC LIMIT 1)`;
      if (query.biosecurity === 'NONE') qb.andWhere(`${latest} IS NULL`);
      else {
        qb.andWhere(`${latest} = :bioClass`, { bioClass: query.biosecurity });
      }
    }
    const q = query.q?.trim();
    if (q) {
      const like = `%${escapeLike(q)}%`;
      const phone = `%${escapeLike(normalizePhone(q))}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('f.name ILIKE :like', { like })
            .orWhere('f.code ILIKE :like', { like })
            .orWhere('f.exploitant_name ILIKE :like', { like })
            .orWhere('f.ami_ref ILIKE :like', { like })
            .orWhere('f.exploitant_phone LIKE :phone', { phone });
        }),
      );
    }
    const [rows, total] = await qb
      .orderBy('p.sort', 'ASC')
      .addOrderBy('f.code', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    const statuses = await this.statusMap();
    const cohorts = await this.labels(ProgramListType.COHORTE);
    const bio = readsBiosecurity
      ? await this.biosecurity.ofFarms(
          program.id,
          rows.map((f) => f.id),
        )
      : null;
    return {
      total,
      page,
      pageSize,
      biosecurityStaleAfterDays: bio?.staleAfterDays ?? null,
      items: rows.map((f) => ({
        biosecurity: bio?.byFarm.get(f.id) ?? null,
        id: f.id,
        code: f.code,
        name: f.name,
        province: f.province
          ? { id: f.province.id, code: f.province.code, name: f.province.name }
          : null,
        localite: f.localite
          ? { id: f.localite.id, code: f.localite.code, name: f.localite.name }
          : null,
        cohort: f.cohort
          ? { code: f.cohort, label: cohorts.get(f.cohort) ?? f.cohort }
          : null,
        status: this.statusView(f, statuses),
        exploitantName: f.exploitantName,
        exploitantPhone: f.exploitantPhone,
        amiRef: f.amiRef,
        capacityPlaces: f.capacityPlaces,
        hasOwnerAccount: f.ownerId !== null,
        active: f.active,
        gpsProvinceWarning: f.gpsProvinceWarning,
        createdAt: f.createdAt,
      })),
    };
  }

  /**
   * Sheet read: the platform admin, an institutional account with the farm
   * in its scope, or the farm's own owner.
   */
  async sheet(user: AuthUser, farmId: string) {
    const program = await this.programme.current();
    const farm = await this.programmeFarm(program.id, farmId);
    if (this.scope.isInstitution(user)) {
      this.scope.assertFarm(await this.scope.requireAccess(user), farm);
      return this.sheetFor(user, farmId);
    }
    if (
      user.role !== UserRole.PLATFORM_ADMIN &&
      (farm.ownerId === null || farm.ownerId !== user.id)
    ) {
      throw new ForbiddenException(
        'Accès refusé : cette fiche ne vous concerne pas.',
      );
    }
    return this.sheetFor(user, farmId);
  }

  /**
   * The sheet as `viewer` may see it: the codes of the farms a duplicate was
   * confirmed against are kept only when in the viewer's scope (all of them
   * for the platform admin, none for the farm's owner).
   */
  async sheetFor(viewer: AuthUser, farmId: string) {
    const sheet = await this.sheetOf(farmId);
    const override = sheet.duplicateOverride;
    if (!override || viewer.role === UserRole.PLATFORM_ADMIN) return sheet;
    let codes: string[] = [];
    if (this.scope.isInstitution(viewer) && override.candidateCodes.length) {
      const access = await this.scope.requireAccess(viewer);
      const program = await this.programme.current();
      const farms = await this.farms.find({
        where: { programId: program.id, code: In(override.candidateCodes) },
        select: { id: true, code: true, programId: true, provinceId: true },
      });
      const visible = new Set(
        farms.filter((f) => includesFarm(access, f)).map((f) => f.code),
      );
      codes = override.candidateCodes.filter((c) => visible.has(c));
    }
    return {
      ...sheet,
      duplicateOverride: { ...override, candidateCodes: codes },
    };
  }

  /** Full registry sheet of a programme farm. */
  async sheetOf(farmId: string) {
    const farm = await this.farms.findOne({
      where: { id: farmId },
      relations: { province: true, localite: true, owner: true },
    });
    if (!farm) throw new NotFoundException('Ferme du programme introuvable.');
    const [statuses, cohorts, infraLabels, infra, occupation] =
      await Promise.all([
        this.statusMap(),
        this.labels(ProgramListType.COHORTE),
        this.labels(ProgramListType.INFRASTRUCTURE),
        this.infraRows.find({
          where: { farmId },
          order: { refItemCode: 'ASC' },
        }),
        this.occupation(farm),
      ]);
    return {
      id: farm.id,
      code: farm.code,
      programId: farm.programId,
      name: farm.name,
      administrativeCity: farm.administrativeCity,
      province: farm.province
        ? {
            id: farm.province.id,
            code: farm.province.code,
            name: farm.province.name,
          }
        : null,
      localite: farm.localite
        ? {
            id: farm.localite.id,
            code: farm.localite.code,
            name: farm.localite.name,
          }
        : null,
      amiRef: farm.amiRef,
      cohort: farm.cohort
        ? { code: farm.cohort, label: cohorts.get(farm.cohort) ?? farm.cohort }
        : null,
      exploitant: { name: farm.exploitantName, phone: farm.exploitantPhone },
      owner: farm.owner
        ? {
            id: farm.owner.id,
            fullName: farm.owner.fullName,
            phone: farm.owner.phone,
          }
        : null,
      hasOwnerAccount: farm.ownerId !== null,
      capacityPlaces: farm.capacityPlaces,
      occupation,
      gps:
        farm.latitude != null && farm.longitude != null
          ? {
              latitude: farm.latitude,
              longitude: farm.longitude,
              capturedAt: farm.gpsCapturedAt,
              source: farm.gpsSource,
              accuracyM: farm.gpsAccuracyM,
              provinceWarning: farm.gpsProvinceWarning,
            }
          : null,
      status: this.statusView(farm, statuses),
      active: farm.active,
      isVerified: farm.isVerified,
      infrastructures: infra.map((i) => ({
        code: i.refItemCode,
        label: infraLabels.get(i.refItemCode) ?? i.refItemCode,
        count: i.count,
        surfaceM2: i.surfaceM2,
      })),
      duplicateOverride: farm.duplicateOverride,
      createdAt: farm.createdAt,
      updatedAt: farm.updatedAt,
    };
  }

  /**
   * Occupation rate = chicks placed in the open bands / capacity × 100, with
   * the `taux_occupation` formula in force (null without a capacity).
   */
  private async occupation(farm: Farm) {
    const row: { placed: string | null } | undefined = await this.dataSource
      .getRepository(ProductionBatch)
      .createQueryBuilder('b')
      .select('COALESCE(SUM(b.quantity_at_start), 0)', 'placed')
      .where('b.farm_id = :id', { id: farm.id })
      .andWhere('b.status IN (:...open)', {
        open: [BatchStatus.ACTIF, BatchStatus.EN_VENTE],
      })
      .getRawOne();
    const chicksPlaced = Number(row?.placed ?? 0);
    const expression =
      (await this.parameters.get<string>(
        formulaParameterKey('taux_occupation'),
      )) ?? FALLBACK_OCCUPATION_FORMULA;
    let ratePct: number | null = null;
    try {
      ratePct = evaluateFormula(
        parseFormula(expression, POUFA_BASE_VARIABLE_NAMES),
        {
          mis_en_place: chicksPlaced,
          capacite_places: farm.capacityPlaces,
        },
      );
    } catch {
      // A formula built on other indicators can't be evaluated from these two values.
      ratePct = null;
    }
    return {
      chicksPlaced,
      capacityPlaces: farm.capacityPlaces,
      ratePct: ratePct === null ? null : Math.round(ratePct * 100) / 100,
    };
  }

  // ---------------------------------------------------------------------

  private async programmeFarm(
    programId: string,
    farmId: string,
  ): Promise<Farm> {
    const farm = await this.farms.findOne({ where: { id: farmId, programId } });
    if (!farm) throw new NotFoundException('Ferme du programme introuvable.');
    return farm;
  }

  private async lockedProgrammeFarm(
    em: EntityManager,
    programId: string,
    farmId: string,
  ): Promise<Farm> {
    const farm = await em.getRepository(Farm).findOne({
      where: { id: farmId, programId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!farm) throw new NotFoundException('Ferme du programme introuvable.');
    return farm;
  }

  private async labels(
    listType: ProgramListType,
  ): Promise<Map<string, string>> {
    const items = await this.lists.list(listType, true);
    return new Map(items.map((i) => [i.code, i.label]));
  }

  private async statusMap(): Promise<Map<string, RefItem>> {
    const items = await this.lists.list(ProgramListType.STATUT_FERME, true);
    return new Map(items.map((i) => [i.code, i]));
  }

  private statusView(farm: Farm, statuses: Map<string, RefItem>) {
    if (!farm.statusCode) return null;
    const item = statuses.get(farm.statusCode);
    return {
      code: farm.statusCode,
      label: item?.label ?? farm.statusCode,
      family: item?.family ?? null,
      since: farm.statusSince,
    };
  }
  // POUFA lot A2 divers (F13) ----------------------------------------------

  /**
   * Team accounts the exploitant created on a farm (`farm_employees`): what
   * the programme administrator sees (ADMINISTRATION:CONSULTER, farm in
   * scope). No salary or HR field, only the account and its access.
   */
  async teamOf(farmId: string) {
    const program = await this.programme.current();
    await this.programmeFarm(program.id, farmId);
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT e.id AS "employmentId", u.id AS "userId", u."fullName" AS "fullName",
              u.phone, e.role, e.permissions, e.active AS "linkActive",
              u.active AS "accountActive", e."createdAt" AS "createdAt"
         FROM farm_employees e JOIN users u ON u.id = e.user_id
        WHERE e.farm_id = $1
        ORDER BY u."fullName"`,
      [farmId],
    );
    return rows;
  }

  /**
   * Suspends (or restores) one team member's access to this farm
   * (ADMINISTRATION:ADMINISTRER): the farm link goes inactive, so every farm
   * route answers 403 to that account, as when the owner deactivates it.
   * The account itself and its other farms are untouched.
   */
  async setTeamMemberActive(
    user: AuthUser,
    farmId: string,
    employmentId: string,
    active: boolean,
  ) {
    const program = await this.programme.current();
    await this.programmeFarm(program.id, farmId);
    const link = await this.dataSource
      .getRepository(FarmEmployee)
      .findOne({ where: { id: employmentId, farmId } });
    if (!link) {
      throw new NotFoundException('Membre de l’équipe introuvable sur cette ferme.');
    }
    if (link.userId === user.id) {
      throw new ForbiddenException('Vous ne pouvez pas suspendre votre propre accès.');
    }
    link.active = active;
    await this.dataSource.getRepository(FarmEmployee).save(link);
    return { employmentId: link.id, userId: link.userId, active: link.active };
  }
}
