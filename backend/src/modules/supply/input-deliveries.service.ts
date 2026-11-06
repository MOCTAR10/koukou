import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import { FeedEntryType } from '../../common/enums/feed-entry-type.enum.js';
import { FeedUnit } from '../../common/enums/food-type.enum.js';
import {
  InputDeliverySource,
  InputDeliveryStatus,
} from '../../common/enums/input-delivery.enum.js';
import { InputKind } from '../../common/enums/input-kind.enum.js';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { isUuid } from '../../common/context/request-context.js';
import { isAfterTomorrowUtc } from '../../common/utils/date.utils.js';
import { isUniqueViolation } from '../../common/utils/idempotency.js';
import {
  scopeReachesFarms,
  type InstitutionAccess,
} from '../access/access-rules.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { FeedStockService } from '../feed-stock/feed-stock.service.js';
import { Expense } from '../finance/entities/expense.entity.js';
import { InputLot } from '../inputs/entities/input-lot.entity.js';
import {
  InputsService,
  type CreateInputLotInput,
} from '../inputs/inputs.service.js';
import { RefItem } from '../programme/entities/ref-item.entity.js';
import { IdCounterService } from '../programme/id-counter.service.js';
import { DeclarativeStockService } from './declarative-stock.service.js';
import {
  AttachBandDto,
  CancelInputDeliveryDto,
  ConfirmInputDeliveryDto,
  CreateInputDeliveryDto,
  ListInputDeliveriesQueryDto,
} from './dto/input-delivery.dto.js';
import { InputDeliveryLine } from './entities/input-delivery-line.entity.js';
import { InputDelivery } from './entities/input-delivery.entity.js';
import {
  INTRANT_FAMILY,
  cancelRefusal,
  confirmRefusal,
  deliveryCode,
  deliveryCounterScope,
  isBagUnit,
  isDiscrepancy,
  kgPerUnit,
  round3,
  subsidySplit,
} from './supply-rules.js';
import { FeedPhase } from '../../common/enums/feed-phase.enum.js';

/** Supplier label of a State delivery without a supplier name. */
export const STATE_SUPPLIER_LABEL = 'État / SMAG';

export const FARMER_CONFIRMS_MESSAGE =
  "La réception d'une livraison est confirmée par l'éleveur de la ferme (propriétaire ou membre autorisé).";

export interface DeliveryLineView {
  id: string;
  position: number;
  intrantCode: string;
  intrantLabel: string | null;
  intrantFamily: string;
  unitCode: string;
  unitLabel: string | null;
  quantity: number;
  feedPhase: FeedPhase | null;
  bagSizeKg: number | null;
  subsidized: boolean;
  subsidyRate: number | null;
  unitValueFcfa: number | null;
  supplierLotNumber: string | null;
  expirationDate: string | null;
  receivedQuantity: number | null;
  discrepancyReason: string | null;
  farmerCostFcfa: number | null;
  subsidyFcfa: number | null;
  inputLotId: string | null;
}

export interface DeliveryView {
  id: string;
  code: string;
  status: InputDeliveryStatus;
  source: InputDeliverySource;
  supplierName: string | null;
  shippedAt: string;
  receivedDate: string | null;
  confirmedAt: Date | null;
  confirmedById: string | null;
  hasDiscrepancy: boolean;
  cancelledAt: Date | null;
  cancelReason: string | null;
  notes: string | null;
  createdById: string | null;
  createdAt: Date;
  farm: {
    id: string;
    code: string | null;
    name: string;
    provinceCode: string | null;
    provinceName: string | null;
  };
  band: { id: string; code: string | null; batchName: string | null } | null;
  lines: DeliveryLineView[];
  totals: {
    /** Value shipped before subsidy (lines with a unit value). */
    shippedValueFcfa: number;
    /** Confirmed: what the farm pays (booked as expenses). */
    farmerCostFcfa: number | null;
    /** Confirmed: subsidy on what was received. */
    subsidyFcfa: number | null;
  };
}

/** Pre-filled band opening after a chick delivery (no band is opened automatically). */
export interface OpenBandHint {
  message: string;
  deliveryId: string;
  quantityAtStart: number;
  integrationDate: string;
  couvoirSupplier: string;
  chickLotNumber: string;
  /** The chicks' cost is already an expense: open the band without a chick price. */
  chickCostBooked: boolean;
}

export interface ConfirmResult extends DeliveryView {
  /** True when this answer replays an earlier confirmation (same key). */
  replay: boolean;
  openBandHint: OpenBandHint | null;
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Programme input deliveries (POUFA L4, architecture §9): recorded by the
 * DGE or the platform admin, confirmed by the farmer with the quantities
 * really received. Confirming creates the farm's input lots through
 * `InputsService` (FEFO, HACCP, automatic expense valued after subsidy) in
 * the same transaction.
 */
@Injectable()
export class InputDeliveriesService {
  private readonly logger = new Logger(InputDeliveriesService.name);

  constructor(
    @InjectRepository(InputDelivery)
    private readonly deliveries: Repository<InputDelivery>,
    @InjectRepository(InputDeliveryLine)
    private readonly lines: Repository<InputDeliveryLine>,
    @InjectRepository(RefItem)
    private readonly refItems: Repository<RefItem>,
    @InjectRepository(Farm)
    private readonly farmRepo: Repository<Farm>,
    @InjectRepository(ProductionBatch)
    private readonly batches: Repository<ProductionBatch>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly farms: FarmsService,
    private readonly scope: ScopeResolver,
    private readonly idCounter: IdCounterService,
    private readonly inputs: InputsService,
    private readonly feedStock: FeedStockService,
    private readonly declarative: DeclarativeStockService,
  ) {}

  // ---------------------------------------------------------------------
  // Programme side (DGE / platform admin)
  // ---------------------------------------------------------------------

  /** Institutional access reaching farm rows, or null for the platform admin. */
  private async recorderAccess(
    user: AuthUser,
  ): Promise<InstitutionAccess | null> {
    if (user.role === UserRole.PLATFORM_ADMIN) return null;
    if (user.role !== UserRole.INSTITUTION) {
      throw new ForbiddenException(
        'Accès refusé : les livraisons sont enregistrées par la DGE.',
      );
    }
    const access = await this.scope.requireAccess(user);
    if (!scopeReachesFarms(access.scopeKind)) {
      throw new ForbiddenException(
        'Accès refusé : votre profil ne donne accès à aucune ferme.',
      );
    }
    return access;
  }

  async create(
    user: AuthUser,
    dto: CreateInputDeliveryDto,
  ): Promise<DeliveryView> {
    const access = await this.recorderAccess(user);
    if (access) await this.scope.assertFarmId(access, dto.farmId);
    const farm = await this.farmRepo.findOne({ where: { id: dto.farmId } });
    if (!farm) throw new NotFoundException('Ferme introuvable.');
    const farmCode = farm.code;
    if (!farmCode) {
      throw new BadRequestException(
        "Cette ferme n'a pas encore de code programme : livraison impossible.",
      );
    }
    const shippedAt = dto.shippedAt.slice(0, 10);
    if (isAfterTomorrowUtc(shippedAt)) {
      throw new BadRequestException(
        "La date d'expédition ne peut pas être dans le futur.",
      );
    }
    const supplierName = dto.supplierName?.trim() || null;
    if (dto.source === InputDeliverySource.AUTRE && !supplierName) {
      throw new BadRequestException(
        'Indiquez le fournisseur pour une livraison hors État / SMAG.',
      );
    }
    if (dto.bandId) await this.assertOpenBand(farm.id, dto.bandId);

    const items = await this.itemsOf(farm.programId, true);
    const lineRows = dto.lines.map((l, i) => {
      const where = `Ligne ${i + 1}`;
      const intrant = items.intrants.get(l.intrantCode);
      if (!intrant || !intrant.family) {
        throw new BadRequestException(
          `${where} : intrant inconnu ou inactif (${l.intrantCode}).`,
        );
      }
      const unit = items.units.get(l.unitCode);
      if (!unit) {
        throw new BadRequestException(
          `${where} : unité inconnue ou inactive (${l.unitCode}).`,
        );
      }
      const family = intrant.family;
      const kg = kgPerUnit(unit, l.bagSizeKg, farm.defaultSacKg);
      let feedPhase: FeedPhase | null = null;
      if (family === INTRANT_FAMILY.ALIMENT) {
        if (kg == null) {
          throw new BadRequestException(
            `${where} : l'aliment se compte en masse (kg, tonne, sac), pas en « ${unit.label} ».`,
          );
        }
        feedPhase = l.feedPhase ?? metaPhase(intrant.meta);
        if (!feedPhase) {
          throw new BadRequestException(
            `${where} : indiquez la phase de l'aliment (démarrage, croissance, finition…).`,
          );
        }
      } else if (l.feedPhase) {
        throw new BadRequestException(
          `${where} : la phase ne s'applique qu'à l'aliment.`,
        );
      }
      if (family === INTRANT_FAMILY.POUSSIN) {
        if (kg != null) {
          throw new BadRequestException(
            `${where} : les poussins se comptent par tête, pas en « ${unit.label} ».`,
          );
        }
        if (!Number.isInteger(l.quantity)) {
          throw new BadRequestException(
            `${where} : le nombre de poussins doit être un entier.`,
          );
        }
      }
      const subsidized = l.subsidized === true;
      if (subsidized && l.subsidyRate == null) {
        throw new BadRequestException(
          `${where} : indiquez le taux de subvention de l'intrant subventionné.`,
        );
      }
      if (!subsidized && l.subsidyRate != null) {
        throw new BadRequestException(
          `${where} : un taux de subvention demande un intrant subventionné.`,
        );
      }
      return {
        position: i + 1,
        intrantCode: intrant.code,
        intrantFamily: family,
        unitCode: unit.code,
        quantity: l.quantity,
        feedPhase,
        bagSizeKg: isBagUnit(unit) ? (kg ?? null) : null,
        subsidized,
        subsidyRate: subsidized ? (l.subsidyRate ?? null) : null,
        unitValueFcfa: l.unitValueFcfa ?? null,
        supplierLotNumber: l.supplierLotNumber?.trim() || null,
        expirationDate: l.expirationDate?.slice(0, 10) ?? null,
      };
    });

    const id = await this.dataSource.transaction(async (em) => {
      const rank = await this.idCounter.next(
        deliveryCounterScope(farmCode),
        em,
      );
      const delivery = await em.getRepository(InputDelivery).save(
        em.getRepository(InputDelivery).create({
          code: deliveryCode(farmCode, rank),
          farmId: farm.id,
          bandId: dto.bandId ?? null,
          source: dto.source,
          supplierName,
          status: InputDeliveryStatus.EXPEDIEE,
          shippedAt,
          notes: dto.notes?.trim() || null,
          createdById: user.id,
        }),
      );
      await em
        .getRepository(InputDeliveryLine)
        .save(
          lineRows.map((l) =>
            em
              .getRepository(InputDeliveryLine)
              .create({ ...l, deliveryId: delivery.id }),
          ),
        );
      return delivery.id;
    });
    return this.viewById(id);
  }

  /** DGE list: by province, status, farm and shipping period, in SQL scope. */
  async list(user: AuthUser, query: ListInputDeliveriesQueryDto) {
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
    const qb = this.deliveries
      .createQueryBuilder('d')
      .innerJoin('d.farm', 'f')
      .leftJoin('f.province', 'p');
    if (access) this.scope.applyFarmScope(qb, 'f', access);
    if (query.province) {
      qb.andWhere('UPPER(p.code) = UPPER(:province)', {
        province: query.province.trim(),
      });
    }
    if (query.status)
      qb.andWhere('d.status = :status', { status: query.status });
    if (query.farmId)
      qb.andWhere('d.farm_id = :farmId', { farmId: query.farmId });
    if (query.from) {
      qb.andWhere('d.shipped_at >= :from', { from: query.from.slice(0, 10) });
    }
    if (query.to)
      qb.andWhere('d.shipped_at <= :to', { to: query.to.slice(0, 10) });
    const [rows, total] = await qb
      // Property paths: skip/take pagination resolves them on the metadata.
      .orderBy('d.shippedAt', 'DESC')
      .addOrderBy('d.code', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { total, page, pageSize, items: await this.views(rows) };
  }

  /** A delivery seen from the programme side (scope checked). */
  async getForProgramme(user: AuthUser, id: string): Promise<DeliveryView> {
    const delivery = await this.findOr404(id);
    if (this.scope.isInstitution(user)) {
      const access = await this.scope.requireAccess(user);
      await this.scope.assertFarmId(access, delivery.farmId);
    }
    return (await this.views([delivery]))[0];
  }

  async cancel(
    user: AuthUser,
    id: string,
    dto: CancelInputDeliveryDto,
  ): Promise<DeliveryView> {
    const access = await this.recorderAccess(user);
    const found = await this.findOr404(id);
    if (access) await this.scope.assertFarmId(access, found.farmId);
    await this.dataSource.transaction(async (em) => {
      const delivery = await em.getRepository(InputDelivery).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      const refusal = delivery ? cancelRefusal(delivery.status) : null;
      if (!delivery) throw new NotFoundException('Livraison introuvable.');
      if (refusal) throw new ConflictException(refusal);
      delivery.status = InputDeliveryStatus.ANNULEE;
      delivery.cancelledAt = new Date();
      delivery.cancelledById = user.id;
      delivery.cancelReason = dto.reason.trim();
      await em.getRepository(InputDelivery).save(delivery);
    });
    return this.viewById(id);
  }

  // ---------------------------------------------------------------------
  // Farm side
  // ---------------------------------------------------------------------

  async listForFarm(
    user: AuthUser,
    farmId: string,
    status?: InputDeliveryStatus,
  ): Promise<DeliveryView[]> {
    await this.farms.assertAccessible(user, farmId);
    const rows = await this.deliveries.find({
      where: { farmId, ...(status ? { status } : {}) },
      order: { shippedAt: 'DESC', code: 'DESC' },
    });
    return this.views(rows);
  }

  async getForFarm(
    user: AuthUser,
    farmId: string,
    id: string,
  ): Promise<DeliveryView> {
    await this.farms.assertAccessible(user, farmId);
    const delivery = await this.deliveries.findOne({ where: { id, farmId } });
    if (!delivery) {
      throw new NotFoundException('Livraison introuvable dans cette ferme.');
    }
    return (await this.views([delivery]))[0];
  }

  /**
   * The farmer confirms what he really received. One transaction: the
   * delivery (locked), its lines and the farm's input lots with their
   * expenses and journal entries. A replay with the same idempotency key
   * returns the confirmed delivery.
   */
  async confirm(
    user: AuthUser,
    farmId: string,
    id: string,
    dto: ConfirmInputDeliveryDto,
  ): Promise<ConfirmResult> {
    if (user.role !== UserRole.PROPRIETAIRE && user.role !== UserRole.ELEVEUR) {
      throw new ForbiddenException(FARMER_CONFIRMS_MESSAGE);
    }
    const farm = await this.farms.assertAccessible(user, farmId);
    const key = dto.idempotencyKey?.trim() || null;
    if (key) {
      const earlier = await this.deliveries.findOne({
        where: { farmId, confirmIdempotencyKey: key },
      });
      if (earlier && earlier.id !== id) {
        throw new ConflictException(
          "Clé d'idempotence déjà utilisée pour une autre livraison.",
        );
      }
      if (earlier) return this.confirmResult(earlier.id, true);
    }

    let replay = false;
    try {
      replay = await this.dataSource.transaction((em) =>
        this.confirmWithin(em, user, farm, id, dto, key),
      );
    } catch (err) {
      if (key && isUniqueViolation(err)) {
        const winner = await this.deliveries.findOne({
          where: { farmId, confirmIdempotencyKey: key },
        });
        if (winner?.id === id) return this.confirmResult(id, true);
        throw new ConflictException(
          "Clé d'idempotence déjà utilisée pour une autre livraison.",
        );
      }
      throw err;
    }
    if (!replay) await this.afterStockChange(farmId);
    return this.confirmResult(id, replay);
  }

  /** @returns true when the delivery was already confirmed with `key`. */
  private async confirmWithin(
    em: EntityManager,
    user: AuthUser,
    farm: Farm,
    id: string,
    dto: ConfirmInputDeliveryDto,
    key: string | null,
  ): Promise<boolean> {
    const delivery = await em.getRepository(InputDelivery).findOne({
      where: { id, farmId: farm.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!delivery) {
      throw new NotFoundException('Livraison introuvable dans cette ferme.');
    }
    if (
      key &&
      delivery.status === InputDeliveryStatus.CONFIRMEE &&
      delivery.confirmIdempotencyKey === key
    ) {
      return true;
    }
    const refusal = confirmRefusal(delivery.status);
    if (refusal) throw new ConflictException(refusal);

    const receivedDate = (dto.receivedDate ?? utcToday()).slice(0, 10);
    if (isAfterTomorrowUtc(receivedDate)) {
      throw new BadRequestException(
        'La date de réception ne peut pas être dans le futur.',
      );
    }
    if (receivedDate < delivery.shippedAt) {
      throw new BadRequestException(
        `La réception ne peut pas précéder l'expédition (${delivery.shippedAt}).`,
      );
    }
    const lines = await em.getRepository(InputDeliveryLine).find({
      where: { deliveryId: id },
      order: { position: 'ASC' },
    });
    const byLine = new Map<string, NonNullable<typeof dto.lines>[number]>();
    for (const l of dto.lines ?? []) {
      if (!lines.some((x) => x.id === l.lineId)) {
        throw new BadRequestException(
          `Ligne inconnue pour cette livraison : ${l.lineId}.`,
        );
      }
      if (byLine.has(l.lineId)) {
        throw new BadRequestException(
          `Ligne confirmée deux fois : ${l.lineId}.`,
        );
      }
      byLine.set(l.lineId, l);
    }
    if (delivery.bandId) {
      const band = await em
        .getRepository(ProductionBatch)
        .findOne({ where: { id: delivery.bandId, farmId: farm.id } });
      if (!band) delivery.bandId = null;
    }

    const items = await this.itemsOf(farm.programId, false, em);
    const supplier =
      delivery.supplierName ??
      (delivery.source === InputDeliverySource.ETAT_SMAG
        ? STATE_SUPPLIER_LABEL
        : 'Autre fournisseur');
    let hasDiscrepancy = false;
    for (const line of lines) {
      const input = byLine.get(line.id);
      const received = input?.receivedQuantity ?? line.quantity;
      const label =
        items.intrants.get(line.intrantCode)?.label ?? line.intrantCode;
      const where = `Ligne ${line.position} (${label})`;
      if (
        line.intrantFamily === INTRANT_FAMILY.POUSSIN &&
        !Number.isInteger(received)
      ) {
        throw new BadRequestException(
          `${where} : le nombre de poussins reçus doit être un entier.`,
        );
      }
      const reason = input?.discrepancyReason?.trim() || null;
      if (isDiscrepancy(line.quantity, received)) {
        if (!reason || reason.length < 3) {
          throw new BadRequestException(
            `${where} : reçu ${round3(received)} pour ${round3(line.quantity)} expédié, indiquez le motif de l'écart.`,
          );
        }
        hasDiscrepancy = true;
      }
      const split = subsidySplit(
        received,
        line.unitValueFcfa,
        line.subsidized,
        line.subsidyRate,
      );
      line.receivedQuantity = received;
      line.discrepancyReason = isDiscrepancy(line.quantity, received)
        ? reason
        : null;
      line.farmerCostFcfa = split?.farmerCostFcfa ?? null;
      line.subsidyFcfa = split?.subsidyFcfa ?? null;
      if (input?.supplierLotNumber?.trim()) {
        line.supplierLotNumber = input.supplierLotNumber.trim();
      }
      if (input?.expirationDate) {
        line.expirationDate = input.expirationDate.slice(0, 10);
      }
      if (received > 0) {
        const unit = items.units.get(line.unitCode);
        const lot = await this.inputs.createWithin(
          em,
          user,
          this.lotInput({
            farm,
            delivery,
            line,
            received,
            supplier,
            productName: label,
            receivedDate,
            unitSymbol: unitSymbol(unit) ?? line.unitCode,
            kgFactor: unit
              ? kgPerUnit(unit, line.bagSizeKg, farm.defaultSacKg)
              : null,
          }),
        );
        line.inputLotId = lot.id;
      }
      await em.getRepository(InputDeliveryLine).save(line);
    }
    delivery.status = InputDeliveryStatus.CONFIRMEE;
    delivery.receivedDate = receivedDate;
    delivery.confirmedAt = new Date();
    delivery.confirmedById = user.id;
    delivery.confirmIdempotencyKey = key;
    delivery.hasDiscrepancy = hasDiscrepancy;
    await em.getRepository(InputDelivery).save(delivery);
    return false;
  }

  /** The farm input lot of a received line (stock unit and cost by family). */
  private lotInput(args: {
    farm: Farm;
    delivery: InputDelivery;
    line: InputDeliveryLine;
    received: number;
    supplier: string;
    productName: string;
    receivedDate: string;
    unitSymbol: string;
    kgFactor: number | null;
  }): CreateInputLotInput {
    const { farm, delivery, line, received } = args;
    const base = {
      farmId: farm.id,
      batchId: delivery.bandId,
      productName: args.productName,
      supplier: args.supplier,
      supplierLotNumber: line.supplierLotNumber ?? delivery.code,
      expirationDate: line.expirationDate,
      receivedDate: args.receivedDate,
      // After subsidy: what the farm pays. 0 (fully subsidized) books nothing.
      totalCostFcfa: line.farmerCostFcfa,
    };
    const netUnitPrice =
      line.unitValueFcfa == null
        ? null
        : Math.round(
            (line.unitValueFcfa *
              (100 - (line.subsidized ? (line.subsidyRate ?? 0) : 0))) /
              100,
          );
    switch (line.intrantFamily) {
      case INTRANT_FAMILY.POUSSIN:
        return {
          ...base,
          kind: InputKind.POUSSINS,
          quantity: received,
          unitPriceFcfa: netUnitPrice,
        };
      case INTRANT_FAMILY.ALIMENT: {
        const kgFactor = args.kgFactor ?? 1;
        // Price per delivered unit and its weight: the FEFO valuation reads
        // a BAG lot's price per kg as unitPriceFcfa / bagSizeKg.
        return {
          ...base,
          kind: InputKind.ALIMENT,
          entryType: FeedEntryType.BAG,
          feedPhase: line.feedPhase,
          quantity: round3(received * kgFactor),
          unit: FeedUnit.KG,
          bagSizeKg: kgFactor,
          unitPriceFcfa: netUnitPrice,
        };
      }
      default:
        // Vaccines, medicines and other inputs are tracked by their unit
        // (doses, bottles…), never in the feed autonomy (kg).
        return {
          ...base,
          kind:
            line.intrantFamily === INTRANT_FAMILY.AUTRE
              ? InputKind.AUTRE
              : InputKind.MEDICAMENT,
          entryType: FeedEntryType.MEDICAMENT,
          quantity: received,
          unit: null,
          doseUnit: args.unitSymbol,
          unitPriceFcfa: netUnitPrice,
        };
    }
  }

  /**
   * Links a delivery to a band of the farm (typically the band opened after
   * a chick delivery): its lots and their expenses not yet tied to a band
   * follow, so the band's P&L counts the chicks' cost once. Set once.
   */
  async attachBand(
    user: AuthUser,
    farmId: string,
    id: string,
    dto: AttachBandDto,
  ): Promise<DeliveryView> {
    await this.farms.assertAccessible(user, farmId);
    await this.dataSource.transaction(async (em) => {
      const delivery = await em.getRepository(InputDelivery).findOne({
        where: { id, farmId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!delivery) {
        throw new NotFoundException('Livraison introuvable dans cette ferme.');
      }
      if (delivery.status === InputDeliveryStatus.ANNULEE) {
        throw new ConflictException('Cette livraison a été annulée.');
      }
      if (delivery.bandId === dto.bandId) return;
      if (delivery.bandId) {
        throw new ConflictException(
          'Cette livraison est déjà rattachée à une autre bande.',
        );
      }
      await this.assertOpenBand(farmId, dto.bandId, em);
      delivery.bandId = dto.bandId;
      await em.getRepository(InputDelivery).save(delivery);
      const lotIds = (
        await em.getRepository(InputDeliveryLine).find({
          where: { deliveryId: id },
          select: { inputLotId: true },
        })
      )
        .map((l) => l.inputLotId)
        .filter((x): x is string => x != null);
      if (lotIds.length > 0) {
        await em
          .getRepository(InputLot)
          .update(
            { id: In(lotIds), farmId, batchId: IsNull() },
            { batchId: dto.bandId },
          );
        await em
          .getRepository(Expense)
          .update(
            { inputLotId: In(lotIds), farmId, batchId: IsNull() },
            { batchId: dto.bandId },
          );
      }
    });
    return this.viewById(id);
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async assertOpenBand(
    farmId: string,
    bandId: string,
    em?: EntityManager,
  ): Promise<void> {
    const band = await (
      em ? em.getRepository(ProductionBatch) : this.batches
    ).findOne({ where: { id: bandId, farmId } });
    if (!band) {
      throw new BadRequestException('Bande introuvable dans cette ferme.');
    }
    if (band.status === BatchStatus.CLOTURE) {
      throw new BadRequestException(
        'Cette bande est clôturée : choisissez une bande en cours.',
      );
    }
  }

  /** Stock and alerts after a confirmation (after commit, never failing it). */
  private async afterStockChange(farmId: string): Promise<void> {
    try {
      await this.feedStock.evaluateStockAlerts(farmId);
      await this.declarative.evaluate(farmId);
    } catch (err) {
      this.logger.error(
        `Alertes de stock après confirmation (${farmId}) : ${String(err)}`,
      );
    }
  }

  private async findOr404(id: string): Promise<InputDelivery> {
    const delivery = isUuid(id)
      ? await this.deliveries.findOne({ where: { id } })
      : null;
    if (!delivery) throw new NotFoundException('Livraison introuvable.');
    return delivery;
  }

  private async viewById(id: string): Promise<DeliveryView> {
    return (await this.views([await this.findOr404(id)]))[0];
  }

  private async confirmResult(
    id: string,
    replay: boolean,
  ): Promise<ConfirmResult> {
    const view = await this.viewById(id);
    return { ...view, replay, openBandHint: openBandHint(view) };
  }

  /** INTRANT and UNITE items of the programme by code. */
  private async itemsOf(
    programId: string,
    activeOnly: boolean,
    em?: EntityManager,
  ) {
    const rows = await (em ? em.getRepository(RefItem) : this.refItems).find({
      where: {
        programId,
        listType: In([ProgramListType.INTRANT, ProgramListType.UNITE]),
        ...(activeOnly ? { active: true } : {}),
      },
    });
    const intrants = new Map<string, RefItem>();
    const units = new Map<string, RefItem>();
    for (const r of rows) {
      (r.listType === ProgramListType.INTRANT ? intrants : units).set(
        r.code,
        r,
      );
    }
    return { intrants, units };
  }

  async views(rows: InputDelivery[]): Promise<DeliveryView[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((d) => d.id);
    const farmIds = [...new Set(rows.map((d) => d.farmId))];
    const bandIds = [
      ...new Set(rows.map((d) => d.bandId).filter((x): x is string => !!x)),
    ];
    const [lines, farms, bands] = await Promise.all([
      this.lines.find({
        where: { deliveryId: In(ids) },
        order: { position: 'ASC' },
      }),
      this.farmRepo.find({
        where: { id: In(farmIds) },
        relations: { province: true },
      }),
      bandIds.length
        ? this.batches.find({
            where: { id: In(bandIds) },
            select: { id: true, code: true, batchName: true },
          })
        : Promise.resolve([] as ProductionBatch[]),
    ]);
    const programIds = [...new Set(farms.map((f) => f.programId))];
    const items = programIds.length
      ? await this.refItems.find({
          where: {
            programId: In(programIds),
            listType: In([ProgramListType.INTRANT, ProgramListType.UNITE]),
          },
        })
      : [];
    const label = (listType: ProgramListType, code: string) =>
      items.find((i) => i.listType === listType && i.code === code)?.label ??
      null;
    const farmById = new Map(farms.map((f) => [f.id, f]));
    const bandById = new Map(bands.map((b) => [b.id, b]));
    return rows.map((d) => {
      const farm = farmById.get(d.farmId);
      const own = lines.filter((l) => l.deliveryId === d.id);
      const band = d.bandId ? bandById.get(d.bandId) : undefined;
      const confirmed = d.status === InputDeliveryStatus.CONFIRMEE;
      return {
        id: d.id,
        code: d.code,
        status: d.status,
        source: d.source,
        supplierName: d.supplierName,
        shippedAt: d.shippedAt,
        receivedDate: d.receivedDate,
        confirmedAt: d.confirmedAt,
        confirmedById: d.confirmedById,
        hasDiscrepancy: d.hasDiscrepancy,
        cancelledAt: d.cancelledAt,
        cancelReason: d.cancelReason,
        notes: d.notes,
        createdById: d.createdById,
        createdAt: d.createdAt,
        farm: {
          id: d.farmId,
          code: farm?.code ?? null,
          name: farm?.name ?? '',
          provinceCode: farm?.province?.code ?? null,
          provinceName: farm?.province?.name ?? null,
        },
        band: band
          ? { id: band.id, code: band.code, batchName: band.batchName }
          : null,
        lines: own.map((l) => ({
          id: l.id,
          position: l.position,
          intrantCode: l.intrantCode,
          intrantLabel: label(ProgramListType.INTRANT, l.intrantCode),
          intrantFamily: l.intrantFamily,
          unitCode: l.unitCode,
          unitLabel: label(ProgramListType.UNITE, l.unitCode),
          quantity: l.quantity,
          feedPhase: l.feedPhase,
          bagSizeKg: l.bagSizeKg,
          subsidized: l.subsidized,
          subsidyRate: l.subsidyRate,
          unitValueFcfa: l.unitValueFcfa,
          supplierLotNumber: l.supplierLotNumber,
          expirationDate: l.expirationDate,
          receivedQuantity: l.receivedQuantity,
          discrepancyReason: l.discrepancyReason,
          farmerCostFcfa: l.farmerCostFcfa,
          subsidyFcfa: l.subsidyFcfa,
          inputLotId: l.inputLotId,
        })),
        totals: {
          shippedValueFcfa: own.reduce(
            (s, l) =>
              s +
              (l.unitValueFcfa == null
                ? 0
                : Math.round(l.quantity * l.unitValueFcfa)),
            0,
          ),
          farmerCostFcfa: confirmed
            ? own.reduce((s, l) => s + (l.farmerCostFcfa ?? 0), 0)
            : null,
          subsidyFcfa: confirmed
            ? own.reduce((s, l) => s + (l.subsidyFcfa ?? 0), 0)
            : null,
        },
      };
    });
  }
}

function metaPhase(meta: Record<string, unknown> | null): FeedPhase | null {
  const v = meta?.feedPhase;
  return typeof v === 'string' &&
    (Object.values(FeedPhase) as string[]).includes(v)
    ? (v as FeedPhase)
    : null;
}

function unitSymbol(unit: RefItem | undefined): string | null {
  const symbol = unit?.meta?.symbol;
  return typeof symbol === 'string' && symbol ? symbol : (unit?.label ?? null);
}

/** Hint to open the band after chicks were received without a band. */
export function openBandHint(view: DeliveryView): OpenBandHint | null {
  if (view.status !== InputDeliveryStatus.CONFIRMEE || view.band) return null;
  const chicks = view.lines.filter(
    (l) =>
      l.intrantFamily === INTRANT_FAMILY.POUSSIN &&
      (l.receivedQuantity ?? 0) > 0,
  );
  if (chicks.length === 0) return null;
  const heads = chicks.reduce((s, l) => s + (l.receivedQuantity ?? 0), 0);
  const booked = chicks.some((l) => (l.farmerCostFcfa ?? 0) > 0);
  return {
    message: `${heads} poussins reçus : ouvrez la bande avec ces données, puis rattachez-la à la livraison ${view.code}.${booked ? ' Leur coût est déjà en dépense : ne saisissez pas de prix du poussin.' : ''}`,
    deliveryId: view.id,
    quantityAtStart: heads,
    integrationDate: view.receivedDate ?? view.shippedAt,
    couvoirSupplier: view.supplierName ?? STATE_SUPPLIER_LABEL,
    chickLotNumber: chicks[0].supplierLotNumber ?? view.code,
    chickCostBooked: booked,
  };
}
