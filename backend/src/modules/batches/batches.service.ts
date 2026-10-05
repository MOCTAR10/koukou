import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AlertKind } from '../../common/enums/alert-level.enum.js';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import { ExpenseCategory } from '../../common/enums/expense-category.enum.js';
import { Species } from '../../common/enums/species.enum.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { FarmsService } from '../farms/farms.service.js';
import { BreedsService } from '../breeds/breeds.service.js';
import { AccountingService } from '../accounting/accounting.service.js';
import { Building } from '../buildings/entities/building.entity.js';
import { Expense } from '../finance/entities/expense.entity.js';
import { ProductionBatch } from './entities/production-batch.entity.js';
import { TypeHistoryEntry } from './entities/type-history-entry.entity.js';
import { CreateBatchDto } from './dto/create-batch.dto.js';
import { ChangeTypeDto } from './dto/change-type.dto.js';
import { UpdateBatchDto } from './dto/update-batch.dto.js';
import { MetricsService } from './metrics.service.js';
import { AdvisoryEngine } from './advisory.engine.js';
import { KOUKOU_EVENTS, koukouBus } from '../../common/utils/event-bus.js';

@Injectable()
export class BatchesService {
  constructor(
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    @InjectRepository(Building)
    private readonly buildingRepo: Repository<Building>,
    @InjectRepository(TypeHistoryEntry)
    private readonly historyRepo: Repository<TypeHistoryEntry>,
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    private readonly farmsService: FarmsService,
    private readonly breedsService: BreedsService,
    private readonly metricsService: MetricsService,
    private readonly advisoryEngine: AdvisoryEngine,
    private readonly alertsService: AlertsService,
    private readonly accountingService: AccountingService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    user: AuthUser,
    farmId: string,
    dto: CreateBatchDto,
  ): Promise<BatchWithMetrics> {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    let breedId: string | null = null;
    if (dto.breedId) {
      const breed = await this.breedsService.findById(dto.breedId);
      if (!breed) throw new BadRequestException('Souche introuvable.');
      breedId = breed.id;
    }
    let buildingId: string | null = null;
    let buildingArea = dto.buildingAreaM2 ?? farm.buildingAreaM2 ?? null;
    if (dto.buildingId) {
      const building = await this.buildingRepo.findOne({
        where: { id: dto.buildingId, farmId },
      });
      if (!building)
        throw new BadRequestException('Bâtiment introuvable dans cette ferme.');
      buildingId = building.id;
      if (building.buildingAreaM2 != null)
        buildingArea = building.buildingAreaM2;
    }
    const batch = this.batchRepo.create({
      farmId,
      breedId,
      buildingId,
      batchName: dto.batchName,
      integrationDate: dto.integrationDate,
      quantityAtStart: dto.quantityAtStart,
      quantityAlive: dto.quantityAlive ?? dto.quantityAtStart,
      type: dto.type,
      species: dto.species ?? Species.POULET,
      customSpecies: dto.species === Species.AUTRE ? (dto.customSpecies ?? null) : null,
      customBreed: dto.species === Species.AUTRE ? (dto.customBreed ?? null) : null,
      status: BatchStatus.ACTIF,
      buildingAreaM2: buildingArea,
      feedUnitSacKg: dto.feedUnitSacKg ?? farm.defaultSacKg,
      couvoirSupplier: dto.couvoirSupplier ?? null,
      chickLotNumber: dto.chickLotNumber ?? null,
      hatchDate: dto.hatchDate ?? null,
      chickUnitPriceFcfa: dto.chickUnitPriceFcfa ?? null,
    });
    await this.batchRepo.save(batch);
    await this.afterChange(user, farmId, batch);

    // Auto-create expense for chick purchase cost (ACHAT_POUSSINS)
    if (dto.chickUnitPriceFcfa && dto.chickUnitPriceFcfa > 0) {
      const totalFcfa = Math.round(dto.chickUnitPriceFcfa * dto.quantityAtStart);
      if (totalFcfa > 0) {
        await this.dataSource.transaction(async (em) => {
          const expense = await em.getRepository(Expense).save(
            em.getRepository(Expense).create({
              farmId,
              batchId: batch.id,
              expenseDate: dto.integrationDate,
              category: ExpenseCategory.ACHAT_POUSSINS,
              amountFcfa: totalFcfa,
              label: `Achat ${dto.quantityAtStart} poussins — ${dto.batchName}`,
              supplier: dto.couvoirSupplier ?? null,
              notes: `[Auto] Créé automatiquement lors de la création du lot ${dto.batchName}`,
              paidByCaisse: false,
              createdById: user.id,
            }),
          );
          await this.accountingService.post(em, {
            farmId,
            date: dto.integrationDate,
            label: `Achat poussins — ${dto.batchName}`,
            source: 'EXPENSE',
            sourceId: `expense:${expense.id}`,
            lines: [
              { account: '6010', debit: totalFcfa },
              { account: '401', credit: totalFcfa },
            ],
            operatorId: user.id,
          });
        });
      }
    }

    return this.findOne(user, farmId, batch.id);
  }

  async update(
    user: AuthUser,
    farmId: string,
    batchId: string,
    dto: UpdateBatchDto,
  ): Promise<BatchWithMetrics> {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.batchRepo.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch)
      throw new NotFoundException('Lot introuvable dans cette ferme.');
    if (batch.status === BatchStatus.CLOTURE) {
      throw new BadRequestException(
        'Un lot clôturé ne peut plus être modifié.',
      );
    }
    const prevBuildingId = batch.buildingId;
    if (dto.batchName !== undefined) batch.batchName = dto.batchName ?? null;
    if (dto.couvoirSupplier !== undefined)
      batch.couvoirSupplier = dto.couvoirSupplier ?? null;
    if (dto.chickLotNumber !== undefined)
      batch.chickLotNumber = dto.chickLotNumber ?? null;
    if (dto.hatchDate !== undefined) batch.hatchDate = dto.hatchDate ?? null;
    if (dto.chickUnitPriceFcfa !== undefined)
      batch.chickUnitPriceFcfa = dto.chickUnitPriceFcfa ?? null;
    if (dto.buildingAreaM2 !== undefined)
      batch.buildingAreaM2 = dto.buildingAreaM2 ?? null;
    if (dto.feedUnitSacKg !== undefined)
      batch.feedUnitSacKg = dto.feedUnitSacKg ?? null;
    if (dto.species !== undefined && dto.species !== null)
      batch.species = dto.species;
    if (dto.species !== undefined) {
      if (dto.species === Species.AUTRE) {
        if (dto.customSpecies !== undefined)
          batch.customSpecies = dto.customSpecies !== null && dto.customSpecies.trim() ? dto.customSpecies : null;
        if (dto.customBreed !== undefined)
          batch.customBreed = dto.customBreed !== null && dto.customBreed.trim() ? dto.customBreed : null;
      } else {
        batch.customSpecies = null;
        batch.customBreed = null;
      }
    } else {
      if (dto.customSpecies !== undefined)
        batch.customSpecies = dto.customSpecies;
      if (dto.customBreed !== undefined)
        batch.customBreed = dto.customBreed;
    }
    if (dto.buildingId !== undefined) {
      if (dto.buildingId) {
        const building = await this.buildingRepo.findOne({
          where: { id: dto.buildingId, farmId },
        });
        if (!building)
          throw new BadRequestException(
            'Bâtiment introuvable dans cette ferme.',
          );
        batch.buildingId = building.id;
        if (building.buildingAreaM2 != null)
          batch.buildingAreaM2 = building.buildingAreaM2;
      } else {
        batch.buildingId = null;
      }
    }
    await this.batchRepo.save(batch);
    await this.afterChange(user, farmId, batch);
    if (prevBuildingId && prevBuildingId !== batch.buildingId) {
      await this.advisoryEngine.clearBuildingAlerts(farmId, prevBuildingId);
    }
    return this.findOne(user, farmId, batchId);
  }

  async findAll(
    user: AuthUser,
    farmId: string,
    asOf?: string,
  ): Promise<BatchWithMetrics[]> {
    await this.farmsService.assertAccessible(user, farmId);
    const batches = await this.batchRepo.find({
      where: { farmId },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(batches.map((b) => this.withMetrics(b, asOf)));
  }

  async findOne(
    user: AuthUser,
    farmId: string,
    batchId: string,
    asOf?: string,
  ): Promise<BatchWithMetrics> {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.batchRepo.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch)
      throw new NotFoundException('Lot introuvable dans cette ferme.');
    return this.withMetrics(batch, asOf);
  }

  async changeType(
    user: AuthUser,
    farmId: string,
    batchId: string,
    dto: ChangeTypeDto,
  ): Promise<BatchWithMetrics> {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.batchRepo.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch)
      throw new NotFoundException('Lot introuvable dans cette ferme.');
    if (batch.status === BatchStatus.CLOTURE) {
      throw new BadRequestException(
        'Un lot clôturé ne peut plus changer de type.',
      );
    }

    if (batch.type !== dto.toType) {
      await this.historyRepo.save(
        this.historyRepo.create({
          batchId,
          fromType: batch.type,
          toType: dto.toType,
          changedOn: dto.changedOn,
          reason: dto.reason ?? null,
        }),
      );
      batch.type = dto.toType;
      await this.batchRepo.save(batch);
    }
    await this.afterChange(user, farmId, batch);
    return this.findOne(user, farmId, batchId);
  }

  async enterSale(user: AuthUser, farmId: string, batchId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.batchRepo.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch)
      throw new NotFoundException('Lot introuvable dans cette ferme.');
    if (batch.status === BatchStatus.CLOTURE) {
      throw new BadRequestException(
        'Un lot clôturé ne peut pas repasser en vente.',
      );
    }
    batch.status = BatchStatus.EN_VENTE;
    await this.batchRepo.save(batch);
    await this.afterChange(user, farmId, batch);
    return this.findOne(user, farmId, batchId);
  }

  async close(user: AuthUser, farmId: string, batchId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.batchRepo.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch)
      throw new NotFoundException('Lot introuvable dans cette ferme.');
    batch.status = BatchStatus.CLOTURE;
    await this.batchRepo.save(batch);
    await this.afterChange(user, farmId, batch);
    // Lot clos : les suspensions de commercialisation et soins planifiés n'ont
    // plus de sens — on purge les alertes PROPHYLAXIE / DELAI_ATTENTE du lot.
    await Promise.all([
      this.alertsService.clearKind(farmId, batch.id, AlertKind.PROPHYLAXIE),
      this.alertsService.clearKind(farmId, batch.id, AlertKind.DELAI_ATTENTE),
    ]);
    koukouBus.emit(KOUKOU_EVENTS.BATCH_CLOSED, { farmId, batchId });
    return this.findOne(user, farmId, batchId);
  }

  private async afterChange(
    _user: AuthUser,
    _farmId: string,
    batch: ProductionBatch,
  ) {
    const metrics = await this.metricsService.compute(batch);
    batch.lastComputedFcr = metrics.fcr ?? 0;
    if (metrics.readyForSale && batch.readyForSaleAt == null) {
      batch.readyForSaleAt = new Date().toISOString().slice(0, 10);
    }
    batch.saleReadinessChecked = metrics.readyForSale || batch.saleReadinessChecked;
    await this.batchRepo.save(batch);
    await this.advisoryEngine.runForBatch(batch, metrics);
  }

  async runAdvisoryForBatch(batchId: string) {
    const batch = await this.batchRepo.findOne({ where: { id: batchId } });
    if (!batch) return;
    const metrics = await this.metricsService.compute(batch);
    await this.advisoryEngine.runForBatch(batch, metrics);
  }

  private async withMetrics(
    batch: ProductionBatch,
    asOf?: string,
  ): Promise<BatchWithMetrics> {
    const metrics = await this.metricsService.compute(
      batch,
      asOf ? { asOf } : undefined,
    );
    return { ...batch, metrics };
  }
}

export type BatchWithMetrics = ProductionBatch & {
  metrics: import('./models/batch-metrics.model.js').BatchMetrics;
};
