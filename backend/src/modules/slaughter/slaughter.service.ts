import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  BordereauData,
  PasseportData,
  PdfService,
} from '../../common/services/pdf.service.js';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import {
  AlertKind,
  AlertLevel,
  AlertStatus,
} from '../../common/enums/alert-level.enum.js';
import { BatchStatus, BatchType } from '../../common/enums/batch-type.enum.js';
import { Species } from '../../common/enums/species.enum.js';
import { SlaughterDestination } from '../../common/enums/slaughter-destination.enum.js';
import { SlaughterStatus } from '../../common/enums/slaughter-status.enum.js';
import { SlaughterType } from '../../common/enums/slaughter-type.enum.js';
import { Alert } from '../alerts/entities/alert.entity.js';
import { MetricsService } from '../batches/metrics.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import {
  CancelSlaughterOrderDto,
  CreateSlaughterOrderDto,
  ProcessSlaughterOrderDto,
  SendSlaughterOrderDto,
  UpdateSlaughterOrderDto,
} from './dto/slaughter.dto.js';
import { SlaughterOrder } from './entities/slaughter-order.entity.js';

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
  ) {}

  async create(user: AuthUser, farmId: string, dto: CreateSlaughterOrderDto) {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.batchRepo.findOne({
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

    const order = this.orderRepo.create({
      farmId,
      batchId: batch.id,
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
    await this.orderRepo.save(order);
    return this.getOne(user, farmId, order.id);
  }

  async list(user: AuthUser, farmId: string): Promise<SlaughterOrder[]> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.orderRepo.find({
      where: { farmId },
      order: { createdAt: 'DESC' },
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
    const order = await this.getOne(user, farmId, orderId);
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
    await this.orderRepo.save(order);
    return order;
  }

  async send(
    user: AuthUser,
    farmId: string,
    orderId: string,
    dto: SendSlaughterOrderDto,
  ): Promise<SlaughterOrder> {
    await this.farmsService.assertAccessible(user, farmId);
    const order = await this.getOne(user, farmId, orderId);
    this.assertMutable(order);
    if (order.status === SlaughterStatus.SENT) {
      throw new BadRequestException(
        'Cet ordre d’abattage a déjà été envoyé à l’abattoir.',
      );
    }

    await this.assertLotEligibleForSend(order);

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
    await this.orderRepo.save(order);
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
      batch.quantityAlive -= order.birdCount;
      if (batch.quantityAlive <= 0) {
        batch.status = BatchStatus.FINI;
      }
      await em.getRepository(ProductionBatch).save(batch);

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
    return this.dataSource.transaction(async (em) => {
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
      this.assertMutable(order);
      if (dto?.reason) {
        const suffix = dto.reason.trim();
        order.abattoirNotes = order.abattoirNotes
          ? `${order.abattoirNotes} — Annulé : ${suffix}`
          : `Annulé : ${suffix}`;
      }
      order.status = SlaughterStatus.CANCELLED;
      await em.getRepository(SlaughterOrder).save(order);
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

    const active = await this.alertRepo.find({
      where: {
        farmId,
        batchId: batch.id,
        kind: In([AlertKind.DELAI_ATTENTE, AlertKind.PROPHYLAXIE]),
        status: AlertStatus.ACTIVE,
      },
    });
    const delaiAttente = active.find((a) => a.kind === AlertKind.DELAI_ATTENTE);
    const prophyEnRetard = active.find(
      (a) => a.kind === AlertKind.PROPHYLAXIE && a.level === AlertLevel.ROUGE,
    );

    const conformity = delaiAttente
      ? 'EN_ATTENTE'
      : prophyEnRetard
        ? 'PRECONFORMITE'
        : 'CONFORME';
    const conformityNote = delaiAttente
      ? 'Délai d’attente antibiotique en cours : la commercialisation est suspendue jusqu’à son expiration (sécurité alimentaire).'
      : prophyEnRetard
        ? 'Des soins planifiés sont en retard au calendrier : les régulariser avant l’abattage pour confirmer la conformité.'
        : 'Aucun délai d’attente en cours et prophylaxie à jour : le lot est présenté en conformité avec le programme sanitaire.';

    const metricRows: PasseportData['metrics'] = [
      { label: 'Âge', value: `${metrics.ageDays} j` },
      {
        label: 'Mortalité',
        value: `${metrics.mortalityPercent.toFixed(1)} %`,
      },
      { label: 'Viabilité', value: `${metrics.viabilityPercent.toFixed(1)} %` },
      {
        label: 'IC (Indice de consommation)',
        value: metrics.fcr != null ? metrics.fcr.toFixed(2) : 'N/A',
      },
      {
        label: 'GMQ',
        value:
          metrics.gmqGramsPerDay != null
            ? `${metrics.gmqGramsPerDay.toFixed(1)} g/j`
            : 'N/A',
      },
      {
        label: 'IPE',
        value: metrics.ipe != null ? metrics.ipe.toFixed(1) : 'N/A',
      },
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

  private async assertLotEligibleForSend(order: SlaughterOrder): Promise<void> {
    const batch = order.batch;
    if (batch.status === BatchStatus.CLOTURE) {
      throw new BadRequestException('Lot clôturé : envoi à l’abattage impossible.');
    }
    // Synchronisation du stock : on n'envoie que les oiseaux réellement
    // présents sur le lot (toutes les sorties doivent rester cohérentes).
    if (order.birdCount > batch.quantityAlive) {
      throw new BadRequestException(
        `Cheptel insuffisant pour l'envoi : il reste ${batch.quantityAlive} oiseau(x) vivant(s) sur le lot, ordre de ${order.birdCount}.`,
      );
    }
    // Critères sanitaires (normes internationales) : pas de délai d'attente actif
    // et prophylaxie à jour avant de pouvoir envoyer un lot à l'abattage.
    const active = await this.alertRepo.find({
      where: {
        farmId: order.farmId,
        batchId: order.batchId,
        kind: In([AlertKind.DELAI_ATTENTE, AlertKind.PROPHYLAXIE]),
        status: AlertStatus.ACTIVE,
      },
    });
    const delaiAttente = active.find((a) => a.kind === AlertKind.DELAI_ATTENTE);
    const prophyEnRetard = active.find(
      (a) => a.kind === AlertKind.PROPHYLAXIE && a.level === AlertLevel.ROUGE,
    );
    if (delaiAttente) {
      throw new BadRequestException(
        'Délai d’attente antibiotique en cours : la commercialisation et l’envoi à l’abattage sont suspendus (sécurité alimentaire). Respecter le délai d’élimination avant de réessayer.',
      );
    }
    if (prophyEnRetard) {
      throw new BadRequestException(
        'Des soins prophylactiques sont en retard au calendrier sanitaire du lot : régulariser le programme de soins avant d’envoyer le lot à l’abattage.',
      );
    }
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
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = Math.floor(100000 + Math.random() * 900000);
    return `${SLAUGHTER_PREFIX}-${date}-${suffix}`;
  }

  private makeInternalCode(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
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
