import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { PointOfSaleKind } from '../../common/enums/point-of-sale-kind.enum.js';
import { createOnce } from '../../common/utils/idempotency.js';
import { FarmsService } from '../farms/farms.service.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { PointOfSale } from './entities/point-of-sale.entity.js';
import { StockTransfer } from './entities/stock-transfer.entity.js';
import {
  CreatePointOfSaleDto,
  UpdatePointOfSaleDto,
} from './dto/point-of-sale.dto.js';

@Injectable()
export class PointsOfSaleService {
  constructor(
    @InjectRepository(PointOfSale)
    private readonly repo: Repository<PointOfSale>,
    @InjectRepository(Farm)
    private readonly farmRepo: Repository<Farm>,
    private readonly farmsService: FarmsService,
  ) {}

  /** Garantit qu’un point de vente « ferme » par défaut existe toujours. */
  async ensureDefault(farmId: string): Promise<PointOfSale> {
    const find = (repo: Repository<PointOfSale>) =>
      repo.findOne({
        where: { farmId, kind: PointOfSaleKind.FERME },
        order: { createdAt: 'ASC' },
      });
    const existing = await find(this.repo);
    if (existing) return existing;
    // No unique index on the default point: serialize the creation per farm
    // so two concurrent first reads don't each insert one.
    return this.repo.manager.transaction(async (em) => {
      await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `pos-default:${farmId}`,
      ]);
      const again = await find(em.getRepository(PointOfSale));
      if (again) return again;
      const farm = await em.getRepository(Farm).findOne({ where: { id: farmId } });
      return em.getRepository(PointOfSale).save(
        em.getRepository(PointOfSale).create({
          farmId,
          kind: PointOfSaleKind.FERME,
          name: farm?.name ?? 'Point de vente ferme',
          city: farm?.administrativeCity ?? null,
          isActive: true,
          isDefault: true,
        }),
      );
    });
  }

  /** Read-only variant: never creates the default point. */
  private async listReadOnly(farmId: string): Promise<PointOfSale[]> {
    return this.repo.find({
      where: { farmId },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
  }

  async list(user: AuthUser, farmId: string): Promise<PointOfSale[]> {
    await this.farmsService.assertAccessible(user, farmId);
    // A read-only institution consulting a farm must not create its default point.
    if (user.role === UserRole.INSTITUTION) return this.listReadOnly(farmId);
    await this.ensureDefault(farmId);
    return this.listReadOnly(farmId);
  }

  async getOne(
    user: AuthUser,
    farmId: string,
    pointOfSaleId: string,
  ): Promise<PointOfSale> {
    await this.farmsService.assertAccessible(user, farmId);
    const pos = await this.repo.findOne({
      where: { id: pointOfSaleId, farmId },
    });
    if (!pos)
      throw new NotFoundException(
        'Point de vente introuvable dans cette ferme.',
      );
    return pos;
  }

  /** Contexte (non bloquant) pour rattacher une vente à un point de vente. */
  async resolve(
    farmId: string,
    pointOfSaleId?: string,
  ): Promise<string | null> {
    if (!pointOfSaleId) return null;
    const pos = await this.repo.findOne({
      where: { id: pointOfSaleId, farmId },
    });
    if (!pos || pos.isActive === false) {
      throw new BadRequestException(
        'Point de vente introuvable ou inactif dans cette ferme.',
      );
    }
    return pos.id;
  }

  /** Retourne l'entité point de vente actif (ou null) pour comprendre son type. */
  async resolveEntity(
    farmId: string,
    pointOfSaleId: string,
  ): Promise<PointOfSale | null> {
    const pos = await this.repo.findOne({
      where: { id: pointOfSaleId, farmId },
    });
    if (!pos || pos.isActive === false) return null;
    return pos;
  }

  async create(
    user: AuthUser,
    farmId: string,
    dto: CreatePointOfSaleDto,
  ): Promise<PointOfSale> {
    await this.farmsService.assertAccessible(user, farmId);
    return createOnce(this.repo, farmId, dto.idempotencyKey, async () => {
      if (dto.kind === PointOfSaleKind.FERME) {
        const existing = await this.repo.findOne({
          where: { farmId, kind: PointOfSaleKind.FERME },
        });
        if (existing) {
          throw new BadRequestException(
            'Un point de vente ferme par défaut existe déjà pour cette ferme.',
          );
        }
      }
      return this.repo.save(
        this.repo.create({
          idempotencyKey: dto.idempotencyKey ?? null,
          farmId,
          kind: dto.kind,
          name: dto.name,
          address: dto.address ?? null,
          city: dto.city ?? null,
          province: dto.province ?? null,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          isActive: dto.isActive ?? true,
          isDefault: dto.kind === PointOfSaleKind.FERME,
          createdById: user.id,
        }),
      );
    });
  }

  async update(
    user: AuthUser,
    farmId: string,
    pointOfSaleId: string,
    dto: UpdatePointOfSaleDto,
  ): Promise<PointOfSale> {
    await this.farmsService.assertAccessible(user, farmId);
    const pos = await this.getOne(user, farmId, pointOfSaleId);
    if (dto.kind === PointOfSaleKind.BOUTIQUE && pos.isDefault) {
      throw new BadRequestException(
        'Le point de vente par défaut (ferme) ne peut pas être reclassé en boutique.',
      );
    }
    if (dto.kind === PointOfSaleKind.FERME && !pos.isDefault) {
      const existing = await this.repo.findOne({
        where: { farmId, kind: PointOfSaleKind.FERME },
      });
      if (existing) {
        throw new BadRequestException(
          'La ferme possède déjà son point de vente mère ; ce point de vente ne peut pas être reclassé en ferme.',
        );
      }
    }
    if (dto.kind !== undefined) pos.kind = dto.kind;
    if (dto.name !== undefined) pos.name = dto.name;
    if (dto.address !== undefined) pos.address = dto.address;
    if (dto.city !== undefined) pos.city = dto.city;
    if (dto.province !== undefined) pos.province = dto.province;
    if (dto.latitude !== undefined) pos.latitude = dto.latitude;
    if (dto.longitude !== undefined) pos.longitude = dto.longitude;
    if (dto.isActive !== undefined) {
      if (dto.isActive === false && pos.isDefault) {
        throw new BadRequestException(
          'Le point de vente ferme par défaut ne peut pas être désactivé.',
        );
      }
      pos.isActive = dto.isActive;
    }
    return this.repo.save(pos);
  }

  async remove(
    user: AuthUser,
    farmId: string,
    pointOfSaleId: string,
  ): Promise<{ deleted: boolean }> {
    await this.farmsService.assertAccessible(user, farmId);
    const pos = await this.getOne(user, farmId, pointOfSaleId);
    if (pos.isDefault) {
      throw new BadRequestException(
        'Le point de vente ferme par défaut ne peut pas être supprimé.',
      );
    }
    // Transfers reference the point of sale (RESTRICT; sales are only
    // unlinked): refuse with a readable message instead of a database error.
    const transfers = await this.repo.manager.count(StockTransfer, {
      where: { farmId, pointOfSaleId: pos.id },
    });
    if (transfers > 0) {
      throw new BadRequestException(
        'Ce point de vente a reçu des transferts de stock : il ne peut pas être supprimé. Désactivez-le plutôt.',
      );
    }
    await this.repo.remove(pos);
    return { deleted: true };
  }
}
