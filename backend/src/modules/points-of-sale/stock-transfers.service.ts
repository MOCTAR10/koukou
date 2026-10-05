import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { StockTransferProductType } from '../../common/enums/stock-transfer-product-type.enum.js';
import { StockTransferStatus } from '../../common/enums/stock-transfer-status.enum.js';
import { PointOfSaleKind } from '../../common/enums/point-of-sale-kind.enum.js';
import { SlaughterStatus } from '../../common/enums/slaughter-status.enum.js';
import { SlaughterType } from '../../common/enums/slaughter-type.enum.js';
import { InputKind } from '../../common/enums/input-kind.enum.js';
import { SaleItemProductType } from '../../common/enums/sale-item-type.enum.js';
import { SaleStatus } from '../../common/enums/sale-status.enum.js';
import { FeedUnit } from '../../common/enums/food-type.enum.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { FeedStockLoss } from '../feed-stock/entities/feed-stock-loss.entity.js';
import { FeedStockSale } from '../feed-stock/entities/feed-stock-sale.entity.js';
import { InputLot } from '../inputs/entities/input-lot.entity.js';
import { Sale } from '../finance/entities/sale.entity.js';
import { SaleItem } from '../finance/entities/sale-item.entity.js';
import { SlaughterOrder } from '../slaughter/entities/slaughter-order.entity.js';
import { CreateStockTransferDto } from './dto/stock-transfer.dto.js';
import { StockTransfer } from './entities/stock-transfer.entity.js';
import { PointOfSale } from './entities/point-of-sale.entity.js';

const EGGS_PER_ALVEOL = 30;

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

@Injectable()
export class StockTransfersService {
  constructor(
    @InjectRepository(StockTransfer)
    private readonly repo: Repository<StockTransfer>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly farmsService: FarmsService,
  ) {}

  /** Liste les transferts de la ferme (filtrable par boutique / type de produit). */
  async list(
    user: AuthUser,
    farmId: string,
    pointOfSaleId?: string,
    productType?: StockTransferProductType,
  ): Promise<StockTransfer[]> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.repo.find({
      where: {
        farmId,
        ...(pointOfSaleId ? { pointOfSaleId } : {}),
        ...(productType ? { productType } : {}),
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Déplace du stock de la ferme (point FERME) vers une boutique active.
   * Le stock source est décrémenté (ou réservé) à la création, et la vente en
   * boutique puise ensuite dans la réserve du transfert (quantitySold).
   */
  async create(
    user: AuthUser,
    farmId: string,
    dto: CreateStockTransferDto,
  ): Promise<StockTransfer> {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    const id = await this.dataSource.transaction(async (em) => {
      const pos = await em.getRepository(PointOfSale).findOne({
        where: { id: dto.pointOfSaleId, farmId },
      });
      if (!pos) {
        throw new BadRequestException(
          'Point de vente introuvable dans cette ferme.',
        );
      }
      if (pos.kind !== PointOfSaleKind.BOUTIQUE) {
        throw new BadRequestException(
          'Seule une boutique (point de vente externe) peut recevoir un transfert : la ferme vend directement son stock.',
        );
      }
      if (pos.isActive === false) {
        throw new BadRequestException(
          'Point de vente inactif (boutique désactivée).',
        );
      }
      const sourcePos = await em.getRepository(PointOfSale).findOne({
        where: { farmId, kind: PointOfSaleKind.FERME },
      });
      if (!sourcePos) {
        throw new BadRequestException(
          'Aucun point « ferme » dans cette exploitation : créez-le avant tout transfert.',
        );
      }

      let slaughterOrderId: string | null = null;
      let batchId: string | null = null;
      let inputLotId: string | null = null;
      let unit: string | null = null;

      if (dto.productType === StockTransferProductType.ABATTU) {
        if (!dto.slaughterOrderId) {
          throw new BadRequestException(
            'Transfert de carcasses : indiquer l’ordre d’abattage source.',
          );
        }
        const order = await em
          .getRepository(SlaughterOrder)
          .createQueryBuilder('o')
          .setLock('pessimistic_write')
          .where('o.id = :id', { id: dto.slaughterOrderId })
          .andWhere('o.farm_id = :farmId', { farmId })
          .getOne();
        if (!order) {
          throw new BadRequestException(
            'Ordre d’abattage introuvable dans cette ferme (source carcasse).',
          );
        }
        if (order.status !== SlaughterStatus.PROCESSED) {
          throw new BadRequestException(
            'Cet ordre d’abattage doit être traité (PROCESSED) avant tout transfert de carcasses.',
          );
        }
        if (order.slaughterType !== SlaughterType.ABATTU) {
          throw new BadRequestException(
            'Cet ordre d’abattage est « vivant » : aucune carcasse à transférer.',
          );
        }
        if (order.carcassesAvailable < dto.quantity) {
          throw new BadRequestException(
            `Carcasses insuffisantes : ${order.carcassesAvailable} carcasse(s) disponible(s) sur cet ordre, transfert demandé ${dto.quantity}.`,
          );
        }
        order.carcassesAvailable -= dto.quantity;
        await em.getRepository(SlaughterOrder).save(order);
        slaughterOrderId = order.id;
        batchId = order.batchId;
        unit = 'PIECE';
      } else if (dto.productType === StockTransferProductType.OEUFS) {
        if (!dto.batchId) {
          throw new BadRequestException(
            'Transfert d’œufs : indiquer le lot de pondeuses d’origine.',
          );
        }
        const batch = await em.getRepository(ProductionBatch).findOne({
          where: { id: dto.batchId, farmId },
        });
        if (!batch) {
          throw new BadRequestException(
            'Lot de production introuvable dans cette ferme.',
          );
        }
        await this.assertEggsAvailable(em, farmId, dto.quantity);
        batchId = batch.id;
        unit = 'ALVEOLES';
      } else {
        // PROVENDE
        if (!dto.inputLotId) {
          throw new BadRequestException(
            'Transfert de provende : indiquer le lot d’intrant alimentaire d’origine.',
          );
        }
        if (dto.unit !== FeedUnit.SAC && dto.unit !== FeedUnit.KG) {
          throw new BadRequestException(
            'Pour la provende, l’unité doit être SAC ou KG.',
          );
        }
        const lot = await em
          .getRepository(InputLot)
          .createQueryBuilder('l')
          .setLock('pessimistic_write')
          .where('l.id = :id', { id: dto.inputLotId })
          .andWhere('l.farm_id = :farmId', { farmId })
          .getOne();
        if (!lot || lot.kind !== InputKind.ALIMENT) {
          throw new BadRequestException(
            'Lot d’intrant alimentaire introuvable dans cette ferme (catégorie ALIMENT uniquement).',
          );
        }
        const sacKg = farm.defaultSacKg ?? 50;
        const quantityKg =
          dto.unit === FeedUnit.SAC ? dto.quantity * sacKg : dto.quantity;
        const availableKg = await this.feedAvailableKg(em, lot, sacKg);
if (quantityKg > availableKg + 1e-6) {
          throw new BadRequestException(
            `Stock d'aliment insuffisant sur ce lot : disponible ${round2(Math.max(0, availableKg))} kg, transfert demandé ${round2(quantityKg)} kg.`,
          );
        }
        lot.quantity -= dto.quantity;
        await em.getRepository(InputLot).save(lot);
        inputLotId = lot.id;
        batchId = lot.batchId ?? null;
        unit = dto.unit;
      }

      const transfer = await em.getRepository(StockTransfer).save(
        em.getRepository(StockTransfer).create({
          farmId,
          productType: dto.productType,
          sourcePosId: sourcePos.id,
          pointOfSaleId: pos.id,
          slaughterOrderId,
          batchId,
          inputLotId,
          unit,
          quantity: dto.quantity,
          quantitySold: 0,
          status: StockTransferStatus.TRANSFERRED,
          createdById: user.id,
        }),
      );
      return transfer.id;
    });
    return this.mustGet(farmId, id);
  }

  /**
   * Annule un transfert : les invendus reviennent au stock source de la ferme
   * (pool d'abattage, réserve d'œufs ou lot d'intrant), transfert marqué
   * CANCELLED. C'est la mécanique de « retour boutique → ferme ».
   */
  async cancel(
    user: AuthUser,
    farmId: string,
    transferId: string,
  ): Promise<StockTransfer> {
    await this.farmsService.assertAccessible(user, farmId);
    await this.dataSource.transaction(async (em) => {
      const transfer = await em
        .getRepository(StockTransfer)
        .createQueryBuilder('t')
        .setLock('pessimistic_write')
        .where('t.id = :id', { id: transferId })
        .andWhere('t.farm_id = :farmId', { farmId })
        .getOne();
      if (!transfer) {
        throw new NotFoundException('Transfert introuvable dans cette ferme.');
      }
      if (transfer.status !== StockTransferStatus.TRANSFERRED) {
        throw new BadRequestException('Ce transfert est déjà annulé.');
      }

      const remaining = transfer.quantity - transfer.quantitySold;
      if (remaining > 0) {
        if (
          transfer.productType === StockTransferProductType.ABATTU &&
          transfer.slaughterOrderId
        ) {
          const order = await em
            .getRepository(SlaughterOrder)
            .createQueryBuilder('o')
            .setLock('pessimistic_write')
            .where('o.id = :id', { id: transfer.slaughterOrderId })
            .andWhere('o.farm_id = :farmId', { farmId })
            .getOne();
          if (!order) {
            throw new BadRequestException(
              'Ordre d’abattage source introuvable (transfert orphelin).',
            );
          }
          order.carcassesAvailable += remaining;
          await em.getRepository(SlaughterOrder).save(order);
        } else if (
          transfer.productType === StockTransferProductType.PROVENDE &&
          transfer.inputLotId
        ) {
          const lot = await em
            .getRepository(InputLot)
            .createQueryBuilder('l')
            .setLock('pessimistic_write')
            .where('l.id = :id', { id: transfer.inputLotId })
            .andWhere('l.farm_id = :farmId', { farmId })
            .getOne();
          if (!lot) {
            throw new BadRequestException(
              'Lot d’intrant source introuvable (transfert orphelin).',
            );
          }
          lot.quantity += remaining;
          await em.getRepository(InputLot).save(lot);
        }
        // OEUFS : la réserve est dérivée — l'annulation libère simplement les alvéoles.
      }

      transfer.status = StockTransferStatus.CANCELLED;
      transfer.cancelledAt = new Date();
      await em.getRepository(StockTransfer).save(transfer);
    });
    return this.mustGet(farmId, transferId);
  }

  /** Garde de stock œufs (ferme entière) : produit − vendu − réservé transferts. */
  private async assertEggsAvailable(
    em: EntityManager,
    farmId: string,
    alveoles: number,
  ): Promise<void> {
    const farmBatches = await em.getRepository(ProductionBatch).find({
      where: { farmId },
    });
    let produced = 0;
    if (farmBatches.length > 0) {
      const entries = await em.getRepository(DailyEntry).find({
        where: { batchId: In(farmBatches.map((b) => b.id)) },
      });
      produced = entries.reduce(
        (s, e) =>
          s +
          (e.eggsCollected -
            e.eggsCracked -
            e.eggsSmall -
            e.eggsDoubleYolk -
            e.eggsDirty),
        0,
      );
    }
    const sales = await em.getRepository(Sale).find({
      where: { farmId, status: Not(SaleStatus.CANCELLED) },
    });
    let soldEggs = 0;
    if (sales.length > 0) {
      const eggItems = await em.getRepository(SaleItem).find({
        where: {
          saleId: In(sales.map((s) => s.id)),
          productType: SaleItemProductType.OEUFS,
        },
      });
      soldEggs = eggItems.reduce(
        (s, i) => s + i.quantity * EGGS_PER_ALVEOL,
        0,
      );
    }
    const transfers = await em.getRepository(StockTransfer).find({
      where: {
        farmId,
        productType: StockTransferProductType.OEUFS,
        status: StockTransferStatus.TRANSFERRED,
      },
    });
    const transferredEggs = transfers.reduce(
      (s, t) => s + (t.quantity - t.quantitySold) * EGGS_PER_ALVEOL,
      0,
    );
    const requestedEggs = alveoles * EGGS_PER_ALVEOL;
    const availableEggs = produced - soldEggs - transferredEggs;
    if (requestedEggs > availableEggs) {
      throw new BadRequestException(
        `Stock d’œufs insuffisant : ${Math.max(0, availableEggs)} œuf(s) disponible(s) (≈${Math.floor(
          Math.max(0, availableEggs) / EGGS_PER_ALVEOL,
        )} alvéoles), transfert demandé ${alveoles} alvéoles.`,
      );
    }
  }

  /** Kg d'aliment réellement disponibles sur un lot (réception − conso − pertes − ventes). */
  private async feedAvailableKg(
    em: EntityManager,
    lot: InputLot,
    sacKg: number,
  ): Promise<number> {
    const [entries, losses, feedSales] = await Promise.all([
      em.getRepository(DailyEntry).find({ where: { inputLotId: lot.id } }),
      em
        .getRepository(FeedStockLoss)
        .find({ where: { inputLotId: lot.id } }),
      em
        .getRepository(FeedStockSale)
        .find({ where: { inputLotId: lot.id } }),
    ]);
    const receivedKg =
      (lot.unit === 'KG' ? lot.quantity : lot.quantity * sacKg) || 0;
    const usedKg = entries.reduce((s, e) => s + e.feedQuantity, 0);
    const lostKg = losses.reduce((s, l) => s + l.quantityKg, 0);
    const soldKg = feedSales.reduce((s, x) => s + x.quantityKg, 0);
    return receivedKg - usedKg - lostKg - soldKg;
  }

  private async mustGet(
    farmId: string,
    transferId: string,
  ): Promise<StockTransfer> {
    const transfer = await this.repo.findOne({
      where: { id: transferId, farmId },
    });
    if (!transfer) {
      throw new NotFoundException('Transfert introuvable dans cette ferme.');
    }
    return transfer;
  }
}