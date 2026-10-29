import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AlertKind } from '../../common/enums/alert-level.enum.js';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import { AlertsService } from '../alerts/alerts.service.js';
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
    private readonly alertsService: AlertsService,
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
    const occupied = await this.batchRepo.count({
      where: { farmId, buildingId, status: Not(BatchStatus.CLOTURE) },
    });
    if (occupied > 0) {
      throw new BadRequestException(
        'Ce bâtiment abrite encore des lots en cours : déplacez-les ou clôturez-les avant de le supprimer.',
      );
    }
    await this.buildingRepo.remove(building);
    // No later evaluation can reach a deleted building: resolve its alerts now.
    for (const kind of [
      AlertKind.DENSITE_BATIMENT,
      AlertKind.COHABITATION,
      AlertKind.VIDE_SANITAIRE,
    ]) {
      await this.alertsService.clearKind(farmId, null, kind, buildingId);
    }
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

  /** End day (UTC) of the last closed lot: the vide sanitaire starts there. */
  async lastLotEndedAt(buildingId: string): Promise<string | null> {
    const row: { ended: string | null } | undefined = await this.batchRepo
      .createQueryBuilder('b')
      .select(
        `TO_CHAR(MAX(COALESCE(b.closedAt, b.updatedAt)) AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        'ended',
      )
      .where('b.buildingId = :buildingId', { buildingId })
      .andWhere('b.status = :closed', { closed: BatchStatus.CLOTURE })
      .getRawOne();
    return row?.ended ?? null;
  }

  async withStats(
    building: Building,
  ): Promise<Building & { stats: BuildingStats }> {
    const [{ activeBirds, activeLots }, lastLotEndedAt] = await Promise.all([
      this.buildingOccupancy(building.id),
      this.lastLotEndedAt(building.id),
    ]);
    const area = building.buildingAreaM2;
    return {
      ...building,
      stats: {
        activeBirds,
        activeLots,
        densityPerM2: area != null && area > 0 ? activeBirds / area : null,
        lastLotEndedAt,
      },
    };
  }
}

export interface BuildingStats {
  activeBirds: number;
  activeLots: number;
  densityPerM2: number | null;
  /** End of the last closed lot (YYYY-MM-DD), null if none. */
  lastLotEndedAt: string | null;
}
