import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { Building } from './entities/building.entity.js';
import { CreateBuildingDto } from './dto/create-building.dto.js';
import { UpdateBuildingDto } from './dto/update-building.dto.js';

@Injectable()
export class BuildingsService {
  constructor(
    @InjectRepository(Building)
    private readonly buildingRepo: Repository<Building>,
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    private readonly farmsService: FarmsService,
  ) {}

  async create(
    user: AuthUser,
    farmId: string,
    dto: CreateBuildingDto,
  ): Promise<Building> {
    await this.farmsService.assertAccessible(user, farmId);
    const building = this.buildingRepo.create({
      farmId,
      name: dto.name,
      buildingAreaM2: dto.buildingAreaM2 ?? null,
      capacity: dto.capacity ?? null,
      lastVideSanitaireAt: dto.lastVideSanitaireAt ?? null,
      longitude: dto.longitude ?? null,
      latitude: dto.latitude ?? null,
    });
    return this.buildingRepo.save(building);
  }

  async findAll(
    user: AuthUser,
    farmId: string,
  ): Promise<(Building & { stats: BuildingStats })[]> {
    await this.farmsService.assertAccessible(user, farmId);
    const buildings = await this.buildingRepo.find({
      where: { farmId },
      order: { createdAt: 'ASC' },
    });
    return Promise.all(buildings.map((b) => this.withStats(b)));
  }

  async findOne(user: AuthUser, farmId: string, buildingId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    const building = await this.buildingRepo.findOne({
      where: { id: buildingId, farmId },
    });
    if (!building)
      throw new NotFoundException('Bâtiment introuvable dans cette ferme.');
    return this.withStats(building);
  }

  async update(
    user: AuthUser,
    farmId: string,
    buildingId: string,
    dto: UpdateBuildingDto,
  ) {
    await this.farmsService.assertAccessible(user, farmId);
    const building = await this.buildingRepo.findOne({
      where: { id: buildingId, farmId },
    });
    if (!building)
      throw new NotFoundException('Bâtiment introuvable dans cette ferme.');
    if (dto.name !== undefined) building.name = dto.name;
    if (dto.buildingAreaM2 !== undefined)
      building.buildingAreaM2 = dto.buildingAreaM2 ?? null;
    if (dto.capacity !== undefined) building.capacity = dto.capacity ?? null;
    if (dto.lastVideSanitaireAt !== undefined)
      building.lastVideSanitaireAt = dto.lastVideSanitaireAt ?? null;
    if (dto.longitude !== undefined) building.longitude = dto.longitude ?? null;
    if (dto.latitude !== undefined) building.latitude = dto.latitude ?? null;
    await this.buildingRepo.save(building);
    return this.withStats(building);
  }

  async remove(user: AuthUser, farmId: string, buildingId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    const building = await this.buildingRepo.findOne({
      where: { id: buildingId, farmId },
    });
    if (!building)
      throw new NotFoundException('Bâtiment introuvable dans cette ferme.');
    await this.buildingRepo.remove(building);
    return { deleted: true };
  }

  /** Densité au niveau bâtiment : somme des oiseaux vivants des lots non clôturés / surface. */
  async buildingOccupancy(buildingId: string): Promise<{
    activeBirds: number;
    activeLots: number;
  }> {
    const rows = await this.batchRepo
      .createQueryBuilder('b')
      .select([
        'b.quantityAlive AS quantity_alive',
        'b.buildingAreaM2 AS building_area_m2',
        'b.integrationDate AS integration_date',
      ])
      .where('b.buildingId = :buildingId', { buildingId })
      .andWhere('b.status != :closed', { closed: BatchStatus.CLOTURE })
      .getRawMany();
    const activeBirds = rows.reduce(
      (sum, r) => sum + Number(r.quantity_alive ?? 0),
      0,
    );
    return { activeBirds, activeLots: rows.length };
  }

  async withStats(
    building: Building,
  ): Promise<Building & { stats: BuildingStats }> {
    const { activeBirds, activeLots } = await this.buildingOccupancy(
      building.id,
    );
    const area = building.buildingAreaM2;
    return {
      ...building,
      stats: {
        activeBirds,
        activeLots,
        densityPerM2: area != null && area > 0 ? activeBirds / area : null,
      },
    };
  }
}

export interface BuildingStats {
  activeBirds: number;
  activeLots: number;
  densityPerM2: number | null;
}
