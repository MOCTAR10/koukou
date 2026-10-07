import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { FarmsService } from '../farms/farms.service.js';
import { SpatialService } from '../spatial/spatial.service.js';
import { CreateParcelleDto } from './dto/create-parcelle.dto.js';
import { UpdateParcelleDto } from './dto/update-parcelle.dto.js';
import { Parcelle } from './entities/parcelle.entity.js';

@Injectable()
export class ParcellesService {
  constructor(
    @InjectRepository(Parcelle)
    private readonly parcelleRepo: Repository<Parcelle>,
    private readonly farmsService: FarmsService,
    private readonly spatialService: SpatialService,
  ) {}

  async create(
    user: AuthUser,
    farmId: string,
    dto: CreateParcelleDto,
  ): Promise<Parcelle> {
    await this.farmsService.assertAccessible(user, farmId);
    const areaHa = await this.resolveArea(dto.areaHa, dto.boundaryGeoJson);
    const parcelle = this.parcelleRepo.create({
      farmId,
      name: dto.name,
      cultureId: dto.cultureId,
      areaHa: areaHa ?? 0,
      boundaryGeoJson: dto.boundaryGeoJson ?? null,
      plantedAt: dto.plantedAt ?? null,
      status: dto.status,
      notes: dto.notes?.trim() ? dto.notes : null,
    });
    return this.parcelleRepo.save(parcelle);
  }

  async findAll(
    user: AuthUser,
    farmId: string,
  ): Promise<(Parcelle & { areaM2: number | null })[]> {
    await this.farmsService.assertAccessible(user, farmId);
    const parcelles = await this.parcelleRepo.find({
      where: { farmId },
      order: { createdAt: 'ASC' },
    });
    return parcelles.map((p) => ({
      ...p,
      areaM2: p.areaHa != null ? Math.round(p.areaHa * 10_000) : null,
    }));
  }

  async findOne(user: AuthUser, farmId: string, parcelleId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    const parcelle = await this.parcelleRepo.findOne({
      where: { id: parcelleId, farmId },
    });
    if (!parcelle)
      throw new NotFoundException('Parcelle introuvable dans cette ferme.');
    return {
      ...parcelle,
      areaM2: parcelle.areaHa != null ? Math.round(parcelle.areaHa * 10_000) : null,
    };
  }

  async update(
    user: AuthUser,
    farmId: string,
    parcelleId: string,
    dto: UpdateParcelleDto,
  ) {
    await this.farmsService.assertAccessible(user, farmId);
    const parcelle = await this.parcelleRepo.findOne({
      where: { id: parcelleId, farmId },
    });
    if (!parcelle)
      throw new NotFoundException('Parcelle introuvable dans cette ferme.');
    if (dto.name !== undefined) parcelle.name = dto.name;
    if (dto.cultureId !== undefined) parcelle.cultureId = dto.cultureId;
    if (dto.boundaryGeoJson !== undefined)
      parcelle.boundaryGeoJson = dto.boundaryGeoJson ?? null;
    if (dto.plantedAt !== undefined) parcelle.plantedAt = dto.plantedAt ?? null;
    if (dto.status !== undefined) parcelle.status = dto.status;
    if (dto.notes !== undefined)
      parcelle.notes = dto.notes?.trim() ? dto.notes : null;
    if (dto.areaHa !== undefined) {
      const resolved = await this.resolveArea(
        dto.areaHa,
        parcelle.boundaryGeoJson,
      );
      if (resolved !== null) parcelle.areaHa = resolved;
    }
    await this.parcelleRepo.save(parcelle);
    return {
      ...parcelle,
      areaM2: parcelle.areaHa != null ? Math.round(parcelle.areaHa * 10_000) : null,
    };
  }

  async remove(user: AuthUser, farmId: string, parcelleId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    const parcelle = await this.parcelleRepo.findOne({
      where: { id: parcelleId, farmId },
    });
    if (!parcelle)
      throw new NotFoundException('Parcelle introuvable dans cette ferme.');
    await this.parcelleRepo.remove(parcelle);
    return { deleted: true };
  }

  /** Surface en ha : priorité au calcul PostGIS sur le contour fourni, sinon valeur saisie. */
  private async resolveArea(
    inputAreaHa: number | undefined,
    boundaryGeoJson: CreateParcelleDto['boundaryGeoJson'] | null,
  ): Promise<number | null> {
    if (boundaryGeoJson) {
      const computed = await this.spatialService.areaHa(boundaryGeoJson);
      if (computed != null && computed > 0) return computed;
    }
    return inputAreaHa ?? null;
  }
}