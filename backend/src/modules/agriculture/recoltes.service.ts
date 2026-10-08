import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { RecolteUnit } from '../../common/enums/recolte-unit.enum.js';
import { SaleItemProductType } from '../../common/enums/sale-item-type.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { SaleItem } from '../finance/entities/sale-item.entity.js';
import { CreateRecolteDto } from './dto/create-recolte.dto.js';
import { Parcelle } from './entities/parcelle.entity.js';
import { Recolte } from './entities/recolte.entity.js';

/** Contenu du stock disponible (parcelle × unité) : déjà vendu, restant vendable. */
export interface ParcelleStock {
  parcelleId: string;
  parcelleName: string;
  cultureName: string | null;
  unit: RecolteUnit;
  harvested: number;
  sold: number;
  available: number;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class RecoltesService {
  constructor(
    @InjectRepository(Recolte)
    private readonly recolteRepo: Repository<Recolte>,
    private readonly farmsService: FarmsService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    user: AuthUser,
    farmId: string,
    dto: CreateRecolteDto,
  ): Promise<Recolte> {
    await this.farmsService.assertAccessible(user, farmId);
    const parcelle = await this.dataSource
      .getRepository(Parcelle)
      .findOne({ where: { id: dto.parcelleId, farmId } });
    if (!parcelle)
      throw new NotFoundException('Parcelle introuvable dans cette ferme.');
    if (dto.quantity <= 0) {
      throw new BadRequestException(
        'La quantité récoltée doit être strictement positive.',
      );
    }
    const recolte = this.recolteRepo.create({
      farmId,
      parcelleId: dto.parcelleId,
      harvestDate: dto.harvestDate ?? todayStr(),
      quantity: dto.quantity,
      unit: dto.unit,
      notes: dto.notes?.trim() ? dto.notes : null,
    });
    return this.recolteRepo.save(recolte);
  }

  async findAll(user: AuthUser, farmId: string): Promise<Recolte[]> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.recolteRepo.find({
      where: { farmId },
      order: { harvestDate: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * Stock disponible par (parcelle, unité) : Σ récolté − Σ vendu (articles
   * RECOLTE des ventes non annulées). C'est le stock « vendable » au POS Ferme.
   */
  async stock(user: AuthUser, farmId: string): Promise<ParcelleStock[]> {
    await this.farmsService.assertAccessible(user, farmId);
    const parcelles = await this.dataSource
      .getRepository(Parcelle)
      .find({ where: { farmId }, relations: { culture: true } });

    const harvested = await this.recolteRepo
      .createQueryBuilder('r')
      .select('r.parcelleId', 'parcelleId')
      .addSelect('r.unit', 'unit')
      .addSelect('SUM(r.quantity)', 'harvested')
      .where('r.farmId = :farmId', { farmId })
      .groupBy('r.parcelleId')
      .addGroupBy('r.unit')
      .getRawMany<{ parcelleId: string; unit: RecolteUnit; harvested: string }>();

    const sold = await this.soldRows(farmId);

    const byParcelle = new Map(parcelles.map((p) => [p.id, p]));
    const soldMap = new Map(
      sold.map((s) => [`${s.parcelleId}:${s.unit}`, Number(s.sold)]),
    );

    const stocks: ParcelleStock[] = [];
    for (const r of harvested) {
      const parcelle = byParcelle.get(r.parcelleId);
      if (!parcelle) continue;
      const soldQty = soldMap.get(`${r.parcelleId}:${r.unit}`) ?? 0;
      const harvestedQty = Number(r.harvested);
      stocks.push({
        parcelleId: parcelle.id,
        parcelleName: parcelle.name,
        cultureName: parcelle.culture?.name ?? null,
        unit: r.unit,
        harvested: harvestedQty,
        sold: soldQty,
        available: harvestedQty - soldQty,
      });
    }
    return stocks;
  }

  /** Quantités RECOLTE déjà vendues par (parcelle, unité), ventes non annulées. */
  private async soldRows(
    farmId: string,
  ): Promise<{ parcelleId: string; unit: string; sold: string }[]> {
    return this.dataSource
      .getRepository(SaleItem)
      .createQueryBuilder('i')
      .select('i.parcelleId', 'parcelleId')
      .addSelect('i.unit', 'unit')
      .addSelect('SUM(i.quantity)', 'sold')
      .innerJoin('i.sale', 's')
      .where('i.productType = :pt', { pt: SaleItemProductType.RECOLTE })
      .andWhere('s.farmId = :farmId', { farmId })
      .andWhere("s.status != 'CANCELLED'")
      .groupBy('i.parcelleId')
      .addGroupBy('i.unit')
      .getRawMany();
  }
}