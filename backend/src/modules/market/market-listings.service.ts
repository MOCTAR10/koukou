import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import {
  MarketHiddenReason,
  MarketListingKind,
  MarketListingStatus,
  MarketProduct,
} from '../../common/enums/market.enum.js';
import { ReferenceKey } from '../../common/enums/reference-key.enum.js';
import { SlaughterStatus } from '../../common/enums/slaughter-status.enum.js';
import { SlaughterType } from '../../common/enums/slaughter-type.enum.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { BreedStandard } from '../breeds/entities/breed-standard.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { ReferenceConstantsService } from '../reference-constants/reference-constants.service.js';
import { SlaughterOrder } from '../slaughter/entities/slaughter-order.entity.js';
import {
  sanitaryHolds,
  sanitaryHoldsMany,
  type SanitaryHolds,
} from '../sanitary/sanitary-holds.js';
import {
  CreateMarketListingDto,
  MarketCatalogueQueryDto,
  ReadyDateSuggestionQueryDto,
  UpdateMarketListingDto,
} from './dto/market-listing.dto.js';
import { MarketListing } from './entities/market-listing.entity.js';
import {
  blockedBySanitaryHold,
  hiddenReason,
  suggestReadyDate,
} from './listing-rules.js';
import { acceptedQuantities, acceptedQuantity } from './market-order-rules.js';
import type { Farm } from '../farms/entities/farm.entity.js';
import { TraceConfigService } from '../trace/trace-config.service.js';
import { lotQrUrl } from '../trace/qr-signature.js';
import { dateFr, todayLocal } from '../../common/utils/date.utils.js';

const DEFAULT_PAGE = 20;
/** Listings looked at per catalogue read: each one costs stock and sanitary queries. */
const CATALOGUE_SCAN_LIMIT = 200;

function todayStr(): string {
  return todayLocal();
}

/** Reads shared by many listings (see prefetchState). */
interface StatePrefetch {
  holds: Map<string, SanitaryHolds>;
  accepted: Map<string, number>;
  /** Free stock per listing id (eggs grouped, birds/carcasses from the loaded relations). */
  free: Map<string, number>;
}

interface ListingState {
  availableQuantity: number;
  hiddenReason: MarketHiddenReason | null;
}

/** The band's traced lot, shown on a listing (CDC §6 « Consommons Gabonais »). */
export interface ListingTraceLot {
  code: string;
  /** Public lot page of the web app, signed like the printed QR code. */
  path: string;
  url: string;
}

/** Programme status family of an operational farm (a code's family never changes). */
const OPERATIONAL_FAMILY = 'OPERATIONNELLE';

@Injectable()
export class MarketListingsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MarketListing)
    private readonly listingRepo: Repository<MarketListing>,
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    @InjectRepository(BreedStandard)
    private readonly standardRepo: Repository<BreedStandard>,
    private readonly farmsService: FarmsService,
    private readonly ordersService: OrdersService,
    private readonly constants: ReferenceConstantsService,
    private readonly traceConfig: TraceConfigService,
  ) {}

  /** `programId:statusCode` to family; safe to keep, since a family never changes. */
  private readonly statusFamilies = new Map<string, string | null>();

  private async farmOperational(
    em: EntityManager,
    farm: Pick<Farm, 'programId' | 'statusCode'>,
  ): Promise<boolean> {
    if (!farm.statusCode) return false;
    const key = `${farm.programId}:${farm.statusCode}`;
    if (!this.statusFamilies.has(key)) {
      const rows: { family: string | null }[] = await em.query(
        `SELECT family FROM ref_items
          WHERE program_id = $1 AND list_type = 'STATUT_FERME' AND code = $2`,
        [farm.programId, farm.statusCode],
      );
      this.statusFamilies.set(key, rows[0]?.family ?? null);
    }
    return this.statusFamilies.get(key) === OPERATIONAL_FAMILY;
  }

  /** Root traceability lot of each band, by batch id (lots never change code). */
  private async traceLots(
    batchIds: readonly string[],
  ): Promise<Map<string, ListingTraceLot>> {
    const ids = [...new Set(batchIds)];
    if (ids.length === 0) return new Map();
    const rows: { batchId: string; code: string; qrToken: string }[] =
      await this.dataSource.query(
        `SELECT batch_id AS "batchId", code, qr_token AS "qrToken"
           FROM trace_lots WHERE kind = 'LOT' AND batch_id = ANY($1::uuid[])`,
        [ids],
      );
    return new Map(
      rows.map((r) => [
        r.batchId,
        {
          code: r.code,
          path: lotQrUrl('', r.code, r.qrToken),
          url: this.traceConfig.qrUrl(r.code, r.qrToken),
        },
      ]),
    );
  }

  // ---------- Farm side ----------

  async create(user: AuthUser, farmId: string, dto: CreateMarketListingDto) {
    await this.farmsService.assertAccessible(user, farmId);
    if (dto.kind === MarketListingKind.PRE && dto.product !== MarketProduct.BIRDS) {
      throw new BadRequestException(
        'Seule la volaille peut être proposée en précommande.',
      );
    }
    let batchId = dto.batchId!;
    let slaughterOrderId: string | null = null;
    if (dto.product === MarketProduct.CARCASS) {
      if (dto.kind !== MarketListingKind.NOW) {
        throw new BadRequestException(
          'Des carcasses se vendent immédiatement, pas en précommande.',
        );
      }
      const source = await this.loadCarcassSource(farmId, dto.slaughterOrderId!);
      batchId = source.batchId;
      slaughterOrderId = source.id;
    } else {
      await this.loadOpenBatch(farmId, batchId);
    }
    const listing = this.listingRepo.create({
      farmId,
      kind: dto.kind,
      product: dto.product,
      batchId,
      slaughterOrderId,
      description: dto.description?.trim() || null,
      unitPriceFcfa: dto.unitPriceFcfa,
      quantityPublished: dto.quantityPublished,
      minOrderQty: dto.minOrderQty ?? 1,
      readyDate: dto.readyDate ?? null,
      depositPct: dto.depositPct ?? null,
      pickupAvailable: dto.pickupAvailable ?? true,
      deliveryAvailable: dto.deliveryAvailable ?? false,
      deliveryFeeFcfa: dto.deliveryFeeFcfa ?? 0,
      status: MarketListingStatus.DRAFT,
      createdById: user.id,
    });
    this.assertConsistent(listing);
    const saved = await this.listingRepo.save(listing);
    return this.getForFarm(user, farmId, saved.id);
  }

  async update(
    user: AuthUser,
    farmId: string,
    listingId: string,
    dto: UpdateMarketListingDto,
  ) {
    const listing = await this.loadForFarm(user, farmId, listingId);
    if (listing.status === MarketListingStatus.CLOSED) {
      throw new BadRequestException('Annonce clôturée : modification impossible.');
    }
    if (
      dto.readyDate !== undefined &&
      dto.readyDate !== listing.readyDate &&
      listing.status !== MarketListingStatus.DRAFT
    ) {
      throw new BadRequestException(
        'La date d’une annonce déjà publiée ne se change pas ici : les acheteurs doivent en être informés.',
      );
    }
    if (dto.description !== undefined) {
      listing.description = dto.description?.trim() || null;
    }
    if (dto.unitPriceFcfa !== undefined) listing.unitPriceFcfa = dto.unitPriceFcfa;
    if (dto.quantityPublished !== undefined) {
      listing.quantityPublished = dto.quantityPublished;
    }
    if (dto.minOrderQty !== undefined) listing.minOrderQty = dto.minOrderQty;
    if (dto.readyDate !== undefined) listing.readyDate = dto.readyDate;
    if (dto.depositPct !== undefined) listing.depositPct = dto.depositPct;
    if (dto.pickupAvailable !== undefined) {
      listing.pickupAvailable = dto.pickupAvailable;
    }
    if (dto.deliveryAvailable !== undefined) {
      listing.deliveryAvailable = dto.deliveryAvailable;
    }
    if (dto.deliveryFeeFcfa !== undefined) {
      listing.deliveryFeeFcfa = dto.deliveryFeeFcfa;
    }
    this.assertConsistent(listing);
    if (listing.status === MarketListingStatus.PUBLISHED) {
      await this.assertStockCovers(listing);
    }
    await this.listingRepo.save(listing);
    return this.getForFarm(user, farmId, listingId);
  }

  async publish(user: AuthUser, farmId: string, listingId: string) {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    const listing = await this.loadForFarm(user, farmId, listingId);
    if (listing.status === MarketListingStatus.CLOSED) {
      throw new BadRequestException('Annonce clôturée : publication impossible.');
    }
    if (farm.active === false) {
      throw new BadRequestException(
        'Ferme suspendue : aucune annonce ne peut être publiée.',
      );
    }
    if (!farm.isVerified) {
      throw new BadRequestException(
        'Seules les fermes vérifiées peuvent publier sur le Market. Contactez Fermia pour faire vérifier la ferme.',
      );
    }
    this.assertConsistent(listing);
    if (listing.product !== MarketProduct.CARCASS) {
      await this.loadOpenBatch(farmId, listing.batchId);
    }
    if (
      listing.kind === MarketListingKind.PRE &&
      listing.readyDate! <= todayStr()
    ) {
      throw new BadRequestException(
        'La date de disponibilité d’une précommande doit être dans le futur.',
      );
    }
    const holds = await sanitaryHolds(
      this.dataSource.manager,
      farmId,
      listing.batchId,
    );
    if (blockedBySanitaryHold(listing, holds)) {
      throw new BadRequestException(
        holds.withdrawalEndDate
          ? `Publication impossible : délai d’attente en cours sur ce lot jusqu’au ${dateFr(holds.withdrawalEndDate)}.`
          : 'Publication impossible : un soin est en retard sur ce lot.',
      );
    }
    await this.assertStockCovers(listing);
    listing.status = MarketListingStatus.PUBLISHED;
    listing.publishedAt = new Date();
    await this.listingRepo.save(listing);
    return this.getForFarm(user, farmId, listingId);
  }

  async pause(user: AuthUser, farmId: string, listingId: string) {
    const listing = await this.loadForFarm(user, farmId, listingId);
    if (listing.status !== MarketListingStatus.PUBLISHED) {
      throw new BadRequestException('Seule une annonce publiée peut être suspendue.');
    }
    listing.status = MarketListingStatus.PAUSED;
    await this.listingRepo.save(listing);
    return this.getForFarm(user, farmId, listingId);
  }

  async close(user: AuthUser, farmId: string, listingId: string) {
    const listing = await this.loadForFarm(user, farmId, listingId);
    if (listing.status !== MarketListingStatus.CLOSED) {
      listing.status = MarketListingStatus.CLOSED;
      await this.listingRepo.save(listing);
    }
    return this.getForFarm(user, farmId, listingId);
  }

  async listForFarm(user: AuthUser, farmId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    const listings = await this.listingRepo.find({
      where: { farmId },
      relations: { farm: true, batch: { breed: true }, slaughterOrder: true },
      order: { createdAt: 'DESC' },
    });
    const pre = await this.prefetchState(this.dataSource.manager, listings);
    const lots = await this.traceLots(listings.map((l) => l.batchId));
    return Promise.all(listings.map((l) => this.toFarmView(l, pre, lots)));
  }

  async getForFarm(user: AuthUser, farmId: string, listingId: string) {
    await this.loadForFarm(user, farmId, listingId);
    const listing = await this.listingRepo.findOneOrFail({
      where: { id: listingId },
      relations: { farm: true, batch: { breed: true }, slaughterOrder: true },
    });
    return this.toFarmView(listing);
  }

  async suggestDate(
    user: AuthUser,
    farmId: string,
    query: ReadyDateSuggestionQueryDto,
  ) {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.batchRepo.findOne({
      where: { id: query.batchId, farmId },
    });
    if (!batch) throw new NotFoundException('Lot introuvable dans cette ferme.');
    const [minAgeDays, standards, holds] = await Promise.all([
      this.constants.get(ReferenceKey.VENTE_AGE_MIN_DAYS, 35),
      batch.breedId
        ? this.standardRepo.find({ where: { breedId: batch.breedId } })
        : Promise.resolve([]),
      sanitaryHolds(this.dataSource.manager, farmId, batch.id),
    ]);
    return {
      suggestion: suggestReadyDate({
        batchType: batch.type,
        integrationDate: batch.integrationDate,
        initialAgeDays: batch.initialAgeDays,
        minAgeDays,
        standards,
        targetWeightKg: query.targetWeightKg,
        withdrawalEndDate: holds.withdrawalEndDate,
        today: todayStr(),
      }),
    };
  }

  // ---------- Public catalogue ----------

  async catalogue(query: MarketCatalogueQueryDto) {
    const limit = query.limit ?? DEFAULT_PAGE;
    const offset = query.offset ?? 0;
    const qb = this.listingRepo
      .createQueryBuilder('listing')
      .innerJoinAndSelect('listing.farm', 'farm')
      .innerJoinAndSelect('listing.batch', 'batch')
      .leftJoinAndSelect('batch.breed', 'breed')
      .leftJoinAndSelect('listing.slaughterOrder', 'slaughterOrder')
      .where('listing.status = :status', {
        status: MarketListingStatus.PUBLISHED,
      })
      .andWhere('farm.active = true')
      .andWhere('farm.isVerified = true')
      .orderBy('listing.publishedAt', 'DESC')
      .addOrderBy('listing.id', 'ASC')
      .take(CATALOGUE_SCAN_LIMIT);
    if (query.kind) qb.andWhere('listing.kind = :kind', { kind: query.kind });
    if (query.product) {
      qb.andWhere('listing.product = :product', { product: query.product });
    }
    if (query.species) {
      qb.andWhere('batch.species = :species', { species: query.species });
    }
    if (query.city?.trim()) {
      qb.andWhere('LOWER(farm.administrativeCity) = LOWER(:city)', {
        city: query.city.trim(),
      });
    }
    const candidates = await qb.getMany();

    // Visibility depends on stock and sanitary state, so it can't be a filter
    // in the query. Stops once it has one more than the page, to know of a next.
    const em = this.dataSource.manager;
    const pre = await this.prefetchState(em, candidates);
    const visible: { listing: MarketListing; availableQuantity: number }[] = [];
    let skipped = 0;
    for (const listing of candidates) {
      const state = await this.stateOf(em, listing, pre);
      if (state.hiddenReason) continue;
      if (skipped < offset) {
        skipped++;
        continue;
      }
      visible.push({ listing, availableQuantity: state.availableQuantity });
      if (visible.length > limit) break;
    }
    const page = visible.slice(0, limit);
    const lots = await this.traceLots(page.map((v) => v.listing.batchId));
    return {
      items: page.map((v) =>
        this.toPublicView(
          v.listing,
          v.availableQuantity,
          lots.get(v.listing.batchId) ?? null,
        ),
      ),
      hasMore: visible.length > limit,
    };
  }

  async catalogueItem(listingId: string) {
    const listing = await this.listingRepo.findOne({
      where: { id: listingId },
      relations: { farm: true, batch: { breed: true }, slaughterOrder: true },
    });
    // Same answer for an unknown and a hidden listing: a draft stays private.
    if (!listing) throw new NotFoundException('Annonce introuvable.');
    const state = await this.stateOf(this.dataSource.manager, listing);
    if (state.hiddenReason) throw new NotFoundException('Annonce introuvable.');
    const lots = await this.traceLots([listing.batchId]);
    return this.toPublicView(
      listing,
      state.availableQuantity,
      lots.get(listing.batchId) ?? null,
    );
  }

  // ---------- Internals ----------

  private async loadForFarm(user: AuthUser, farmId: string, listingId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    const listing = await this.listingRepo.findOne({
      where: { id: listingId, farmId },
    });
    if (!listing) throw new NotFoundException('Annonce introuvable.');
    return listing;
  }

  private async loadOpenBatch(farmId: string, batchId: string) {
    const batch = await this.batchRepo.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch) throw new NotFoundException('Lot introuvable dans cette ferme.');
    if (batch.status === BatchStatus.CLOTURE || batch.status === BatchStatus.FINI) {
      throw new BadRequestException(
        'Ce lot est terminé : il ne peut plus être mis en vente.',
      );
    }
    return batch;
  }

  private async loadCarcassSource(farmId: string, id: string) {
    const source = await this.dataSource.manager
      .getRepository(SlaughterOrder)
      .findOne({ where: { id, farmId } });
    if (!source) {
      throw new NotFoundException('Ordre d’abattage introuvable dans cette ferme.');
    }
    if (
      source.status !== SlaughterStatus.PROCESSED ||
      source.slaughterType !== SlaughterType.ABATTU
    ) {
      throw new BadRequestException(
        'Seules les carcasses d’un abattage traité peuvent être mises en vente.',
      );
    }
    return source;
  }

  private assertConsistent(listing: MarketListing) {
    if (listing.kind === MarketListingKind.PRE && !listing.readyDate) {
      throw new BadRequestException(
        'Une précommande doit indiquer sa date de disponibilité.',
      );
    }
    if (listing.kind === MarketListingKind.NOW) {
      if (listing.readyDate) {
        throw new BadRequestException(
          'Seule une précommande a une date de disponibilité.',
        );
      }
      if (listing.depositPct != null) {
        throw new BadRequestException(
          'Seule une précommande peut demander un acompte.',
        );
      }
    }
    if (!listing.pickupAvailable && !listing.deliveryAvailable) {
      throw new BadRequestException(
        'Proposez au moins le retrait à la ferme ou la livraison.',
      );
    }
    if (!listing.deliveryAvailable && listing.deliveryFeeFcfa > 0) {
      throw new BadRequestException(
        'Des frais de livraison demandent que la livraison soit proposée.',
      );
    }
    if (listing.minOrderQty > listing.quantityPublished) {
      throw new BadRequestException(
        'La quantité minimale dépasse la quantité publiée.',
      );
    }
  }

  private async assertStockCovers(listing: MarketListing) {
    const em = this.dataSource.manager;
    const accepted = await acceptedQuantity(em, listing.id);
    if (listing.quantityPublished < accepted) {
      throw new BadRequestException(
        `${accepted} déjà accepté(s) sur cette annonce : la quantité publiée ne peut pas être inférieure.`,
      );
    }
    // Accepted orders are already reserved, so they aren't in the free stock.
    const free = await this.freeStock(em, listing);
    const toCover = listing.quantityPublished - accepted;
    if (toCover > free) {
      throw new BadRequestException(
        `Stock insuffisant : ${free} ${listing.product === MarketProduct.EGGS ? 'alvéole(s)' : listing.product === MarketProduct.CARCASS ? 'carcasse(s)' : 'oiseau(x)'} libre(s) sur ce lot, ${toCover} à publier.`,
      );
    }
  }

  private async freeStock(em: EntityManager, listing: MarketListing) {
    if (listing.product === MarketProduct.EGGS) {
      return this.ordersService.freeEggAlveoles(
        em,
        listing.farmId,
        listing.batchId,
      );
    }
    if (listing.product === MarketProduct.CARCASS) {
      const source = await em
        .getRepository(SlaughterOrder)
        .findOneBy({ id: listing.slaughterOrderId! });
      return source?.carcassesAvailable ?? 0;
    }
    const batch = await em
      .getRepository(ProductionBatch)
      .findOneByOrFail({ id: listing.batchId });
    return this.ordersService.freeBirds(em, batch);
  }

  /** Holds and accepted quantities of many listings, in two grouped reads. */
  private async prefetchState(
    em: EntityManager,
    listings: MarketListing[],
  ): Promise<StatePrefetch> {
    const eggListings = listings.filter((l) => l.product === MarketProduct.EGGS);
    const birdListings = listings.filter(
      (l) => l.product !== MarketProduct.EGGS && l.product !== MarketProduct.CARCASS,
    );
    const [holds, accepted, eggFree, birdFree] = await Promise.all([
      sanitaryHoldsMany(em, [...new Set(listings.map((l) => l.batchId))]),
      acceptedQuantities(
        em,
        listings.map((l) => l.id),
      ),
      this.ordersService.freeEggAlveolesMany(em, eggListings),
      this.ordersService.freeBirdsMany(
        em,
        birdListings.map((l) => l.batch),
      ),
    ]);
    const free = new Map<string, number>();
    for (const l of listings) {
      if (l.product === MarketProduct.EGGS) {
        free.set(l.id, eggFree.get(l.batchId) ?? 0);
      } else if (l.product === MarketProduct.CARCASS) {
        free.set(l.id, l.slaughterOrder?.carcassesAvailable ?? 0);
      } else {
        free.set(l.id, birdFree.get(l.batchId) ?? 0);
      }
    }
    return { holds, accepted, free };
  }

  async stateOf(
    em: EntityManager,
    listing: MarketListing,
    pre?: StatePrefetch,
  ): Promise<ListingState> {
    const [free, holds, accepted, operational] = await Promise.all([
      pre?.free.has(listing.id)
        ? Promise.resolve(pre.free.get(listing.id)!)
        : this.freeStock(em, listing),
      pre
        ? Promise.resolve(
            pre.holds.get(listing.batchId) ?? {
              withdrawalEndDate: null,
              prophylaxisOverdue: false,
            },
          )
        : sanitaryHolds(em, listing.farmId, listing.batchId),
      pre
        ? Promise.resolve(pre.accepted.get(listing.id) ?? 0)
        : acceptedQuantity(em, listing.id),
      this.farmOperational(em, listing.farm),
    ]);
    const availableQuantity = Math.max(
      0,
      Math.min(listing.quantityPublished - accepted, free),
    );
    return {
      availableQuantity,
      hiddenReason: hiddenReason({
        listing,
        farm: {
          active: listing.farm.active,
          isVerified: listing.farm.isVerified,
          operational,
        },
        batchStatus: listing.batch.status,
        holds,
        availableQuantity,
        today: todayStr(),
      }),
    };
  }

  private async toFarmView(
    listing: MarketListing,
    pre?: StatePrefetch,
    prefetchedLots?: Map<string, ListingTraceLot>,
  ) {
    const state = await this.stateOf(this.dataSource.manager, listing, pre);
    const lots = prefetchedLots ?? (await this.traceLots([listing.batchId]));
    const { farm: _farm, batch, slaughterOrder: _source, ...fields } = listing;
    return {
      ...fields,
      traceLot: lots.get(listing.batchId) ?? null,
      batchName: batch.batchName,
      species: batch.species,
      customSpecies: batch.customSpecies,
      breedName: batch.breed?.name ?? batch.customBreed,
      availableQuantity: state.availableQuantity,
      hiddenReason: state.hiddenReason,
    };
  }

  /** Whitelist: what anyone on the internet can read. */
  private toPublicView(
    listing: MarketListing,
    availableQuantity: number,
    traceLot: ListingTraceLot | null,
  ) {
    const { farm, batch } = listing;
    return {
      id: listing.id,
      kind: listing.kind,
      product: listing.product,
      description: listing.description,
      unitPriceFcfa: listing.unitPriceFcfa,
      availableQuantity,
      minOrderQty: listing.minOrderQty,
      readyDate: listing.readyDate,
      previousReadyDate: listing.previousReadyDate,
      depositPct: listing.depositPct,
      pickupAvailable: listing.pickupAvailable,
      deliveryAvailable: listing.deliveryAvailable,
      deliveryFeeFcfa: listing.deliveryFeeFcfa,
      publishedAt: listing.publishedAt,
      species: batch.species,
      customSpecies: batch.customSpecies,
      breedName: batch.breed?.name ?? batch.customBreed,
      batchType: batch.type,
      // How fresh a carcass is: a buyer has to be able to judge it.
      slaughteredAt: listing.slaughterOrder?.processedAt ?? null,
      // Traced lot and its public page (origin only, no personal data).
      traceLot,
      farm: {
        id: farm.id,
        name: farm.name,
        city: farm.administrativeCity,
        logoUrl: farm.logoUrl,
      },
    };
  }
}
