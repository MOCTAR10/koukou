import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  BordereauData,
  PasseportData,
  PdfService,
} from '../../common/services/pdf.service.js';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { BatchStatus, BatchType } from '../../common/enums/batch-type.enum.js';
import { Species } from '../../common/enums/species.enum.js';
import { SlaughterDestination } from '../../common/enums/slaughter-destination.enum.js';
import { SlaughterStatus } from '../../common/enums/slaughter-status.enum.js';
import { SlaughterType } from '../../common/enums/slaughter-type.enum.js';
import { Alert } from '../alerts/entities/alert.entity.js';
import { sanitaryHolds } from '../sanitary/sanitary-holds.js';
import { MetricsService } from '../batches/metrics.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import {
  batchReservation,
  sentSlaughterBirds,
} from '../orders/order-reservations.js';
import {
  CancelSlaughterOrderDto,
  CreateSlaughterOrderDto,
  ProcessSlaughterOrderDto,
  SendSlaughterOrderDto,
  UpdateSlaughterOrderDto,
} from './dto/slaughter.dto.js';
import { SlaughterOrder } from './entities/slaughter-order.entity.js';
// POUFA lot A2 divers (F4): a processed order to an abattoir cedes the lot.
import { SaleCessionService } from '../trace/sale-cession.service.js';
import { BandeStatsService } from '../batches/poufa/bande-stats.service.js';
import { FlockReconciliationService } from '../batches/flock-reconciliation.service.js';
import { passportIndicatorRows } from '../indicators/indicator-headline.js';
import {
  OFFICIAL_BAND_INDICATORS,
  type OfficialBandIndicatorsPort,
} from '../indicators/official-band-indicators.port.js';
import type { OfficialIndicator } from '../indicators/official-indicators.js';
import { todayLocal } from '../../common/utils/date.utils.js';

// Préfixe codé en dur (même convention que VTE pour les ventes — pas de compteur séparé).
const SLAUGHTER_PREFIX = 'ABT';

const TYPE_LABELS: Record<SlaughterType, string> = {
  VIVANT: 'Vivant (sur pied)',
  ABATTU: 'Abattu',
};

const DESTINATION_LABELS: Record<SlaughterDestination, string> = {
  INTERNE: 'Abattoir interne (ferme)',
  EXTERNE: 'Abattoir externe',
};

const BATCH_TYPE_LABELS: Record<BatchType, string> = {
  CHAIR: 'Chair',
  PONDEUSE: 'Pondeuse',
};

const SPECIES_LABELS: Record<Species, string> = {
  POULET: 'Poulet',
  DINDE: 'Dinde',
  PINTADE: 'Pintade',
  CAILLE: 'Caille',
  CANARD: 'Canard',
  OIE: 'Oie',
  FAISAN: 'Faisan',
  AUTRE: 'Autre',
};

const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  ACTIF: 'Actif',
  EN_VENTE: 'En vente',
  FINI: 'Fini',
  CLOTURE: 'Clôturé',
};

function dateLabel(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

@Injectable()
export class SlaughterService {
  constructor(
    @InjectRepository(SlaughterOrder)
    private readonly orderRepo: Repository<SlaughterOrder>,
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    private readonly farmsService: FarmsService,
    private readonly metricsService: MetricsService,
    private readonly pdfService: PdfService,
    private readonly dataSource: DataSource,
    private readonly bandeStats: BandeStatsService,
    private readonly reconciliation: FlockReconciliationService,
    private readonly moduleRef: ModuleRef,
    private readonly cessions: SaleCessionService,
  ) {}

  private readonly logger = new Logger(SlaughterService.name);

  /**
   * The order comes from a POUFA ABATTOIR sortie: its birds left the band at
   * the sortie (CDC « effectif = mis en place − morts − sorties »), so sending
   * or processing it changes the headcount no more, and cancelling it gives
   * the birds back.
   */
  private async fromSortie(em: EntityManager, orderId: string): Promise<boolean> {
    const rows: unknown[] = await em.query(
      'SELECT 1 FROM sorties WHERE slaughter_order_id = $1 LIMIT 1',
      [orderId],
    );
    return rows.length > 0;
  }

  /**
   * With `opts.em` the order is created inside the caller's transaction (a
   * POUFA sortie) and returned as saved.
   */
  async create(
    user: AuthUser,
    farmId: string,
    dto: CreateSlaughterOrderDto,
    opts?: { em?: EntityManager },
  ) {
    await this.farmsService.assertAccessible(user, farmId);
    const batchRepo = opts?.em
      ? opts.em.getRepository(ProductionBatch)
      : this.batchRepo;
    const orderRepo = opts?.em
      ? opts.em.getRepository(SlaughterOrder)
      : this.orderRepo;
    const batch = await batchRepo.findOne({
      where: { id: dto.batchId, farmId },
    });
    if (!batch)
      throw new BadRequestException(
        'Lot de production introuvable dans cette ferme.',
      );
    if (batch.status === BatchStatus.CLOTURE) {
      throw new BadRequestException(
        'Lot clôturé : impossible de créer un ordre d’abattage.',
      );
    }

    // A POUFA sortie (opts.em) already checked its operator (cession hook).
    if (dto.operatorId && !opts?.em) {
      await this.cessions.assertAbattoir(
        this.dataSource.manager,
        farmId,
        dto.operatorId,
        dto.destination,
      );
    }
    const order = orderRepo.create({
      farmId,
      batchId: batch.id,
      operatorId: dto.operatorId ?? null,
      referenceNumber: await this.nextReference(),
      slaughterType: dto.slaughterType,
      destination: dto.destination,
      plannedDate: dto.plannedDate,
      birdCount: dto.birdCount,
      totalWeightKg: dto.totalWeightKg ?? null,
      carcassWeightKg: dto.carcassWeightKg ?? null,
      abattoirLotCode: dto.abattoirLotCode ?? null,
      abattoirNotes: dto.abattoirNotes ?? null,
      status: SlaughterStatus.DRAFT,
      createdById: user.id,
    });
    this.refreshRendement(order);
    await orderRepo.save(order);
    if (opts?.em) return order;
    return this.getOne(user, farmId, order.id);
  }

  async list(
    user: AuthUser,
    farmId: string,
    page: { take?: number; skip?: number } = {},
  ): Promise<SlaughterOrder[]> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.orderRepo.find({
      where: { farmId },
      order: { createdAt: 'DESC', id: 'ASC' },
      ...page,
    });
  }

  async getOne(
    user: AuthUser,
    farmId: string,
    orderId: string,
  ): Promise<SlaughterOrder> {
    await this.farmsService.assertAccessible(user, farmId);
    const order = await this.orderRepo.findOne({
      where: { id: orderId, farmId },
    });
    if (!order)
      throw new NotFoundException(
        'Ordre d’abattage introuvable dans cette ferme.',
      );
    return order;
  }

  async update(
    user: AuthUser,
    farmId: string,
    orderId: string,
    dto: UpdateSlaughterOrderDto,
  ): Promise<SlaughterOrder> {
    await this.farmsService.assertAccessible(user, farmId);
    // Locked re-read: saving a stale copy would write an old status or
    // carcass count back over a concurrent process()/cancel().
    return this.dataSource.transaction(async (em) => {
      const order = await this.lockOrder(em, farmId, orderId);
      // Après traitement, seuls les champs de réception abattoir restent
      // modifiables (le code lot abattoir est saisissable à tout moment).
      if (order.status === SlaughterStatus.PROCESSED) {
        if (
          dto.slaughterType !== undefined ||
          dto.plannedDate !== undefined ||
          dto.birdCount !== undefined ||
          dto.totalWeightKg !== undefined ||
          dto.carcassWeightKg !== undefined
        ) {
          throw new BadRequestException(
            'Un ordre d’abattage traité ne peut plus être modifié (seul le code lot abattoir reste saisissable).',
          );
        }
      } else {
        this.assertMutable(order);
      }
      // The send checks (live count, reservations, sanitary holds) were
      // made for this bird count and type.
      if (
        order.status === SlaughterStatus.SENT &&
        ((dto.birdCount !== undefined && dto.birdCount !== order.birdCount) ||
          (dto.slaughterType !== undefined &&
            dto.slaughterType !== order.slaughterType))
      ) {
        throw new BadRequestException(
          'Ordre déjà envoyé à l’abattoir : le nombre d’oiseaux et le type ne sont plus modifiables (annulez puis recréez l’ordre).',
        );
      }
      if (
        dto.birdCount !== undefined &&
        dto.birdCount !== order.birdCount &&
        (await this.fromSortie(em, order.id))
      ) {
        throw new BadRequestException(
          'Ordre issu d’une sortie de bande : le nombre d’oiseaux suit la sortie (annulez l’ordre puis enregistrez une nouvelle sortie).',
        );
      }
      if (dto.operatorId !== undefined && dto.operatorId !== order.operatorId) {
        if (order.status === SlaughterStatus.PROCESSED) {
          throw new BadRequestException(
            'Ordre déjà traité : la cession à l’abattoir est faite, l’abattoir ne change plus.',
          );
        }
        if (dto.operatorId) {
          await this.cessions.assertAbattoir(
            em,
            farmId,
            dto.operatorId,
            order.destination,
          );
        }
        order.operatorId = dto.operatorId;
      }
      if (dto.slaughterType !== undefined)
        order.slaughterType = dto.slaughterType;
      if (dto.plannedDate !== undefined) order.plannedDate = dto.plannedDate;
      if (dto.birdCount !== undefined) order.birdCount = dto.birdCount;
      if (dto.totalWeightKg !== undefined)
        order.totalWeightKg = dto.totalWeightKg;
      if (dto.carcassWeightKg !== undefined)
        order.carcassWeightKg = dto.carcassWeightKg;
      this.refreshRendement(order);
      if (dto.abattoirLotCode !== undefined)
        order.abattoirLotCode = dto.abattoirLotCode;
      if (dto.abattoirNotes !== undefined)
        order.abattoirNotes = dto.abattoirNotes;
      await em.getRepository(SlaughterOrder).save(order);
      return order;
    });
  }

  async send(
    user: AuthUser,
    farmId: string,
    orderId: string,
    dto: SendSlaughterOrderDto,
  ): Promise<SlaughterOrder> {
    await this.farmsService.assertAccessible(user, farmId);
    const { batchId } = await this.getOne(user, farmId, orderId);
    return this.dataSource.transaction(async (em) => {
      // Same lock order as process(): batch, then order. The batch lock also
      // serializes the reservation check with order creation.
      const batch = await em
        .getRepository(ProductionBatch)
        .createQueryBuilder('batch')
        .setLock('pessimistic_write')
        .where('batch.id = :id', { id: batchId })
        .andWhere('batch.farm_id = :farmId', { farmId })
        .getOne();
      if (!batch) {
        throw new NotFoundException('Lot introuvable dans cette ferme.');
      }
      const order = await this.lockOrder(em, farmId, orderId);
      this.assertMutable(order);
      if (order.status === SlaughterStatus.SENT) {
        throw new BadRequestException(
          'Cet ordre d’abattage a déjà été envoyé à l’abattoir.',
        );
      }

      await this.assertLotEligibleForSend(em, order, batch);

      if (order.destination === SlaughterDestination.INTERNE) {
        order.internalBatchCode =
          dto.internalBatchCode ??
          order.internalBatchCode ??
          (await this.nextInternalCode());
      } else if (dto.abattoirLotCode !== undefined) {
        order.abattoirLotCode = dto.abattoirLotCode;
      }
      if (dto.abattoirNotes !== undefined)
        order.abattoirNotes = dto.abattoirNotes;
      order.status = SlaughterStatus.SENT;
      await em.getRepository(SlaughterOrder).save(order);
      return order;
    });
  }

  private async lockOrder(
    em: EntityManager,
    farmId: string,
    orderId: string,
  ): Promise<SlaughterOrder> {
    const order = await em
      .getRepository(SlaughterOrder)
      .createQueryBuilder('o')
      .setLock('pessimistic_write')
      .where('o.id = :id', { id: orderId })
      .andWhere('o.farm_id = :farmId', { farmId })
      .getOne();
    if (!order) {
      throw new NotFoundException(
        'Ordre d’abattage introuvable dans cette ferme.',
      );
    }
    return order;
  }

  async process(
    user: AuthUser,
    farmId: string,
    orderId: string,
    dto: ProcessSlaughterOrderDto,
  ): Promise<SlaughterOrder> {
    await this.farmsService.assertAccessible(user, farmId);
    let order = await this.getOne(user, farmId, orderId);
    if (order.status === SlaughterStatus.CANCELLED) {
      throw new BadRequestException('Un ordre annulé ne peut pas être traité.');
    }
    if (order.status === SlaughterStatus.PROCESSED) {
      throw new BadRequestException('Cet ordre d’abattage a déjà été traité.');
    }
    if (order.status !== SlaughterStatus.SENT) {
      throw new BadRequestException(
        'Un ordre d’abattage doit d’abord être envoyé (SENT) avant d’être traité.',
      );
    }

    // Synchronisation avec le cheptel : on ne peut abattre que les oiseaux
    // réellement présents sur le lot (verrou pessimiste, dans la transaction).
    return this.dataSource.transaction(async (em) => {
      // Ordre de verrouillage lot → ordre d'abattage, identique au POS
      // (ventes : lot puis pool de carcasses) pour éviter tout deadlock.
      const batch = await em
        .getRepository(ProductionBatch)
        .createQueryBuilder('batch')
        .setLock('pessimistic_write')
        .where('batch.id = :id', { id: order.batchId })
        .andWhere('batch.farm_id = :farmId', { farmId })
        .getOne();
      if (!batch) {
        throw new NotFoundException(
          'Ordre d’abattage introuvable dans cette ferme.',
        );
      }

      // Re-lecture de l'ordre sous verrou pessimiste : deux traitements
      // concurrents ne peuvent pas décrémenter le cheptel deux fois.
      const locked = await em
        .getRepository(SlaughterOrder)
        .createQueryBuilder('o')
        .setLock('pessimistic_write')
        .where('o.id = :id', { id: orderId })
        .andWhere('o.farm_id = :farmId', { farmId })
        .getOne();
      if (!locked) {
        throw new NotFoundException(
          'Ordre d’abattage introuvable dans cette ferme.',
        );
      }
      if (locked.status !== SlaughterStatus.SENT) {
        throw new BadRequestException(
          'Cet ordre d’abattage doit être envoyé (SENT) et n’avoir pas changé d’état depuis la demande : traitement refusé.',
        );
      }
      order = locked;
      // A sortie's birds already left the headcount: processing moves no
      // bird, so it stays possible once the sortie closed the band.
      const sortieBirds = await this.fromSortie(em, order.id);
      if (!sortieBirds) {
        if (batch.status === BatchStatus.CLOTURE) {
          throw new BadRequestException(
            'Lot clôturé : abattage impossible (immuabilité du lot et de son bilan).',
          );
        }
        if (order.birdCount > batch.quantityAlive) {
          throw new BadRequestException(
            `Cheptel insuffisant pour l'abattage : il reste ${batch.quantityAlive} oiseau(x) vivant(s) sur le lot, ordre de ${order.birdCount}.`,
          );
        }
        // Batch row is locked: a concurrent order creation waits for us.
        await this.assertNotReserved(em, order, batch, 'l’abattage');
        batch.quantityAlive -= order.birdCount;
        if (batch.quantityAlive <= 0) {
          batch.status = BatchStatus.FINI;
        }
        await em.getRepository(ProductionBatch).save(batch);
      }

      if (dto.abattoirLotCode !== undefined)
        order.abattoirLotCode = dto.abattoirLotCode;
      if (dto.abattoirNotes !== undefined)
        order.abattoirNotes = dto.abattoirNotes;
      if (dto.carcassWeightKg !== undefined)
        order.carcassWeightKg = dto.carcassWeightKg;
      this.refreshRendement(order);
      order.status = SlaughterStatus.PROCESSED;
      order.processedAt = new Date();
      // Un ordre « abattu » constitue un pool de carcasses vendables au POS abattu.
      if (order.slaughterType === SlaughterType.ABATTU) {
        order.carcassesAvailable = order.birdCount;
      }
      await em.getRepository(SlaughterOrder).save(order);
      // F4: the birds handed to an abattoir are ceded (sub-lot + QR), once.
      if (!sortieBirds) {
        await this.cessions.cedeSlaughterOrder(
          em,
          order,
          user.id,
          todayLocal(),
        );
      }
      // POUFA band projection, same transaction.
      if (batch.status !== BatchStatus.CLOTURE) {
        await this.bandeStats.refresh(em, batch.id);
      }
      return order;
    });
  }

  async cancel(
    user: AuthUser,
    farmId: string,
    orderId: string,
    dto?: CancelSlaughterOrderDto,
  ): Promise<SlaughterOrder> {
    await this.farmsService.assertAccessible(user, farmId);
    const { batchId } = await this.getOne(user, farmId, orderId);
    return this.dataSource.transaction(async (em) => {
      // Same lock order as send()/process(): batch, then order.
      const batch = await em
        .getRepository(ProductionBatch)
        .createQueryBuilder('batch')
        .setLock('pessimistic_write')
        .where('batch.id = :id', { id: batchId })
        .andWhere('batch.farm_id = :farmId', { farmId })
        .getOne();
      const order = await em
        .getRepository(SlaughterOrder)
        .createQueryBuilder('o')
        .setLock('pessimistic_write')
        .where('o.id = :id', { id: orderId })
        .andWhere('o.farm_id = :farmId', { farmId })
        .getOne();
      if (!order || !batch) {
        throw new NotFoundException(
          'Ordre d’abattage introuvable dans cette ferme.',
        );
      }
      this.assertMutable(order);
      const sortieBirds = await this.fromSortie(em, order.id);
      if (sortieBirds && batch.status === BatchStatus.CLOTURE) {
        throw new BadRequestException(
          'Bande clôturée : l’ordre issu d’une sortie ne peut plus être annulé, ses sujets ne peuvent pas revenir dans une bande clôturée (correction par un profil habilité).',
        );
      }
      if (dto?.reason) {
        const suffix = dto.reason.trim();
        order.abattoirNotes = order.abattoirNotes
          ? `${order.abattoirNotes} — Annulé : ${suffix}`
          : `Annulé : ${suffix}`;
      }
      order.status = SlaughterStatus.CANCELLED;
      await em.getRepository(SlaughterOrder).save(order);
      if (sortieBirds) {
        // The sortie's birds come back into the headcount.
        await this.reconciliation.recomputeLiveCount(em, batch.id);
        await this.bandeStats.refresh(em, batch.id);
      }
      return order;
    });
  }

  async generateBordereau(
    user: AuthUser,
    farmId: string,
    orderId: string,
  ): Promise<Buffer> {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    const order = await this.getOne(user, farmId, orderId);
    if (order.status === SlaughterStatus.CANCELLED) {
      throw new BadRequestException(
        'Impossible d’éditer un bordereau pour un ordre annulé.',
      );
    }
    const data: BordereauData = {
      farmName: farm.name,
      referenceNumber: order.referenceNumber,
      batchLabel: this.batchLabel(order.batch),
      slaughterTypeLabel: TYPE_LABELS[order.slaughterType],
      destinationLabel: DESTINATION_LABELS[order.destination],
      destination: order.destination,
      plannedDate: order.plannedDate,
      birdCount: order.birdCount,
      totalWeightKg: order.totalWeightKg,
      carcassWeightKg: order.carcassWeightKg,
      rendementPercent: order.rendementPercent,
      internalBatchCode: order.internalBatchCode,
      abattoirLotCode: order.abattoirLotCode,
      createdAtLabel: dateLabel(order.createdAt),
    };
    return this.pdfService.createBordereauPdf(data);
  }

  async generatePasseport(
    user: AuthUser,
    farmId: string,
    batchId: string,
  ): Promise<Buffer> {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.batchRepo.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch)
      throw new NotFoundException('Lot introuvable dans cette ferme.');

    const metrics = await this.metricsService.compute(batch);

    const holds = await sanitaryHolds(
      this.dataSource.manager,
      farmId,
      batch.id,
    );
    const delaiAttente = holds.withdrawalEndDate != null;
    const prophyEnRetard = holds.prophylaxisOverdue;

    const conformity = delaiAttente
      ? 'EN_ATTENTE'
      : prophyEnRetard
        ? 'PRECONFORMITE'
        : 'CONFORME';
    const conformityNote = delaiAttente
      ? 'Délai d’attente antibiotique en cours : la commercialisation est suspendue jusqu’à son expiration (sécurité alimentaire).'
      : prophyEnRetard
        ? 'Des soins planifiés sont en retard au calendrier : les régulariser avant l’abattage.'
        : 'Aucun délai d’attente en cours et soins à jour, d’après les saisies de l’élevage.';

    // Official indicators (programme formulas) first, Fermia's second.
    const metricRows: PasseportData['metrics'] = [
      { label: 'Âge', value: `${metrics.ageDays} j` },
      ...passportIndicatorRows(await this.officialIndicators(farm, batch), {
        mortalityPercent: metrics.mortalityPercent,
        fcr: metrics.fcr,
        gmqGramsPerDay: metrics.gmqGramsPerDay,
        ipe: metrics.ipe,
      }),
    ];

    const data: PasseportData = {
      farmName: farm.name,
      batchLabel: this.batchLabel(batch),
      breedName: batch.breed?.name ?? null,
      batchTypeLabel: BATCH_TYPE_LABELS[batch.type],
      speciesLabel: SPECIES_LABELS[batch.species] ?? batch.species,
      integrationDate: batch.integrationDate,
      quantityAtStart: batch.quantityAtStart,
      quantityAlive: batch.quantityAlive,
      couvoirSupplier: batch.couvoirSupplier,
      chickLotNumber: batch.chickLotNumber,
      hatchDate: batch.hatchDate,
      batchStatusLabel: BATCH_STATUS_LABELS[batch.status],
      conformity,
      conformityNote,
      metrics: metricRows,
      generatedAtLabel: dateLabel(new Date()),
    };
    return this.pdfService.createPasseportPdf(data);
  }

  /** The band's official indicators, or null when the set can't be computed. */
  private async officialIndicators(
    farm: Parameters<OfficialBandIndicatorsPort['compute']>[0],
    batch: ProductionBatch,
  ): Promise<OfficialIndicator[] | null> {
    try {
      const port = this.moduleRef.get<OfficialBandIndicatorsPort>(
        OFFICIAL_BAND_INDICATORS,
        { strict: false },
      );
      return (await port.compute(farm, batch)).indicators;
    } catch (err) {
      this.logger.warn(
        `Indicateurs officiels du lot ${batch.id} indisponibles : ${String(err)}`,
      );
      return null;
    }
  }

  private async assertLotEligibleForSend(
    em: EntityManager,
    order: SlaughterOrder,
    batch: ProductionBatch,
  ): Promise<void> {
    // A sortie's birds already left the band (checked at the sortie): the
    // band may even be closed by it, the order still goes to the abattoir.
    const sortieBirds = await this.fromSortie(em, order.id);
    if (!sortieBirds && batch.status === BatchStatus.CLOTURE) {
      throw new BadRequestException(
        'Lot clôturé : envoi à l’abattage impossible.',
      );
    }
    // Synchronisation du stock : on n'envoie que les oiseaux réellement
    // présents sur le lot (toutes les sorties doivent rester cohérentes).
    if (!sortieBirds && order.birdCount > batch.quantityAlive) {
      throw new BadRequestException(
        `Cheptel insuffisant pour l'envoi : il reste ${batch.quantityAlive} oiseau(x) vivant(s) sur le lot, ordre de ${order.birdCount}.`,
      );
    }
    // Under the batch lock (see send); process() re-checks it too.
    if (!sortieBirds) {
      await this.assertNotReserved(em, order, batch, 'l’envoi');
    }
    // Critères sanitaires (normes internationales) : pas de délai d'attente actif
    // et prophylaxie à jour avant de pouvoir envoyer un lot à l'abattage.
    const holds = await sanitaryHolds(
      em,
      order.farmId,
      order.batchId,
    );
    if (holds.withdrawalEndDate != null) {
      throw new BadRequestException(
        `Délai d’attente antibiotique en cours jusqu’au ${holds.withdrawalEndDate} : la commercialisation et l’envoi à l’abattage sont suspendus (sécurité alimentaire). Respecter le délai d’élimination avant de réessayer.`,
      );
    }
    if (holds.prophylaxisOverdue) {
      throw new BadRequestException(
        'Des soins prophylactiques sont en retard au calendrier sanitaire du lot : régulariser le programme de soins avant d’envoyer le lot à l’abattage.',
      );
    }
  }

  /**
   * Live birds promised to open customer orders are delivered alive at
   * fulfilment: slaughtering them would make those orders undeliverable.
   */
  private async assertNotReserved(
    em: EntityManager,
    order: SlaughterOrder,
    batch: ProductionBatch,
    step: string,
  ): Promise<void> {
    const reservation = await batchReservation(em, order.farmId, batch.id);
    // Other orders already at the abattoir leave the flock at processing too.
    const atAbattoir = await sentSlaughterBirds(
      em,
      order.farmId,
      batch.id,
      order.id,
    );
    const free = batch.quantityAlive - reservation.birds - atAbattoir;
    if (order.birdCount <= free) return;
    if (reservation.birds === 0) {
      throw new BadRequestException(
        `Oiseaux déjà envoyés à l’abattoir par d’autres ordres : ${atAbattoir} sur ${batch.quantityAlive} vivant(s), il en reste ${Math.max(0, free)} pour ${step}, ordre de ${order.birdCount}.`,
      );
    }
    const refs = reservation.orderRefs.slice(0, 3).join(', ');
    const more =
      reservation.orderRefs.length > 3
        ? ` et ${reservation.orderRefs.length - 3} autre(s)`
        : '';
    const abattoirNote =
      atAbattoir > 0 ? ` et ${atAbattoir} déjà envoyé(s) à l’abattoir` : '';
    throw new BadRequestException(
      `Oiseaux réservés par des commandes clients : ${reservation.birds} oiseau(x) sur ${batch.quantityAlive} vivant(s) sont promis (${refs}${more})${abattoirNote}, il en reste ${Math.max(0, free)} pour ${step}, ordre de ${order.birdCount}. Livrer ou annuler ces commandes, ou réduire l’ordre d’abattage.`,
    );
  }

  private batchLabel(batch: ProductionBatch): string {
    const base =
      batch.batchName ??
      batch.breed?.name ??
      `Lot ${batch.id.slice(0, 8).toUpperCase()}`;
    return `${batch.species === Species.POULET ? 'Poulet' : batch.species} — ${base} (${batch.integrationDate})`;
  }

  /**
   * Rendement d'abattage = poids carcasse / poids vif total × 100.
   * Calculé seulement quand les deux poids sont renseignés (saisie optionnelle,
   * jamais bloquante pour l'acte technique). La carcasse ne peut pas dépasser
   * le poids vif : réponse 400 sinon.
   */
  private refreshRendement(order: SlaughterOrder): void {
    if (order.carcassWeightKg != null && order.totalWeightKg != null) {
      if (order.carcassWeightKg > order.totalWeightKg) {
        throw new BadRequestException(
          `Le poids carcasse (${order.carcassWeightKg} kg) dépasse le poids vif total (${order.totalWeightKg} kg).`,
        );
      }
      order.rendementPercent =
        Math.round((order.carcassWeightKg / order.totalWeightKg) * 100 * 100) /
        100;
      return;
    }
    order.rendementPercent = null;
  }

  private assertMutable(order: SlaughterOrder): void {
    if (
      order.status === SlaughterStatus.PROCESSED ||
      order.status === SlaughterStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Un ordre d’abattage traité ou annulé ne peut plus être modifié.',
      );
    }
  }

  private makeReference(): string {
    const date = todayLocal().replace(/-/g, '');
    const suffix = Math.floor(100000 + Math.random() * 900000);
    return `${SLAUGHTER_PREFIX}-${date}-${suffix}`;
  }

  private makeInternalCode(): string {
    const date = todayLocal().replace(/-/g, '');
    const suffix = Math.floor(100000 + Math.random() * 900000);
    return `${SLAUGHTER_PREFIX}-${date}-${suffix}-I`;
  }

  private async nextInternalCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = this.makeInternalCode();
      const existing = await this.orderRepo.findOne({
        where: { internalBatchCode: candidate },
      });
      if (!existing) return candidate;
    }
    throw new BadRequestException(
      'Impossible de générer un code de suivi interne unique. Réessayer.',
    );
  }

  private async nextReference(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = this.makeReference();
      const existing = await this.orderRepo.findOne({
        where: { referenceNumber: candidate },
      });
      if (!existing) return candidate;
    }
    throw new BadRequestException(
      'Impossible de générer une référence d’abattage unique. Réessayer.',
    );
  }
}
