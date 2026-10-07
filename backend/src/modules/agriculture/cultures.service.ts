import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CropCategory } from '../../common/enums/crop-category.enum.js';
import { Culture } from './entities/culture.entity.js';

@Injectable()
export class CulturesService {
  constructor(
    @InjectRepository(Culture)
    private readonly repo: Repository<Culture>,
  ) {}

  findAll(): Promise<Culture[]> {
    return this.repo.find({
      where: { active: true },
      order: { category: 'ASC', name: 'ASC' },
    });
  }

  findById(id: string): Promise<Culture | null> {
    return this.repo.findOne({ where: { id } });
  }

  async createCustom(
    name: string,
    category: CropCategory,
    defaultCycleDays?: number | null,
    waterNeedsLPlantDay?: number | null,
    notes?: string | null,
  ): Promise<Culture> {
    const existing = await this.repo.findOne({ where: { name } });
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
      isCustom: true,
    });
    return this.repo.save(culture);
  }
}