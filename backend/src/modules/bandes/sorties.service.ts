import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import { SaleItemProductType } from '../../common/enums/sale-item-type.enum.js';
import { SlaughterDestination } from '../../common/enums/slaughter-destination.enum.js';
import { SlaughterType } from '../../common/enums/slaughter-type.enum.js';
import type { PermissionCode } from '../../common/permissions/permission-catalog.js';
import { isAfterTomorrowUtc } from '../../common/utils/date.utils.js';
import { BatchesService } from '../batches/batches.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { FlockReconciliationService } from '../batches/flock-reconciliation.service.js';
import { BandeStatsService } from '../batches/poufa/bande-stats.service.js';
import { FarmsService } from '../farms/farms.service.js';
import { Sale } from '../finance/entities/sale.entity.js';
import { SalesService } from '../finance/sales.service.js';
import { RefItem } from '../programme/entities/ref-item.entity.js';
import { SlaughterOrder } from '../slaughter/entities/slaughter-order.entity.js';
import { SlaughterService } from '../slaughter/slaughter.service.js';
import { SyncService } from '../sync/sync.service.js';
import { BandesService } from './bandes.service.js';
import { CreateSortieDto } from './dto/sortie.dto.js';
import {
  RETRAIT_FAMILIES,
  SORTIE_FAMILY,
  Sortie,
} from './entities/sortie.entity.js';

/**
 * Traceability hook (lot L7): called inside the sortie's transaction, so a
 * sortie to an operator can create the cession and its sub-lot atomically.
 * Bound to `TraceLotsService` (`BandesModule`); sorties work without it.
 */
export const SORTIE_CESSION_HOOK = Symbol('SORTIE_CESSION_HOOK');

export interface SortieCessionHook {
  /** Before the sortie is written: refuses an unusable operator (400). */
  beforeSortie?(
    em: EntityManager,
    farmId: string,
    operatorId: string | null,
  ): Promise<void>;
  onSortie(em: EntityManager, sortie: Sortie, reason: RefItem): Promise<void>;
}

export interface SortieView extends Sortie {
  reasonLabel: string | null;
  saleStatus: string | null;
  slaughterStatus: string | null;
}

/** Permission a family needs on top of `saisie:creer` (route guard). */
const FAMILY_PERMISSION: Partial<Record<string, PermissionCode>> = {
  [SORTIE_FAMILY.VENTE]: 'vente:creer',
  [SORTIE_FAMILY.ABATTOIR]: 'production:abattage',
};

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505'
  );
}

/**
 * Sorties of a POUFA band (CDC « Sorties d'animaux »): sorties ≤ present, a
 * sale creates the sale record, every write in one transaction with the band
 * projection.
 */
@Injectable()
export class SortiesService {
  constructor(
    private readonly bandes: BandesService,
    private readonly farms: FarmsService,
    private readonly sales: SalesService,
    private readonly slaughter: SlaughterService,
    private readonly batchesService: BatchesService,
    private readonly reconciliation: FlockReconciliationService,
    private readonly stats: BandeStatsService,
    private readonly sync: SyncService,
    @InjectRepository(Sortie)
    private readonly sorties: Repository<Sortie>,
    @InjectRepository(RefItem)
    private readonly refItems: Repository<RefItem>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional()
    @Inject(SORTIE_CESSION_HOOK)
    private readonly cessionHook?: SortieCessionHook,
  ) {}

  async create(
    user: AuthUser,
    farmId: string,
    batchId: string,
    dto: CreateSortieDto,
  ): Promise<SortieView> {
    const { farm, batch } = await this.bandes.load(user, farmId, batchId);
    if (dto.idempotencyKey) {
      const replay = await this.sorties.findOne({
        where: { farmId, idempotencyKey: dto.idempotencyKey },
      });
      if (replay) return (await this.views([replay]))[0];
    }
    const reason = await this.refItems.findOne({
      where: {
        programId: farm.programId,
        listType: ProgramListType.MOTIF_SORTIE,
        code: dto.reasonCode,
      },
    });
    if (!reason || !reason.active || !reason.family) {
      throw new BadRequestException(
        `Motif de sortie inconnu ou inactif : ${dto.reasonCode}.`,
      );
    }
    const family = reason.family;
    await this.assertFamilyPermission(user, farmId, family);
    const day = dto.sortieDate.slice(0, 10);
    if (isAfterTomorrowUtc(day)) {
      throw new BadRequestException(
        'La date de la sortie ne peut pas être dans le futur.',
      );
    }
    if (day < batch.integrationDate.slice(0, 10)) {
      throw new BadRequestException(
        `La sortie ne peut pas précéder l'ouverture de la bande (${batch.integrationDate.slice(0, 10)}).`,
      );
    }
    const priceUnit = dto.priceUnit ?? 'TETE';
    if (family === SORTIE_FAMILY.VENTE) {
      if (dto.unitPriceFcfa == null) {
        throw new BadRequestException(
          'Une sortie pour vente demande un prix unitaire.',
        );
      }
      if (priceUnit === 'KG' && dto.weightKg == null) {
        throw new BadRequestException(
          'Un prix au kg demande le poids des sujets sortis.',
        );
      }
    }

    let saved: Sortie;
    try {
      saved = await this.dataSource.transaction(async (em) => {
        const locked = await em
          .getRepository(ProductionBatch)
          .createQueryBuilder('batch')
          .setLock('pessimistic_write')
          .where('batch.id = :id', { id: batch.id })
          .getOne();
        if (!locked || locked.status === BatchStatus.CLOTURE) {
          throw new BadRequestException(
            'Bande clôturée : lecture seule, aucune sortie possible.',
          );
        }
        if (dto.count > locked.quantityAlive) {
          throw new BadRequestException(
            `Sortie impossible : ${dto.count} sujet(s) pour ${locked.quantityAlive} présent(s).`,
          );
        }
        await this.cessionHook?.beforeSortie?.(
          em,
          farmId,
          dto.operatorId ?? null,
        );
        const capture = await this.sync.capture(
          em,
          { programId: farm.programId, farmId, userId: user.id },
          dto,
        );
        const sortie = em.getRepository(Sortie).create({
          farmId,
          batchId: batch.id,
          sortieDate: day,
          count: dto.count,
          weightKg: dto.weightKg ?? null,
          reasonCode: reason.code,
          reasonFamily: family,
          recipientName: dto.recipientName?.trim() || null,
          recipientPhone: dto.recipientPhone?.trim() || null,
          operatorId: dto.operatorId ?? null,
          unitPriceFcfa: dto.unitPriceFcfa ?? null,
          priceUnit: family === SORTIE_FAMILY.VENTE ? priceUnit : null,
          notes: dto.notes?.trim() || null,
          idempotencyKey: dto.idempotencyKey ?? null,
          capturedAt: capture.capturedAt,
          clockCorrected: capture.corrected,
          createdById: user.id,
        });

        if (family === SORTIE_FAMILY.VENTE) {
          const { sale } = await this.sales.create(
            user,
            farmId,
            {
              saleDate: day,
              batchId: batch.id,
              customerName: sortie.recipientName ?? undefined,
              customerPhone: sortie.recipientPhone ?? undefined,
              items: [
                priceUnit === 'KG'
                  ? {
                      productType: SaleItemProductType.POULET_KG,
                      quantity: dto.weightKg!,
                      pieceCount: dto.count,
                      unitPriceFcfa: dto.unitPriceFcfa!,
                      batchId: batch.id,
                    }
                  : {
                      productType: SaleItemProductType.POULET_PIECE,
                      quantity: dto.count,
                      unitPriceFcfa: dto.unitPriceFcfa!,
                      batchId: batch.id,
                    },
              ],
            },
            { em },
          );
          sortie.saleId = sale.id;
        } else if (family === SORTIE_FAMILY.ABATTOIR) {
          const order = await this.slaughter.create(
            user,
            farmId,
            {
              batchId: batch.id,
              slaughterType: dto.slaughterType ?? SlaughterType.ABATTU,
              destination: dto.destination ?? SlaughterDestination.EXTERNE,
              plannedDate: day,
              birdCount: dto.count,
              totalWeightKg: dto.weightKg,
              abattoirNotes: sortie.recipientName
                ? `Sortie POUFA vers ${sortie.recipientName}`
                : 'Sortie POUFA',
            },
            { em },
          );
          sortie.slaughterOrderId = order.id;
        }
        const row = await em.getRepository(Sortie).save(sortie);
        if (RETRAIT_FAMILIES.includes(family)) {
          // The sortie itself is the removal.
          await this.reconciliation.recomputeLiveCount(em, batch.id);
        }
        await this.cessionHook?.onSortie(em, row, reason);
        await this.stats.refresh(em, batch.id);
        return row;
      });
    } catch (err) {
      if (dto.idempotencyKey && isUniqueViolation(err)) {
        const replay = await this.sorties.findOne({
          where: { farmId, idempotencyKey: dto.idempotencyKey },
        });
        if (replay) return (await this.views([replay]))[0];
      }
      throw err;
    }

    if (family === SORTIE_FAMILY.VENTE) {
      await this.sales.afterSaleCommitted(farmId, [batch.id]);
    } else {
      await this.batchesService.runAdvisoryForBatch(batch.id);
    }
    return (await this.views([saved]))[0];
  }

  async list(
    user: AuthUser,
    farmId: string,
    batchId: string,
  ): Promise<SortieView[]> {
    const { batch } = await this.bandes.load(user, farmId, batchId);
    const rows = await this.sorties.find({
      where: { batchId: batch.id },
      order: { sortieDate: 'ASC', createdAt: 'ASC' },
    });
    const views = await this.views(rows);
    // POUFA lot A droits: prices for economic readers only (audit F6).
    if (await this.farms.readsEconomics(user)) return views;
    return views.map((v) => ({ ...v, unitPriceFcfa: null }));
  }

  private async assertFamilyPermission(
    user: AuthUser,
    farmId: string,
    family: string,
  ): Promise<void> {
    const needed = FAMILY_PERMISSION[family];
    if (!needed) return;
    const rights = await this.farms.resolveEffectivePermissions(user, farmId);
    if (rights === 'ALL' || rights?.permissions.has(needed)) return;
    throw new ForbiddenException(
      `Permission manquante pour ce motif de sortie : ${needed}.`,
    );
  }

  private async views(rows: Sortie[]): Promise<SortieView[]> {
    const saleIds = rows.map((r) => r.saleId).filter((id) => id != null);
    const orderIds = rows
      .map((r) => r.slaughterOrderId)
      .filter((id) => id != null);
    const farmIds = [...new Set(rows.map((r) => r.farmId))];
    const [sales, orders, programs] = await Promise.all([
      saleIds.length
        ? this.dataSource.getRepository(Sale).find({ where: { id: In(saleIds) } })
        : Promise.resolve([] as Sale[]),
      orderIds.length
        ? this.dataSource
            .getRepository(SlaughterOrder)
            .find({ where: { id: In(orderIds) } })
        : Promise.resolve([] as SlaughterOrder[]),
      farmIds.length
        ? (this.dataSource.query(
            'SELECT DISTINCT program_id AS "programId" FROM farms WHERE id = ANY($1)',
            [farmIds],
          ) as Promise<{ programId: string }[]>)
        : Promise.resolve([]),
    ]);
    const items = programs.length
      ? await this.refItems.find({
          where: {
            programId: In(programs.map((p) => p.programId)),
            listType: ProgramListType.MOTIF_SORTIE,
          },
        })
      : [];
    const labels = new Map(items.map((i) => [i.code, i.label]));
    const saleStatus = new Map(sales.map((s) => [s.id, s.status]));
    const orderStatus = new Map(orders.map((o) => [o.id, o.status]));
    return rows.map((r) => ({
      ...r,
      reasonLabel: labels.get(r.reasonCode) ?? null,
      saleStatus: r.saleId ? (saleStatus.get(r.saleId) ?? null) : null,
      slaughterStatus: r.slaughterOrderId
        ? (orderStatus.get(r.slaughterOrderId) ?? null)
        : null,
    }));
  }
}
