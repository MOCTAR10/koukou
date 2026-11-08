import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { FarmsService } from '../farms/farms.service.js';
import { Customer } from './entities/customer.entity.js';
import { Promotion } from './entities/promotion.entity.js';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto.js';
import { PromotionType } from '../../common/enums/promotion-type.enum.js';
import { todayLocal } from '../../common/utils/date.utils.js';

function todayStr(): string {
  return todayLocal();
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown })?.code === '23505';
}

function alreadyExists(code: string): ConflictException {
  return new ConflictException(
    `Un code promo « ${code} » existe déjà dans cette ferme.`,
  );
}

@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(Promotion)
    private readonly promoRepo: Repository<Promotion>,
    private readonly farmsService: FarmsService,
  ) {}

  async create(
    user: AuthUser,
    farmId: string,
    dto: CreatePromotionDto,
  ): Promise<Promotion> {
    await this.farmsService.assertAccessible(user, farmId);
    const code = dto.code.trim().toUpperCase();
    const existing = await this.promoRepo.findOne({
      where: { farmId, code },
    });
    if (existing)
      throw alreadyExists(code);
    if (dto.customerId) {
      await this.assertCustomerInFarm(farmId, dto.customerId);
    }
    if (dto.type === PromotionType.PCT && dto.value > 100) {
      throw new BadRequestException(
        'Un pourcentage de réduction ne peut pas dépasser 100%.',
      );
    }
    try {
      return await this.promoRepo.save(
        this.promoRepo.create({
          farmId,
          code,
          label: dto.label.trim(),
          type: dto.type,
          value: dto.value,
          active: dto.active ?? true,
          startDate: dto.startDate ?? null,
          endDate: dto.endDate ?? null,
          minSubtotalFcfa: dto.minSubtotalFcfa ?? null,
          customerId: dto.customerId ?? null,
          createdById: user.id,
        }),
      );
    } catch (err) {
      // Course entre deux créations concurrentes : la contrainte unique
      // (ferme, code) tranche → 409 au lieu d'un 500.
      if (isUniqueViolation(err)) throw alreadyExists(code);
      throw err;
    }
  }

  async findAll(user: AuthUser, farmId: string): Promise<Promotion[]> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.promoRepo.find({
      where: { farmId },
      order: { createdAt: 'DESC' },
    });
  }

  async update(
    user: AuthUser,
    farmId: string,
    promotionId: string,
    dto: UpdatePromotionDto,
  ): Promise<Promotion> {
    await this.farmsService.assertAccessible(user, farmId);
    const promo = await this.promoRepo.findOne({
      where: { id: promotionId, farmId },
    });
    if (!promo) throw new NotFoundException('Promotion introuvable.');
    if (dto.code != null) {
      const code = dto.code.trim().toUpperCase();
      if (code !== promo.code) {
        const existing = await this.promoRepo.findOne({
          where: { farmId, code },
        });
        if (existing)
          throw new ConflictException(
            `Un code promo « ${code} » existe déjà dans cette ferme.`,
          );
      }
      promo.code = code;
    }
    if (dto.label != null) promo.label = dto.label.trim();
    if (dto.type != null) promo.type = dto.type;
    if (dto.value != null) promo.value = dto.value;
    if (promo.type === PromotionType.PCT && promo.value > 100) {
      throw new BadRequestException(
        'Un pourcentage de réduction ne peut pas dépasser 100%.',
      );
    }
    if (dto.active != null) promo.active = dto.active;
    if (dto.startDate != null) promo.startDate = dto.startDate;
    if (dto.endDate != null) promo.endDate = dto.endDate;
    if (dto.minSubtotalFcfa != null)
      promo.minSubtotalFcfa = dto.minSubtotalFcfa;
    if (dto.customerId !== undefined) {
      if (dto.customerId != null) {
        await this.assertCustomerInFarm(farmId, dto.customerId);
      }
      promo.customerId = dto.customerId;
    }
    try {
      return await this.promoRepo.save(promo);
    } catch (err) {
      if (isUniqueViolation(err)) throw alreadyExists(promo.code);
      throw err;
    }
  }

  async remove(
    user: AuthUser,
    farmId: string,
    promotionId: string,
  ): Promise<void> {
    await this.farmsService.assertAccessible(user, farmId);
    const promo = await this.promoRepo.findOne({
      where: { id: promotionId, farmId },
    });
    if (!promo) throw new NotFoundException('Promotion introuvable.');
    await this.promoRepo.remove(promo);
  }

  /** Application d'un code promo à une vente (résolu dans la transaction POS). */
  async applyCode(
    em: EntityManager,
    farmId: string,
    code: string,
    subtotalFcfa: number,
    customerId: string | null,
  ): Promise<{ promotion: Promotion; discountFcfa: number }> {
    const promo = await em.getRepository(Promotion).findOne({
      where: { farmId, code: code.trim().toUpperCase() },
    });
    if (!promo)
      throw new BadRequestException(`Code promo « ${code} » invalide.`);
    const today = todayStr();
    if (!promo.active) throw new BadRequestException('Code promo inactif.');
    if (promo.startDate && promo.startDate > today)
      throw new BadRequestException(
        `Ce code promo n'est pas encore actif (actif à partir du ${promo.startDate}).`,
      );
    if (promo.endDate && promo.endDate < today)
      throw new BadRequestException(
        `Ce code promo a expiré le ${promo.endDate}.`,
      );
    if (promo.minSubtotalFcfa != null && subtotalFcfa < promo.minSubtotalFcfa) {
      throw new BadRequestException(
        `Montant minimum de ${promo.minSubtotalFcfa} FCFA requis pour utiliser ce code.`,
      );
    }
    if (promo.customerId && customerId !== promo.customerId) {
      throw new BadRequestException(
        'Ce code promo est réservé à un client précis.',
      );
    }
    const discount =
      promo.type === PromotionType.PCT
        ? Math.min(
            Math.round((subtotalFcfa * Math.min(promo.value, 100)) / 100),
            subtotalFcfa,
          )
        : Math.min(promo.value, subtotalFcfa);
    return { promotion: promo, discountFcfa: discount };
  }

  private async assertCustomerInFarm(
    farmId: string,
    customerId: string,
  ): Promise<void> {
    const customer = await this.promoRepo.manager
      .getRepository(Customer)
      .findOne({
        where: { id: customerId, farmId },
      });
    if (!customer)
      throw new BadRequestException('Client introuvable dans cette ferme.');
  }
}
