import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import { localiteCode, localiteCounterScope } from './codes.js';
import { DEFAULT_REF_LISTS } from './data/default-ref-lists.js';
import { GABON_PROVINCES } from './data/gabon-provinces.js';
import { Localite } from './entities/localite.entity.js';
import { ProgramParameter } from './entities/program-parameter.entity.js';
import { Program } from './entities/program.entity.js';
import { Province } from './entities/province.entity.js';
import { RefItem } from './entities/ref-item.entity.js';
import { IdCounterService } from './id-counter.service.js';
import { PARAMETER_CATALOG, seedReason } from './parameter-catalog.js';
import { DEFAULT_PROFILES } from '../access/data/default-profiles.js';
import { AccessProfile } from '../access/entities/access-profile.entity.js';
import { ProgrammeService } from './programme.service.js';

/** Known programmes; any other `PROGRAM_CODE` gets its code as name. */
const PROGRAM_DEFAULTS: Readonly<
  Record<string, { name: string; startDate: string }>
> = {
  // TODO(POUFA): confirm the official name and start date with the DGE.
  POUFA: { name: 'Programme POUFA', startDate: '2026-11-01' },
};

/**
 * Effective date of the seeded defaults: early enough to cover any fact,
 * including data taken over from before the programme started.
 */
export const SEED_VALID_FROM = new Date('2000-01-01T00:00:00Z');

/**
 * Seeds the configured programme (only when `PROGRAM_CODE` is set): the
 * programme row, Gabon's provinces and localities, the default lists and the
 * catalog's default parameters. Idempotent, one transaction under an advisory
 * lock (several instances may boot together); never overwrites an existing
 * row and never adds a parameter version once the key has one.
 */
@Injectable()
export class ProgrammeSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProgrammeSeedService.name);

  constructor(
    private readonly programme: ProgrammeService,
    private readonly counters: IdCounterService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const code = this.programme.configuredCode();
    if (!code) return;
    await this.seed(code);
  }

  async seed(code: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `programme-seed:${code}`,
      ]);
      const program = await this.seedProgram(em, code);
      await this.seedTerritory(em, program.id);
      await this.seedLists(em, program.id);
      await this.seedParameters(em, program.id);
      await this.seedAccessProfiles(em, program.id);
    });
    this.logger.log(`Programme ${code} : données initiales vérifiées.`);
  }

  private async seedProgram(em: EntityManager, code: string): Promise<Program> {
    const defaults = PROGRAM_DEFAULTS[code] ?? {
      name: code,
      startDate: new Date().toISOString().slice(0, 10),
    };
    await em
      .createQueryBuilder()
      .insert()
      .into(Program)
      .values({ code, name: defaults.name, startDate: defaults.startDate })
      .orIgnore()
      .execute();
    return em.getRepository(Program).findOneByOrFail({ code });
  }

  /** The seven institutional profiles (system: never overwritten once there). */
  private async seedAccessProfiles(em: EntityManager, programId: string) {
    await em
      .createQueryBuilder()
      .insert()
      .into(AccessProfile)
      .values(
        DEFAULT_PROFILES.map((p) => ({
          programId,
          code: p.code,
          label: p.label,
          scopeKind: p.scopeKind,
          matrix: p.matrix,
          system: true,
        })),
      )
      .orIgnore()
      .execute();
  }

  private async seedTerritory(em: EntityManager, programId: string) {
    await em
      .createQueryBuilder()
      .insert()
      .into(Province)
      .values(
        GABON_PROVINCES.map((p, i) => ({
          programId,
          code: p.code,
          name: p.name,
          chefLieu: p.chefLieu,
          sort: (i + 1) * 10,
        })),
      )
      .orIgnore()
      .execute();
    const provinces = await em.getRepository(Province).find({
      where: { programId },
    });
    for (const seed of GABON_PROVINCES) {
      const province = provinces.find((p) => p.code === seed.code);
      if (!province || seed.localites.length === 0) continue;
      await em
        .createQueryBuilder()
        .insert()
        .into(Localite)
        .values(
          seed.localites.map((l, i) => ({
            provinceId: province.id,
            code: localiteCode(seed.code, i + 1),
            name: l.name,
            kind: l.kind,
            chefLieu: l.chefLieu,
            sort: (i + 1) * 10,
          })),
        )
        .orIgnore()
        .execute();
      // Codes G1-01… are taken: localities added later continue after them.
      await this.counters.reserveUpTo(
        localiteCounterScope(province.id),
        seed.localites.length,
        em,
      );
    }
  }

  private async seedLists(em: EntityManager, programId: string) {
    const values = (
      Object.entries(DEFAULT_REF_LISTS) as [
        ProgramListType,
        (typeof DEFAULT_REF_LISTS)[ProgramListType],
      ][]
    ).flatMap(([listType, items]) =>
      items.map((item, i) => ({
        programId,
        listType,
        code: item.code,
        label: item.label,
        family: item.family ?? null,
        meta: item.meta ?? {},
        sort: (i + 1) * 10,
      })),
    );
    await em
      .createQueryBuilder()
      .insert()
      .into(RefItem)
      .values(values as QueryDeepPartialEntity<RefItem>[])
      .orIgnore()
      .execute();
  }

  private async seedParameters(em: EntityManager, programId: string) {
    const existing = new Set(
      (
        await em
          .getRepository(ProgramParameter)
          .createQueryBuilder('p')
          .select('DISTINCT p.key', 'key')
          .where('p.program_id = :programId', { programId })
          .getRawMany<{ key: string }>()
      ).map((r) => r.key),
    );
    const missing = PARAMETER_CATALOG.filter((d) => !existing.has(d.key));
    if (missing.length === 0) return;
    await em.getRepository(ProgramParameter).insert(
      missing.map((d): QueryDeepPartialEntity<ProgramParameter> => ({
        programId,
        key: d.key,
        // jsonb: TypeORM serializes any JSON value.
        value: d.defaultValue as QueryDeepPartialEntity<unknown>,
        ownerProfile: d.ownerProfile,
        validFrom: SEED_VALID_FROM,
        createdById: null,
        reason: seedReason(d),
      })),
    );
  }
}
