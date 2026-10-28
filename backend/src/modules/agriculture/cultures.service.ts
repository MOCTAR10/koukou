import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CropCategory } from '../../common/enums/crop-category.enum.js';
import { sharedOrFarm } from '../../common/utils/farm-scope.js';
import { Culture } from './entities/culture.entity.js';

@Injectable()
export class CulturesService {
  constructor(
    @InjectRepository(Culture)
    private readonly repo: Repository<Culture>,
  ) {}

  /** Shared cultures plus the farm's own (shared only without a farm). */
  findAll(farmId?: string | null): Promise<Culture[]> {
    return this.repo.find({
      where: sharedOrFarm<Culture>(farmId, { active: true }),
      order: { category: 'ASC', name: 'ASC' },
    });
  }

  /** A culture the farm may use: shared or its own. */
  findUsable(id: string, farmId: string): Promise<Culture | null> {
    return this.repo.findOne({ where: sharedOrFarm<Culture>(farmId, { id }) });
  }

  findById(id: string): Promise<Culture | null> {
    return this.repo.findOne({ where: { id } });
  }

  async createCustom(
    farmId: string | null,
    name: string,
    category: CropCategory,
    defaultCycleDays?: number | null,
    waterNeedsLPlantDay?: number | null,
    notes?: string | null,
  ): Promise<Culture> {
    const existing = await this.repo.findOne({
      where: sharedOrFarm<Culture>(farmId, { name }),
    });
    if (existing) {
      throw new ConflictException(
        `La culture « ${name} » existe déjà dans le référentiel.`,
      );
    }
    const culture = this.repo.create({
      name,
      category,
      defaultCycleDays: defaultCycleDays ?? null,
      waterNeedsLPlantDay: waterNeedsLPlantDay ?? null,
      notes: notes?.trim() ? notes.trim() : null,
      isCustom: farmId !== null,
      farmId,
    });
    return this.repo.save(culture);
  }
}