import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { InputKind } from '../../common/enums/input-kind.enum.js';
import { FeedEntryType } from '../../common/enums/feed-entry-type.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { InputLot } from '../inputs/entities/input-lot.entity.js';
import { FeedProduct } from './entities/feed-product.entity.js';
import { CreateFeedProductDto } from './dto/create-feed-product.dto.js';
import { UpdateFeedProductDto } from './dto/update-feed-product.dto.js';

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

@Injectable()
export class FeedProductsService {
  constructor(
    @InjectRepository(FeedProduct)
    private readonly productRepo: Repository<FeedProduct>,
    @InjectRepository(InputLot)
    private readonly inputRepo: Repository<InputLot>,
    private readonly farmsService: FarmsService,
  ) {}

  async create(
    user: AuthUser,
    farmId: string,
    dto: CreateFeedProductDto,
  ): Promise<FeedProduct> {
    await this.farmsService.assertAccessible(user, farmId);
    const name = normalizeName(dto.name);
    const existing = await this.productRepo.findOne({ where: { farmId, name } });
    if (existing) {
      throw new ConflictException(
        'Un produit porte déjà ce nom dans cette ferme.',
      );
    }
    const entryType = dto.entryType ?? FeedEntryType.BAG;
    return this.productRepo.save(
      this.productRepo.create({
        farmId,
        name,
        entryType,
        foodType: dto.foodType ?? null,
        feedPhase: dto.feedPhase ?? null,
        customFeedPhaseName: dto.customFeedPhaseName ?? null,
        defaultSacKg: dto.defaultSacKg ?? null,
        defaultBagSizeKg: dto.defaultBagSizeKg ?? null,
        defaultUnitPriceFcfa: dto.defaultUnitPriceFcfa ?? null,
        defaultCostPerMtFcfa: dto.defaultCostPerMtFcfa ?? null,
        defaultCostPerBagFcfa: dto.defaultCostPerBagFcfa ?? null,
        supplier: dto.supplier ?? null,
        manufacturer: dto.manufacturer?.trim() || null,
        proteinPct: dto.proteinPct ?? null,
        energyKcalKg: dto.energyKcalKg ?? null,
        authorizedRef: dto.authorizedRef?.trim() || null,
        active: dto.active ?? true,
      }),
    );
  }

  async list(user: AuthUser, farmId: string): Promise<FeedProduct[]> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.productRepo.find({
      where: { farmId },
      order: { active: 'DESC', name: 'ASC' },
    });
  }

  async update(
    user: AuthUser,
    farmId: string,
    productId: string,
    dto: UpdateFeedProductDto,
  ): Promise<FeedProduct> {
    await this.farmsService.assertAccessible(user, farmId);
    const product = await this.productRepo.findOne({
      where: { id: productId, farmId },
    });
    if (!product) throw new NotFoundException('Produit introuvable.');
    if (dto.name !== undefined) {
      const name = normalizeName(dto.name);
      if (name !== product.name) {
        const clash = await this.productRepo.findOne({
          where: { farmId, name },
        });
        if (clash && clash.id !== productId) {
          throw new ConflictException(
            'Un produit porte déjà ce nom dans cette ferme.',
          );
        }
        product.name = name;
      }
    }
    const patch: Partial<FeedProduct> = {};
    if (dto.entryType !== undefined) patch.entryType = dto.entryType;
    if (dto.foodType !== undefined) patch.foodType = dto.foodType;
    if (dto.feedPhase !== undefined) patch.feedPhase = dto.feedPhase;
    if (dto.customFeedPhaseName !== undefined)
      patch.customFeedPhaseName = dto.customFeedPhaseName;
    if (dto.defaultSacKg !== undefined) patch.defaultSacKg = dto.defaultSacKg;
    if (dto.defaultBagSizeKg !== undefined)
      patch.defaultBagSizeKg = dto.defaultBagSizeKg;
    if (dto.defaultUnitPriceFcfa !== undefined)
      patch.defaultUnitPriceFcfa = dto.defaultUnitPriceFcfa;
    if (dto.defaultCostPerMtFcfa !== undefined)
      patch.defaultCostPerMtFcfa = dto.defaultCostPerMtFcfa;
    if (dto.defaultCostPerBagFcfa !== undefined)
      patch.defaultCostPerBagFcfa = dto.defaultCostPerBagFcfa;
    if (dto.supplier !== undefined) patch.supplier = dto.supplier;
    if (dto.manufacturer !== undefined)
      patch.manufacturer = dto.manufacturer?.trim() || null;
    if (dto.proteinPct !== undefined) patch.proteinPct = dto.proteinPct ?? null;
    if (dto.energyKcalKg !== undefined)
      patch.energyKcalKg = dto.energyKcalKg ?? null;
    if (dto.authorizedRef !== undefined)
      patch.authorizedRef = dto.authorizedRef?.trim() || null;
    if (dto.active !== undefined) patch.active = dto.active;
    return this.productRepo.save(this.productRepo.merge(product, patch));
  }

  async remove(
    user: AuthUser,
    farmId: string,
    productId: string,
  ): Promise<{ deleted: boolean }> {
    await this.farmsService.assertAccessible(user, farmId);
    const product = await this.productRepo.findOne({
      where: { id: productId, farmId },
    });
    if (!product) throw new NotFoundException('Produit introuvable.');
    const linked = await this.inputRepo.count({
      where: { farmId, productId, kind: InputKind.ALIMENT },
    });
    if (linked > 0) {
      throw new BadRequestException(
        'Ce produit est rattaché à des entrées d’aliment : impossible de le supprimer (traçabilité HACCP). Désactivez-le plutôt.',
      );
    }
    await this.productRepo.remove(product);
    return { deleted: true };
  }
}