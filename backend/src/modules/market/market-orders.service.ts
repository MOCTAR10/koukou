import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { batchReservationOverflow } from './market-oversold.js';
import { CustomerType } from '../../common/enums/customer-type.enum.js';
import {
  MarketFulfilment,
  MarketListingKind,
  MarketListingStatus,
  MarketOrderState,
  MarketProduct,
} from '../../common/enums/market.enum.js';
import { OrderCanal } from '../../common/enums/order-canal.enum.js';
import { OrderSource } from '../../common/enums/order-source.enum.js';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { SaleItemProductType } from '../../common/enums/sale-item-type.enum.js';
import { isUniqueViolation } from '../../common/utils/idempotency.js';
import { FarmEmployee } from '../farms/entities/farm-employee.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { CustomersService } from '../finance/customers.service.js';
import { Customer } from '../finance/entities/customer.entity.js';
import { CreateOrderDto } from '../orders/dto/order.dto.js';
import { Order } from '../orders/entities/order.entity.js';
import {
  BuyerCancelOutcome,
  OrdersService,
} from '../orders/orders.service.js';
import { sanitaryHolds } from '../sanitary/sanitary-holds.js';
import { BuyerProfile } from '../users/entities/buyer-profile.entity.js';
import { User } from '../users/entities/user.entity.js';
import {
  CreateMarketOrderDto,
  FarmMarketOrdersQueryDto,
  RejectMarketOrderDto,
} from './dto/market-order.dto.js';
import { MarketListing } from './entities/market-listing.entity.js';
import { MarketOrder } from './entities/market-order.entity.js';
import { blockedBySanitaryHold } from './listing-rules.js';
import { MarketListingsService } from './market-listings.service.js';
import {
  acceptedQuantity,
  buyerStatus,
  DEPOSIT_WINDOW_MS,
  depositRequired,
  MAX_OPEN_REQUESTS_PER_BUYER,
  REQUEST_LIFETIME_MS,
} from './market-order-rules.js';

const DEPOSIT_EXPIRED_REASON = 'Acompte non reçu dans le délai de 24 heures.';

@Injectable()
export class MarketOrdersService {
  private readonly logger = new Logger(MarketOrdersService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MarketOrder)
    private readonly marketOrderRepo: Repository<MarketOrder>,
    @InjectRepository(MarketListing)
    private readonly listingRepo: Repository<MarketListing>,
    @InjectRepository(FarmEmployee)
    private readonly employeeRepo: Repository<FarmEmployee>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(BuyerProfile)
    private readonly profileRepo: Repository<BuyerProfile>,
    private readonly farmsService: FarmsService,
    private readonly ordersService: OrdersService,
    private readonly customersService: CustomersService,
    private readonly listingsService: MarketListingsService,
  ) {}

  // ---------- Buyer ----------

  async request(user: AuthUser, dto: CreateMarketOrderDto) {
    if (dto.idempotencyKey) {
      const replay = await this.marketOrderRepo.findOne({
        where: { buyerUserId: user.id, idempotencyKey: dto.idempotencyKey },
      });
      if (replay) return this.getForBuyer(user, replay.id);
    }

    const listing = await this.listingRepo.findOne({
      where: { id: dto.listingId },
      relations: { farm: true, batch: { breed: true } },
    });
    if (!listing) throw new NotFoundException('Annonce introuvable.');
    const state = await this.listingsService.stateOf(
      this.dataSource.manager,
      listing,
    );
    if (state.hiddenReason) {
      throw new NotFoundException('Annonce introuvable.');
    }

    await this.assertNotOwnFarm(user, listing.farm);
    if (dto.quantity < listing.minOrderQty) {
      throw new BadRequestException(
        `Quantité minimale pour cette annonce : ${listing.minOrderQty}.`,
      );
    }
    if (dto.quantity > state.availableQuantity) {
      throw new BadRequestException(
        `Quantité disponible : ${state.availableQuantity}.`,
      );
    }
    const delivered = dto.fulfilment === MarketFulfilment.DELIVERY;
    if (delivered && !listing.deliveryAvailable) {
      throw new BadRequestException('Cette ferme ne livre pas cette annonce.');
    }
    if (!delivered && !listing.pickupAvailable) {
      throw new BadRequestException(
        'Cette annonce n’est pas proposée au retrait à la ferme.',
      );
    }
    if (delivered && !dto.address) {
      throw new BadRequestException('Indiquez l’adresse de livraison.');
    }
    if (dto.desiredDate && listing.kind === MarketListingKind.PRE) {
      throw new BadRequestException(
        'La date d’une précommande est fixée par la ferme.',
      );
    }

    const open = await this.marketOrderRepo.count({
      where: { buyerUserId: user.id, state: MarketOrderState.REQUESTED },
    });
    if (open >= MAX_OPEN_REQUESTS_PER_BUYER) {
      throw new BadRequestException(
        `Vous avez déjà ${open} demandes en attente. Attendez une réponse ou retirez-en une.`,
      );
    }

    const account = await this.userRepo.findOneByOrFail({ id: user.id });
    try {
      const saved = await this.marketOrderRepo.save(
        this.marketOrderRepo.create({
          listingId: listing.id,
          farmId: listing.farmId,
          buyerUserId: user.id,
          quantity: dto.quantity,
          unitPriceFcfa: listing.unitPriceFcfa,
          deliveryFeeFcfa: delivered ? listing.deliveryFeeFcfa : 0,
          depositRequiredFcfa: depositRequired(
            dto.quantity,
            listing.unitPriceFcfa,
            listing.depositPct,
          ),
          fulfilment: dto.fulfilment,
          address: delivered ? dto.address! : null,
          contactPhone: dto.contactPhone ?? account.phone,
          note: dto.note || null,
          desiredDate: dto.desiredDate ?? null,
          state: MarketOrderState.REQUESTED,
          requestExpiresAt: new Date(Date.now() + REQUEST_LIFETIME_MS),
          idempotencyKey: dto.idempotencyKey ?? null,
        }),
      );
      return this.getForBuyer(user, saved.id);
    } catch (err) {
      if (dto.idempotencyKey && isUniqueViolation(err)) {
        const replay = await this.marketOrderRepo.findOneOrFail({
          where: { buyerUserId: user.id, idempotencyKey: dto.idempotencyKey },
        });
        return this.getForBuyer(user, replay.id);
      }
      throw err;
    }
  }

  async listForBuyer(user: AuthUser) {
    const rows = await this.loadViews({ buyerUserId: user.id });
    return rows.map((mo) => this.toBuyerView(mo));
  }

  async getForBuyer(user: AuthUser, id: string) {
    const [mo] = await this.loadViews({ id, buyerUserId: user.id });
    // Same answer for someone else's order as for one that doesn't exist.
    if (!mo) throw new NotFoundException('Commande introuvable.');
    return this.toBuyerView(mo);
  }

  async withdraw(user: AuthUser, id: string) {
    await this.dataSource.transaction(async (em) => {
      const mo = await this.lock(em, { id, buyerUserId: user.id });
      if (mo.state !== MarketOrderState.REQUESTED) {
        throw new BadRequestException('Cette demande n’est plus en attente.');
      }
      mo.state = MarketOrderState.WITHDRAWN;
      mo.closedAt = new Date();
      await em.save(mo);
    });
    return this.getForBuyer(user, id);
  }

  // ---------- Farm ----------

  async listForFarm(
    user: AuthUser,
    farmId: string,
    query: FarmMarketOrdersQueryDto,
  ) {
    await this.farmsService.assertAccessible(user, farmId);
    return this.farmViews({
      farmId,
      ...(query.state ? { state: query.state } : {}),
    });
  }

  private async farmViews(where: {
    id?: string;
    farmId: string;
    state?: MarketOrderState;
  }) {
    const { farmId } = where;
    const rows = await this.loadViews(where);
    const profiles = await this.profileRepo.find({
      where: { userId: In([...new Set(rows.map((r) => r.buyerUserId))]) },
    });
    const profileOf = new Map(profiles.map((p) => [p.userId, p]));

    const batchIds = new Set(
      rows
        .filter((r) => r.order && this.isOpen(r.order))
        .map((r) => r.listing.batchId),
    );
    const overflowing = new Set<string>();
    for (const batchId of batchIds) {
      if (await batchReservationOverflow(this.dataSource.manager, farmId, batchId)) {
        overflowing.add(batchId);
      }
    }

    return rows.map((mo) => {
      const profile = profileOf.get(mo.buyerUserId);
      const paid = mo.order?.depositFcfa ?? 0;
      return {
        id: mo.id,
        state: mo.state,
        status: buyerStatus(mo, mo.order),
        listingId: mo.listingId,
        kind: mo.listing.kind,
        product: mo.listing.product,
        batchId: mo.listing.batchId,
        batchName: mo.listing.batch.batchName,
        readyDate: mo.listing.readyDate,
        desiredDate: mo.desiredDate,
        quantity: mo.quantity,
        unitPriceFcfa: mo.unitPriceFcfa,
        deliveryFeeFcfa: mo.deliveryFeeFcfa,
        totalFcfa: this.totalOf(mo),
        depositRequiredFcfa: mo.depositRequiredFcfa,
        depositPaidFcfa: paid,
        // Any amount stops the clock, so the farm is told what is still short.
        depositShortFcfa:
          paid > 0 ? Math.max(0, mo.depositRequiredFcfa - paid) : 0,
        depositDueAt: mo.depositDueAt,
        depositExtendedAt: mo.depositExtendedAt,
        fulfilment: mo.fulfilment,
        address: mo.address,
        contactPhone: mo.contactPhone,
        note: mo.note,
        requestExpiresAt: mo.requestExpiresAt,
        createdAt: mo.createdAt,
        acceptedAt: mo.acceptedAt,
        orderId: mo.orderId,
        orderReference: mo.order?.referenceNumber ?? null,
        oversold:
          !!mo.order && this.isOpen(mo.order) && overflowing.has(mo.listing.batchId),
        buyer: {
          fullName: mo.buyer.fullName,
          type: profile?.type ?? CustomerType.PARTICULIER,
          organizationName: profile?.organizationName ?? null,
          city: profile?.city ?? null,
        },
      };
    });
  }

  async accept(user: AuthUser, farmId: string, id: string) {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    const result = await this.dataSource.transaction(async (em) => {
      const mo = await this.lock(em, { id, farmId });
      // A second click answers with the same order rather than an error.
      if (mo.state === MarketOrderState.ACCEPTED) return { mo, order: null };
      if (mo.state !== MarketOrderState.REQUESTED) {
        throw new BadRequestException('Cette demande n’est plus en attente.');
      }
      if (mo.requestExpiresAt.getTime() <= Date.now()) {
        throw new BadRequestException(
          'Cette demande a expiré : l’acheteur doit en refaire une.',
        );
      }

      const listing = await em.getRepository(MarketListing).findOne({
        where: { id: mo.listingId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!listing || listing.status === MarketListingStatus.CLOSED) {
        throw new BadRequestException('Cette annonce est clôturée.');
      }
      const holds = await sanitaryHolds(em, farmId, listing.batchId);
      if (blockedBySanitaryHold(listing, holds)) {
        throw new BadRequestException(
          holds.withdrawalEndDate
            ? `Acceptation impossible : délai d’attente en cours sur ce lot jusqu’au ${holds.withdrawalEndDate}.`
            : 'Acceptation impossible : un soin est en retard sur ce lot.',
        );
      }
      const remaining =
        listing.quantityPublished - (await acceptedQuantity(em, listing.id));
      if (mo.quantity > remaining) {
        throw new BadRequestException(
          `Il ne reste que ${Math.max(0, remaining)} sur cette annonce pour ${mo.quantity} demandé(s).`,
        );
      }

      // createWithin checks the real stock, under its own locks.
      const order = await this.ordersService.createWithin(
        em,
        user,
        farm,
        await this.orderDtoFor(em, user, farm, mo, listing),
        { source: OrderSource.MARKET, deliveryFeeFcfa: mo.deliveryFeeFcfa },
      );

      const now = new Date();
      mo.state = MarketOrderState.ACCEPTED;
      mo.orderId = order.id;
      mo.acceptedAt = now;
      mo.depositDueAt =
        mo.depositRequiredFcfa > 0
          ? new Date(now.getTime() + DEPOSIT_WINDOW_MS)
          : null;
      await em.save(mo);
      return { mo, order };
    });

    if (result.order) {
      await this.ordersService.afterOrderChange(
        farmId,
        result.order.batchId ? [result.order.batchId] : [],
      );
    }
    return this.oneForFarm(user, farmId, id);
  }

  async reject(
    user: AuthUser,
    farmId: string,
    id: string,
    dto: RejectMarketOrderDto,
  ) {
    await this.farmsService.assertAccessible(user, farmId);
    await this.dataSource.transaction(async (em) => {
      const mo = await this.lock(em, { id, farmId });
      if (mo.state !== MarketOrderState.REQUESTED) {
        throw new BadRequestException('Cette demande n’est plus en attente.');
      }
      mo.state = MarketOrderState.REJECTED;
      mo.closedAt = new Date();
      mo.rejectReason = dto.reason || null;
      await em.save(mo);
    });
    return this.oneForFarm(user, farmId, id);
  }

  async extendDeposit(user: AuthUser, farmId: string, id: string) {
    await this.farmsService.assertAccessible(user, farmId);
    await this.dataSource.transaction(async (em) => {
      const mo = await this.lock(em, { id, farmId });
      const order = mo.orderId
        ? await em.getRepository(Order).findOneBy({ id: mo.orderId })
        : null;
      if (
        !mo.depositDueAt ||
        !order ||
        !this.isOpen(order) ||
        order.depositFcfa > 0
      ) {
        throw new BadRequestException(
          'Aucun acompte n’est attendu sur cette commande.',
        );
      }
      if (mo.depositExtendedAt) {
        throw new BadRequestException('Le délai a déjà été prolongé une fois.');
      }
      mo.depositDueAt = new Date(mo.depositDueAt.getTime() + DEPOSIT_WINDOW_MS);
      mo.depositExtendedAt = new Date();
      await em.save(mo);
    });
    return this.oneForFarm(user, farmId, id);
  }

  // ---------- Sweep ----------

  /** Requests nobody answered reserve nothing, so they simply close. */
  async expireRequests(now = new Date()): Promise<number> {
    const result = await this.marketOrderRepo
      .createQueryBuilder()
      .update(MarketOrder)
      .set({ state: MarketOrderState.EXPIRED, closedAt: now })
      .where('state = :state', { state: MarketOrderState.REQUESTED })
      .andWhere('request_expires_at <= :now', { now })
      .execute();
    return result.affected ?? 0;
  }

  /** Cancels accepted orders whose deposit deadline passed with nothing paid. */
  async expireDeposits(now = new Date()): Promise<number> {
    const due = await this.marketOrderRepo
      .createQueryBuilder('mo')
      .innerJoin('mo.order', 'o')
      .where('mo.state = :state', { state: MarketOrderState.ACCEPTED })
      .andWhere('mo.depositDueAt <= :now', { now })
      .andWhere('o.depositFcfa = 0')
      .andWhere('o.status = :pending', { pending: OrderStatus.PENDING })
      .getMany();

    let cancelled = 0;
    for (const candidate of due) {
      try {
        if (await this.expireDeposit(candidate.id, now)) cancelled++;
      } catch (err) {
        // One order failing must not stop the others; the next sweep retries it.
        this.logger.error(`Acompte expiré ${candidate.id}`, err);
      }
    }
    return cancelled;
  }

  /**
   * Holds the request's lock across the cancellation, so an extension can't
   * land in between. cancelForBuyer rechecks money under the order's own lock,
   * so a deposit recorded at this moment keeps the order.
   */
  private expireDeposit(id: string, now: Date): Promise<boolean> {
    return this.dataSource.transaction(async (em) => {
      const mo = await this.lock(em, { id });
      if (!mo.orderId || !mo.depositDueAt || mo.depositDueAt > now) return false;
      const outcome = await this.ordersService.cancelForBuyer(
        mo.farmId,
        mo.orderId,
        DEPOSIT_EXPIRED_REASON,
      );
      if (outcome !== BuyerCancelOutcome.CANCELLED) return false;
      mo.depositExpiredAt = now;
      await em.save(mo);
      return true;
    });
  }

  // ---------- Internals ----------

  private isOpen(order: { status: OrderStatus }): boolean {
    return (
      order.status === OrderStatus.PENDING ||
      order.status === OrderStatus.CONFIRMED
    );
  }

  private totalOf(mo: MarketOrder): number {
    return (
      mo.order?.totalAmountFcfa ??
      mo.quantity * mo.unitPriceFcfa + mo.deliveryFeeFcfa
    );
  }

  private async assertNotOwnFarm(user: AuthUser, farm: Farm) {
    const own =
      farm.ownerId === user.id ||
      (await this.employeeRepo.exists({
        where: { farmId: farm.id, userId: user.id },
      }));
    if (own) {
      throw new BadRequestException(
        'Vous ne pouvez pas commander à votre propre ferme.',
      );
    }
  }

  private async lock(
    em: EntityManager,
    where: { id: string; farmId?: string; buyerUserId?: string },
  ): Promise<MarketOrder> {
    const mo = await em.getRepository(MarketOrder).findOne({
      where,
      lock: { mode: 'pessimistic_write' },
    });
    if (!mo) throw new NotFoundException('Commande introuvable.');
    return mo;
  }

  /** The buyer's customer record at this farm, created on their first order. */
  private async customerFor(
    em: EntityManager,
    operator: AuthUser,
    farmId: string,
    mo: MarketOrder,
  ): Promise<string> {
    const repo = em.getRepository(Customer);
    const existing = await repo.findOne({
      where: { farmId, buyerUserId: mo.buyerUserId },
    });
    if (existing) return existing.id;
    const [account, profile] = await Promise.all([
      em.getRepository(User).findOneByOrFail({ id: mo.buyerUserId }),
      em.getRepository(BuyerProfile).findOneBy({ userId: mo.buyerUserId }),
    ]);
    const created = await this.customersService.buildNew(em, {
      farmId,
      fullName: profile?.organizationName || account.fullName,
      phone: mo.contactPhone,
      city: profile?.city ?? null,
      type: profile?.type ?? CustomerType.PARTICULIER,
      createdById: operator.id,
    });
    created.buyerUserId = mo.buyerUserId;
    await repo.save(created);
    return created.id;
  }

  private async orderDtoFor(
    em: EntityManager,
    operator: AuthUser,
    farm: Farm,
    mo: MarketOrder,
    listing: MarketListing,
  ): Promise<CreateOrderDto> {
    const delivered = mo.fulfilment === MarketFulfilment.DELIVERY;
    const isPre = listing.kind === MarketListingKind.PRE;
    return {
      canal: isPre
        ? OrderCanal.PRECOMMANDE
        : delivered
          ? OrderCanal.LIVRAISON
          : OrderCanal.FERME,
      idempotencyKey: `market:${mo.id}`,
      expectedDate: (isPre ? listing.readyDate : mo.desiredDate) ?? undefined,
      address: mo.address ?? undefined,
      customerId: await this.customerFor(em, operator, farm.id, mo),
      items: [
        {
          productType:
            listing.product === MarketProduct.EGGS
              ? SaleItemProductType.OEUFS
              : SaleItemProductType.POULET_PIECE,
          quantity: mo.quantity,
          unitPriceFcfa: mo.unitPriceFcfa,
          batchId: listing.batchId,
        },
      ],
    };
  }

  private loadViews(where: {
    id?: string;
    farmId?: string;
    buyerUserId?: string;
    state?: MarketOrderState;
  }) {
    return this.marketOrderRepo.find({
      where,
      relations: {
        order: true,
        buyer: true,
        farm: { owner: true },
        listing: { batch: { breed: true } },
      },
      order: { createdAt: 'DESC' },
    });
  }

  private async oneForFarm(user: AuthUser, farmId: string, id: string) {
    await this.farmsService.assertAccessible(user, farmId);
    const [found] = await this.farmViews({ id, farmId });
    if (!found) throw new NotFoundException('Commande introuvable.');
    return found;
  }

  /** Whitelist: what a buyer can read about their own order. */
  private toBuyerView(mo: MarketOrder) {
    const { listing, farm, order } = mo;
    const status = buyerStatus(mo, order);
    const accepted = mo.state === MarketOrderState.ACCEPTED;
    return {
      id: mo.id,
      status,
      listingId: mo.listingId,
      kind: listing.kind,
      product: listing.product,
      species: listing.batch.species,
      customSpecies: listing.batch.customSpecies,
      breedName: listing.batch.breed?.name ?? listing.batch.customBreed,
      readyDate: listing.readyDate,
      previousReadyDate: listing.previousReadyDate,
      desiredDate: mo.desiredDate,
      quantity: mo.quantity,
      unitPriceFcfa: mo.unitPriceFcfa,
      deliveryFeeFcfa: mo.deliveryFeeFcfa,
      totalFcfa: this.totalOf(mo),
      depositRequiredFcfa: mo.depositRequiredFcfa,
      depositPaidFcfa: order?.depositFcfa ?? 0,
      depositDueAt: mo.depositDueAt,
      fulfilment: mo.fulfilment,
      address: mo.address,
      contactPhone: mo.contactPhone,
      note: mo.note,
      rejectReason: mo.rejectReason,
      requestExpiresAt: mo.requestExpiresAt,
      createdAt: mo.createdAt,
      orderReference: order?.referenceNumber ?? null,
      farm: {
        id: farm.id,
        name: farm.name,
        city: farm.administrativeCity,
        logoUrl: farm.logoUrl,
        // Push isn't available yet, so this is how a buyer reaches the farm.
        phone: accepted ? farm.owner.phone : null,
      },
      timeline: this.timelineOf(mo),
    };
  }

  /** Built from the dates already stored, so it can't disagree with them. */
  private timelineOf(mo: MarketOrder) {
    const { order } = mo;
    const events: { type: string; at: Date }[] = [
      { type: 'REQUESTED', at: mo.createdAt },
    ];
    if (mo.closedAt) {
      events.push({
        type:
          mo.state === MarketOrderState.REJECTED
            ? 'REJECTED'
            : mo.state === MarketOrderState.WITHDRAWN
              ? 'WITHDRAWN'
              : 'REQUEST_EXPIRED',
        at: mo.closedAt,
      });
    }
    if (mo.acceptedAt) events.push({ type: 'ACCEPTED', at: mo.acceptedAt });
    if (mo.depositExtendedAt) {
      events.push({ type: 'DEPOSIT_EXTENDED', at: mo.depositExtendedAt });
    }
    if (order?.livredAt) events.push({ type: 'DELIVERED', at: order.livredAt });
    if (order?.cancelledAt) {
      events.push({
        type: mo.depositExpiredAt ? 'DEPOSIT_EXPIRED' : 'CANCELLED',
        at: order.cancelledAt,
      });
    }
    return events.sort((a, b) => a.at.getTime() - b.at.getTime());
  }
}
