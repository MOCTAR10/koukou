import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DataSource, In, Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import {
  BiosecurityAnswer,
  BiosecurityClass,
  VisitType,
} from '../../common/enums/visit.enum.js';
import { isAfterTomorrowUtc } from '../../common/utils/date.utils.js';
import { createOnce } from '../../common/utils/idempotency.js';
import { scopeReachesFarms } from '../access/access-rules.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import {
  FarmsService,
  hasImageSignature,
  uploadsRoot,
  type UploadedImageFile,
} from '../farms/farms.service.js';
import { ParametersService } from '../programme/parameters.service.js';
import { RefListsService } from '../programme/ref-lists.service.js';
import { User } from '../users/entities/user.entity.js';
import type {
  CreateVisitDto,
  ListProgrammeVisitsQueryDto,
} from './dto/visit.dto.js';
import { FarmVisitAnswer } from './entities/farm-visit-answer.entity.js';
import { FarmVisitPhoto } from './entities/farm-visit-photo.entity.js';
import { FarmVisit } from './entities/farm-visit.entity.js';
import {
  biosecurityClass,
  biosecurityScore,
  criterionCategory,
  criterionWeight,
  visitRefusal,
  type BiosecurityThresholds,
  type GridCriterion,
} from './visit-rules.js';

export const THRESHOLD_A_KEY = 'BIOSECURITE_SEUIL_A_PCT';
export const THRESHOLD_B_KEY = 'BIOSECURITE_SEUIL_B_PCT';

/** Photos of a visit, sent after its text (same rules as declaration photos). */
export const VISIT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const VISIT_PHOTOS_MAX = 8;
const PHOTO_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

/** Directory of a farm's visit photos (never served statically). */
export function visitPhotosDir(farmId: string): string {
  return join(uploadsRoot(), 'visits', farmId);
}

export interface VisitPhotoView {
  id: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface VisitAnswerView {
  criterionCode: string;
  label: string;
  category: string | null;
  weight: number;
  answer: BiosecurityAnswer;
  comment: string | null;
}

export interface VisitView {
  id: string;
  farmId: string;
  farmCode: string | null;
  farmName: string | null;
  provinceCode: string | null;
  batchId: string | null;
  batchCode: string | null;
  visitDate: string;
  type: VisitType;
  agent: { id: string; name: string };
  observations: string | null;
  recommendations: string | null;
  latitude: number | null;
  longitude: number | null;
  nextVisitDate: string | null;
  visaFrom: string | null;
  visaTo: string | null;
  scorePct: number | null;
  classification: BiosecurityClass | null;
  thresholds: { a: number; b: number } | null;
  capturedAt: string | null;
  createdAt: string;
  answers: VisitAnswerView[];
  photos: VisitPhotoView[];
}

export interface VisitGrid {
  criteria: GridCriterion[];
  thresholds: BiosecurityThresholds;
}

const dayOf = (d: Date | string) =>
  typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);

/**
 * Technical visits and biosecurity controls (CDC n° 45, n° 27, §3.2 visa).
 * Rights are the matrix's (controllers): this service only checks the farm is
 * reachable by the caller. The grid is the CRITERE_BIOSECURITE list (managed
 * by the veterinary services), the class thresholds are catalog parameters.
 */
@Injectable()
export class VisitsService {
  constructor(
    @InjectRepository(FarmVisit) private readonly visits: Repository<FarmVisit>,
    @InjectRepository(FarmVisitAnswer)
    private readonly answers: Repository<FarmVisitAnswer>,
    @InjectRepository(FarmVisitPhoto)
    private readonly photoRepo: Repository<FarmVisitPhoto>,
    @InjectRepository(ProductionBatch)
    private readonly bands: Repository<ProductionBatch>,
    private readonly dataSource: DataSource,
    private readonly farms: FarmsService,
    private readonly scope: ScopeResolver,
    private readonly lists: RefListsService,
    private readonly parameters: ParametersService,
  ) {}

  /** Thresholds in force at the end of `day` (default now). */
  async thresholds(day?: string): Promise<BiosecurityThresholds> {
    const at = day ? new Date(`${day.slice(0, 10)}T23:59:59.999Z`) : new Date();
    const [a, b] = await Promise.all([
      this.parameters.get<number>(THRESHOLD_A_KEY, at),
      this.parameters.get<number>(THRESHOLD_B_KEY, at),
    ]);
    return { a: a ?? 80, b: b ?? 60 };
  }

  /** The grid in force (active criteria) and the class thresholds. */
  async grid(user: AuthUser, farmId: string): Promise<VisitGrid> {
    await this.farms.assertAccessible(user, farmId);
    const items = await this.lists.list(ProgramListType.CRITERE_BIOSECURITE);
    return {
      criteria: items.map((i) => ({
        code: i.code,
        label: i.label,
        category: criterionCategory(i.meta),
        weight: criterionWeight(i.meta),
      })),
      thresholds: await this.thresholds(),
    };
  }

  async create(
    user: AuthUser,
    farmId: string,
    dto: CreateVisitDto,
  ): Promise<VisitView> {
    const farm = await this.farms.assertAccessible(user, farmId);
    if (isAfterTomorrowUtc(dto.visitDate)) {
      throw new BadRequestException('La visite ne peut pas être datée du futur.');
    }
    let band: ProductionBatch | null = null;
    if (dto.batchId) {
      band = await this.bands.findOne({
        where: { id: dto.batchId, farmId: farm.id },
      });
      if (!band) {
        throw new BadRequestException('Bande introuvable dans cette ferme.');
      }
    }
    const refusal = visitRefusal({
      visitDate: dto.visitDate,
      hasBand: !!band,
      visaFrom: dto.visaFrom,
      visaTo: dto.visaTo,
      nextVisitDate: dto.nextVisitDate,
      bandStart: band?.integrationDate ?? null,
      bandEnd: band?.closedAt ? dayOf(band.closedAt) : null,
    });
    if (refusal) throw new BadRequestException(refusal);
    if ((dto.latitude == null) !== (dto.longitude == null)) {
      throw new BadRequestException(
        'La latitude et la longitude vont ensemble.',
      );
    }
    const answers = dto.answers ?? [];
    const codes = answers.map((a) => a.criterionCode);
    if (new Set(codes).size !== codes.length) {
      throw new BadRequestException('Un critère est répondu deux fois.');
    }
    if (dto.type === VisitType.BIOSECURITE) {
      if (!answers.some((a) => a.answer !== BiosecurityAnswer.NA)) {
        throw new BadRequestException(
          'Un contrôle de biosécurité évalue au moins un critère de la grille.',
        );
      }
    }
    // Inactive criteria are accepted: an offline visit may carry a grid that
    // an administrator changed since.
    const items = await this.lists.list(
      ProgramListType.CRITERE_BIOSECURITE,
      true,
    );
    const byCode = new Map(items.map((i) => [i.code, i]));
    const unknown = codes.filter((c) => !byCode.has(c));
    if (unknown.length) {
      throw new BadRequestException(
        `Critère(s) inconnu(s) de la grille de biosécurité : ${unknown.join(', ')}.`,
      );
    }
    const rows = answers.map((a) => {
      const item = byCode.get(a.criterionCode)!;
      return {
        criterionCode: item.code,
        criterionLabel: item.label,
        criterionCategory: criterionCategory(item.meta),
        weight: criterionWeight(item.meta),
        answer: a.answer,
        comment: a.comment?.trim() || null,
      };
    });
    const scorePct = biosecurityScore(rows);
    const thresholds = scorePct == null ? null : await this.thresholds(dto.visitDate);
    const classification =
      thresholds == null ? null : biosecurityClass(scorePct, thresholds);

    const visit = await createOnce(
      this.visits,
      farm.id,
      dto.idempotencyKey,
      () =>
        this.dataSource.transaction(async (em) => {
          const saved = await em.getRepository(FarmVisit).save(
            em.getRepository(FarmVisit).create({
              farmId: farm.id,
              batchId: band?.id ?? null,
              visitDate: dayOf(dto.visitDate),
              type: dto.type,
              agentUserId: user.id,
              observations: dto.observations?.trim() || null,
              recommendations: dto.recommendations?.trim() || null,
              latitude: dto.latitude ?? null,
              longitude: dto.longitude ?? null,
              nextVisitDate: dto.nextVisitDate
                ? dayOf(dto.nextVisitDate)
                : null,
              visaFrom: dto.visaFrom ? dayOf(dto.visaFrom) : null,
              visaTo: dto.visaTo ? dayOf(dto.visaTo) : null,
              scorePct,
              classification,
              thresholds,
              capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : null,
              idempotencyKey: dto.idempotencyKey ?? null,
            }),
          );
          if (rows.length) {
            await em
              .getRepository(FarmVisitAnswer)
              .save(
                rows.map((r) =>
                  em
                    .getRepository(FarmVisitAnswer)
                    .create({ ...r, visitId: saved.id }),
                ),
              );
          }
          return saved;
        }),
    );
    return (await this.views([visit]))[0];
  }

  async listForFarm(user: AuthUser, farmId: string): Promise<VisitView[]> {
    await this.farms.assertAccessible(user, farmId);
    const rows = await this.visits.find({
      where: { farmId },
      order: { visitDate: 'DESC', createdAt: 'DESC' },
      take: 500,
    });
    return this.views(rows, false);
  }

  async getForFarm(
    user: AuthUser,
    farmId: string,
    id: string,
  ): Promise<VisitView> {
    await this.farms.assertAccessible(user, farmId);
    const visit = await this.visits.findOne({ where: { id, farmId } });
    if (!visit) throw new NotFoundException('Visite introuvable dans cette ferme.');
    return (await this.views([visit]))[0];
  }

  /** Programme list, filtered in SQL by the caller's scope. */
  async listProgramme(user: AuthUser, query: ListProgrammeVisitsQueryDto) {
    const access = this.scope.isInstitution(user)
      ? await this.scope.requireAccess(user)
      : null;
    if (access && !scopeReachesFarms(access.scopeKind)) {
      throw new ForbiddenException(
        'Accès refusé : votre profil ne donne accès à aucune ferme.',
      );
    }
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const qb = this.visits
      .createQueryBuilder('v')
      .innerJoin('v.farm', 'f')
      .leftJoin('f.province', 'p');
    if (access) this.scope.applyFarmScope(qb, 'f', access);
    if (query.province) {
      qb.andWhere('UPPER(p.code) = UPPER(:province)', {
        province: query.province.trim(),
      });
    }
    if (query.classification) {
      qb.andWhere('v.classification = :cl', { cl: query.classification });
    }
    if (query.type) qb.andWhere('v.type = :type', { type: query.type });
    if (query.farmId) qb.andWhere('v.farm_id = :farmId', { farmId: query.farmId });
    if (query.from) qb.andWhere('v.visit_date >= :from', { from: dayOf(query.from) });
    if (query.to) qb.andWhere('v.visit_date <= :to', { to: dayOf(query.to) });
    const [rows, total] = await qb
      .orderBy('v.visitDate', 'DESC')
      .addOrderBy('v.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { total, page, pageSize, items: await this.views(rows, false) };
  }

  // ---------- Photos of a visit ----------

  private photoView(p: FarmVisitPhoto): VisitPhotoView {
    return {
      id: p.id,
      mimeType: p.mimeType,
      sizeBytes: p.sizeBytes,
      createdAt: p.createdAt.toISOString(),
    };
  }

  /**
   * Adds a photo to a visit (multipart, after its text). Only the agent who
   * recorded the visit adds photos to it (the visit itself never changes);
   * PNG, JPEG or WEBP checked on the file bytes; the same file sent again
   * (offline retry) returns the photo already stored.
   */
  async addPhoto(
    user: AuthUser,
    farmId: string,
    visitId: string,
    file: UploadedImageFile | undefined,
  ): Promise<VisitPhotoView> {
    const visit = await this.assertVisit(user, farmId, visitId);
    if (visit.agentUserId !== user.id) {
      throw new ForbiddenException(
        'Seul l’agent qui a enregistré la visite peut y joindre des photos.',
      );
    }
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu (champ « file »).');
    }
    const extension = PHOTO_EXTENSIONS[file.mimetype];
    if (!extension) {
      throw new BadRequestException(
        'Format de photo non supporté. Utilisez un fichier PNG, JPEG ou WEBP.',
      );
    }
    if (file.size === 0 || file.buffer.length === 0) {
      throw new BadRequestException('La photo est vide.');
    }
    if (file.size > VISIT_PHOTO_MAX_BYTES) {
      throw new BadRequestException('Une photo ne doit pas dépasser 5 Mo.');
    }
    if (!hasImageSignature(file.buffer, extension)) {
      throw new BadRequestException(
        'Le fichier n’est pas une image PNG, JPEG ou WEBP valide.',
      );
    }
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const same = await this.photoRepo.findOne({
      where: { visitId: visit.id, sha256 },
    });
    if (same) return this.photoView(same);
    const count = await this.photoRepo.count({ where: { visitId: visit.id } });
    if (count >= VISIT_PHOTOS_MAX) {
      throw new BadRequestException(
        `${VISIT_PHOTOS_MAX} photos au plus par visite.`,
      );
    }
    const id = randomUUID();
    const fileName = `${id}.${extension}`;
    const dir = visitPhotosDir(farmId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, fileName), file.buffer);
    try {
      const photo = await this.photoRepo.save(
        this.photoRepo.create({
          id,
          visitId: visit.id,
          farmId,
          fileName,
          mimeType: extension === 'jpg' ? 'image/jpeg' : `image/${extension}`,
          sizeBytes: file.buffer.length,
          sha256,
          createdById: user.id,
        }),
      );
      return this.photoView(photo);
    } catch (err) {
      await unlink(join(dir, fileName)).catch(() => undefined);
      const winner = await this.photoRepo.findOne({
        where: { visitId: visit.id, sha256 },
      });
      if (winner) return this.photoView(winner);
      throw err;
    }
  }

  /** The photo bytes, with the same access as the visit. */
  async photoFile(
    user: AuthUser,
    farmId: string,
    visitId: string,
    photoId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    await this.assertVisit(user, farmId, visitId);
    const photo = await this.photoRepo.findOne({
      where: { id: photoId, visitId, farmId },
    });
    if (!photo) throw new NotFoundException('Photo introuvable.');
    const buffer = await readFile(
      join(visitPhotosDir(farmId), photo.fileName),
    ).catch(() => null);
    if (!buffer) throw new NotFoundException('Fichier de la photo introuvable.');
    return { buffer, mimeType: photo.mimeType, fileName: photo.fileName };
  }

  private async assertVisit(
    user: AuthUser,
    farmId: string,
    visitId: string,
  ): Promise<FarmVisit> {
    await this.farms.assertAccessible(user, farmId);
    const visit = await this.visits.findOne({ where: { id: visitId, farmId } });
    if (!visit) throw new NotFoundException('Visite introuvable dans cette ferme.');
    return visit;
  }

  /** Adds farm, band, agent and (optionally) the grid answers. */
  private async views(
    rows: FarmVisit[],
    withAnswers = true,
  ): Promise<VisitView[]> {
    if (rows.length === 0) return [];
    const farmIds = [...new Set(rows.map((r) => r.farmId))];
    const bandIds = [...new Set(rows.map((r) => r.batchId).filter((v) => v))];
    const agentIds = [...new Set(rows.map((r) => r.agentUserId))];
    const [farms, bands, agents, answers, photos] = await Promise.all([
      this.dataSource.query(
        `SELECT f.id, f.code, f.name, p.code AS "provinceCode"
           FROM farms f LEFT JOIN provinces p ON p.id = f.province_id
          WHERE f.id = ANY($1)`,
        [farmIds],
      ) as Promise<
        { id: string; code: string | null; name: string; provinceCode: string | null }[]
      >,
      bandIds.length
        ? this.bands.find({
            where: { id: In(bandIds as string[]) },
            select: { id: true, code: true },
          })
        : Promise.resolve([] as ProductionBatch[]),
      this.dataSource
        .getRepository(User)
        .find({ where: { id: In(agentIds) }, select: { id: true, fullName: true } }),
      withAnswers
        ? this.answers.find({
            where: { visitId: In(rows.map((r) => r.id)) },
            order: { criterionCategory: 'ASC', criterionLabel: 'ASC' },
          })
        : Promise.resolve([] as FarmVisitAnswer[]),
      withAnswers
        ? this.photoRepo.find({
            where: { visitId: In(rows.map((r) => r.id)) },
            order: { createdAt: 'ASC' },
          })
        : Promise.resolve([] as FarmVisitPhoto[]),
    ]);
    const farmOf = new Map(farms.map((f) => [f.id, f]));
    const bandCode = new Map(bands.map((b) => [b.id, b.code]));
    const agentName = new Map(agents.map((a) => [a.id, a.fullName]));
    return rows.map((r) => {
      const farm = farmOf.get(r.farmId);
      return {
        id: r.id,
        farmId: r.farmId,
        farmCode: farm?.code ?? null,
        farmName: farm?.name ?? null,
        provinceCode: farm?.provinceCode ?? null,
        batchId: r.batchId,
        batchCode: r.batchId ? (bandCode.get(r.batchId) ?? null) : null,
        visitDate: dayOf(r.visitDate),
        type: r.type,
        agent: { id: r.agentUserId, name: agentName.get(r.agentUserId) ?? '—' },
        observations: r.observations,
        recommendations: r.recommendations,
        latitude: r.latitude,
        longitude: r.longitude,
        nextVisitDate: r.nextVisitDate ? dayOf(r.nextVisitDate) : null,
        visaFrom: r.visaFrom ? dayOf(r.visaFrom) : null,
        visaTo: r.visaTo ? dayOf(r.visaTo) : null,
        scorePct: r.scorePct,
        classification: r.classification,
        thresholds: r.thresholds,
        capturedAt: r.capturedAt ? r.capturedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        answers: answers
          .filter((a) => a.visitId === r.id)
          .map((a) => ({
            criterionCode: a.criterionCode,
            label: a.criterionLabel,
            category: a.criterionCategory,
            weight: a.weight,
            answer: a.answer,
            comment: a.comment,
          })),
        photos: photos
          .filter((p) => p.visitId === r.id)
          .map((p) => this.photoView(p)),
      };
    });
  }
}
