import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { isUniqueViolation } from '../../common/utils/idempotency.js';
import { LocaliteKind } from '../../common/enums/localite-kind.enum.js';
import { localiteCode, localiteCounterScope } from './codes.js';
import { Localite } from './entities/localite.entity.js';
import { Province } from './entities/province.entity.js';
import { IdCounterService } from './id-counter.service.js';
import { ProgrammeService } from './programme.service.js';
import type {
  CreateLocaliteDto,
  UpdateLocaliteDto,
} from './dto/localite.dto.js';

export interface ProvinceView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly chefLieu: string;
  readonly sort: number;
  readonly hasGeometry: boolean;
  readonly localites: Localite[];
}

/** Provinces and localities of the current programme. */
@Injectable()
export class TerritoryService {
  constructor(
    private readonly programme: ProgrammeService,
    private readonly counters: IdCounterService,
    @InjectRepository(Province)
    private readonly provinces: Repository<Province>,
    @InjectRepository(Localite)
    private readonly localites: Repository<Localite>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Provinces with their localities (active only unless `includeInactive`), no geometry. */
  async listProvinces(includeInactive = false): Promise<ProvinceView[]> {
    const program = await this.programme.current();
    const provinces = await this.provinces.find({
      where: { programId: program.id },
      order: { sort: 'ASC' },
    });
    const withGeometry = new Set(
      (
        await this.provinces
          .createQueryBuilder('p')
          .select('p.id', 'id')
          .where('p.program_id = :id AND p.geometry IS NOT NULL', {
            id: program.id,
          })
          .getRawMany<{ id: string }>()
      ).map((r) => r.id),
    );
    const locs = provinces.length
      ? await this.localites
          .createQueryBuilder('l')
          .where('l.province_id IN (:...ids)', {
            ids: provinces.map((p) => p.id),
          })
          .andWhere(includeInactive ? 'TRUE' : 'l.active = TRUE')
          .orderBy('l.sort', 'ASC')
          .addOrderBy('l.name', 'ASC')
          .getMany()
      : [];
    return provinces.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      chefLieu: p.chefLieu,
      sort: p.sort,
      hasGeometry: withGeometry.has(p.id),
      localites: locs.filter((l) => l.provinceId === p.id),
    }));
  }

  /** @throws NotFoundException « Province inconnue » */
  async provinceByCode(code: string): Promise<Province> {
    const program = await this.programme.current();
    const province = await this.provinces.findOne({
      where: { programId: program.id, code },
    });
    if (!province) throw new NotFoundException(`Province inconnue : ${code}.`);
    return province;
  }

  /** Adds a locality; without a code, the next `G1-06`-style code is drawn. */
  async createLocalite(dto: CreateLocaliteDto): Promise<Localite> {
    const province = await this.provinceByCode(dto.provinceCode);
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(Localite);
      const code =
        dto.code ??
        localiteCode(
          province.code,
          await this.counters.next(localiteCounterScope(province.id), em),
        );
      if (await repo.exists({ where: { provinceId: province.id, code } })) {
        throw this.duplicate(code, province.code);
      }
      const max: { max: number | null } | undefined = await repo
        .createQueryBuilder('l')
        .select('MAX(l.sort)', 'max')
        .where('l.province_id = :id', { id: province.id })
        .getRawOne();
      return repo
        .save(
          repo.create({
            provinceId: province.id,
            code,
            name: dto.name.trim(),
            kind: dto.kind ?? LocaliteKind.AUTRE,
            chefLieu: dto.chefLieu?.trim() || null,
            active: true,
            sort: dto.sort ?? (max?.max ?? 0) + 10,
          }),
        )
        .catch((e: unknown) => {
          if (isUniqueViolation(e)) throw this.duplicate(code, province.code);
          throw e;
        });
    });
  }

  /** Rename, reclassify, reorder or (de)activate a locality. */
  async updateLocalite(id: string, dto: UpdateLocaliteDto): Promise<Localite> {
    const program = await this.programme.current();
    const localite = await this.localites
      .createQueryBuilder('l')
      .innerJoin('l.province', 'p')
      .where('l.id = :id AND p.program_id = :programId', {
        id,
        programId: program.id,
      })
      .getOne();
    if (!localite) throw new NotFoundException('Localité introuvable.');
    if (dto.name !== undefined) localite.name = dto.name.trim();
    if (dto.kind !== undefined) localite.kind = dto.kind;
    if (dto.chefLieu !== undefined) {
      localite.chefLieu = dto.chefLieu?.trim() || null;
    }
    if (dto.active !== undefined) localite.active = dto.active;
    if (dto.sort !== undefined) localite.sort = dto.sort;
    return this.localites.save(localite);
  }

  private duplicate(code: string, provinceCode: string): ConflictException {
    return new ConflictException(
      `Le code de localité « ${code} » existe déjà dans la province ${provinceCode}.`,
    );
  }
}
