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
import { sanitaryHolds } from '../sanitary/sanitary-holds.js';
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
import { acceptedQuantity } from './market-order-rules.js';

const DEFAULT_PAGE = 20;
/** Listings looked at per catalogue read: each one costs stock and sanitary queries. */
const CATALOGUE_SCAN_LIMIT = 200;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ListingState {
  availableQuantity: number;
  hiddenReason: MarketHiddenReason | null;
}

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
  ) {}

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
          ? `Publication impossible : délai d’attente en cours sur ce lot jusqu’au ${holds.withdrawalEndDate}.`
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
    return Promise.all(listings.map((l) => this.toFarmView(l)));
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
    const visible: ReturnType<MarketListingsService['toPublicView']>[] = [];
    let skipped = 0;
    for (const listing of candidates) {
      const state = await this.stateOf(em, listing);
      if (state.hiddenReason) continue;
      if (skipped < offset) {
        skipped++;
        continue;
      }
      visible.push(this.toPublicView(listing, state.availableQuantity));
      if (visible.length > limit) break;
    }
    return {
      items: visible.slice(0, limit),
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
    return this.toPublicView(listing, state.availableQuantity);
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

  async stateOf(
    em: EntityManager,
    listing: MarketListing,
  ): Promise<ListingState> {
    const [free, holds, accepted] = await Promise.all([
      this.freeStock(em, listing),
      sanitaryHolds(em, listing.farmId, listing.batchId),
      acceptedQuantity(em, listing.id),
    ]);
    const availableQuantity = Math.max(
      0,
      Math.min(listing.quantityPublished - accepted, free),
    );
    return {
      availableQuantity,
      hiddenReason: hiddenReason({
        listing,
        farm: listing.farm,
        batchStatus: listing.batch.status,
        holds,
        availableQuantity,
        today: todayStr(),
      }),
    };
  }

  private async toFarmView(listing: MarketListing) {
    const state = await this.stateOf(this.dataSource.manager, listing);
    const { farm: _farm, batch, slaughterOrder: _source, ...fields } = listing;
    return {
      ...fields,
      batchName: batch.batchName,
      availableQuantity: state.availableQuantity,
      hiddenReason: state.hiddenReason,
    };
  }

  /** Whitelist: what anyone on the internet can read. */
  private toPublicView(listing: MarketListing, availableQuantity: number) {
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
      farm: {
        id: farm.id,
        name: farm.name,
        city: farm.administrativeCity,
        logoUrl: farm.logoUrl,
      },
    };
  }
}
