import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BatchType } from '../../common/enums/batch-type.enum.js';
import { Species } from '../../common/enums/species.enum.js';
import { sharedOrFarm } from '../../common/utils/farm-scope.js';
import { Breed } from './entities/breed.entity.js';
import { BreedStandard } from './entities/breed-standard.entity.js';
import { deriveDailyFeedG } from './derive-daily-feed.js';

@Injectable()
export class BreedsService {
  constructor(
    @InjectRepository(Breed)
    private readonly repo: Repository<Breed>,
    @InjectRepository(BreedStandard)
    private readonly standardRepo: Repository<BreedStandard>,
  ) {}

  /** Shared breeds plus the farm's own (shared only without a farm). */
  findAll(farmId?: string | null): Promise<Breed[]> {
    return this.repo.find({
      where: sharedOrFarm<Breed>(farmId),
      order: { name: 'ASC' },
    });
  }

  /** A breed the farm may use: shared or its own. */
  findUsable(id: string, farmId: string): Promise<Breed | null> {
    return this.repo.findOne({ where: sharedOrFarm<Breed>(farmId, { id }) });
  }

  findById(id: string): Promise<Breed | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Référentiel zootechnique de la souche (poids/IC/ponte par semaine d'âge). */
  async getStandards(breedId: string, farmId: string | null) {
    // Shared breed, or the caller's own custom one (not another farm's).
    const breed = await this.repo.findOne({
      where: sharedOrFarm<Breed>(farmId, { id: breedId }),
    });
    if (!breed) throw new NotFoundException('Souche introuvable.');
    const standards = await this.standardRepo.find({
      where: { breedId },
      order: { week: 'ASC' },
    });
    return {
      breedId: breed.id,
      breedName: breed.name,
      type: breed.type,
      standards,
    };
  }

  /**
   * Replace the weekly standards of one shared breed (jury lot 1). A row
   * without `targetDailyFeedG` gets the value derived from its weight and
   * FCR targets. One transaction: either every row is replaced or none.
   */
  async replaceStandards(
    breedId: string,
    rows: Array<{
      week: number;
      targetAvgWeightKg?: number | null;
      targetFcr?: number | null;
      targetLayRatePercent?: number | null;
      targetDailyFeedG?: number | null;
    }>,
  ) {
    const breed = await this.repo.findOne({ where: { id: breedId } });
    if (!breed || breed.farmId) {
      throw new NotFoundException('Race du référentiel commun introuvable.');
    }
    const weeks = new Set<number>();
    for (const r of rows) {
      if (weeks.has(r.week)) {
        throw new BadRequestException(
          `La semaine ${r.week} apparaît plusieurs fois : une seule ligne par semaine.`,
        );
      }
      weeks.add(r.week);
    }
    const normalized = rows.map((r) => ({
      week: r.week,
      targetAvgWeightKg: r.targetAvgWeightKg ?? null,
      targetFcr: r.targetFcr ?? null,
      targetLayRatePercent: r.targetLayRatePercent ?? null,
      targetDailyFeedG: r.targetDailyFeedG ?? null,
    }));
    const derived = deriveDailyFeedG(normalized);
    normalized.forEach((r, i) => {
      if (rows[i].targetDailyFeedG == null) r.targetDailyFeedG = derived[i];
    });
    await this.standardRepo.manager.transaction(async (em) => {
      await em.delete(BreedStandard, { breedId });
      await em.save(
        BreedStandard,
        normalized.map((r) => em.create(BreedStandard, { ...r, breedId })),
      );
    });
    return this.getStandards(breedId, null);
  }

  async createCustom(
    farmId: string | null,
    name: string,
    type: BatchType,
    species: Species = Species.POULET,
    refCode?: string | null,
  ): Promise<Breed> {
    // `name` est en unique en base : on renvoie un 409 explicite au lieu
    // d'un 500 de violation de contrainte.
    const existing = await this.repo.findOne({
      where: sharedOrFarm<Breed>(farmId, { name }),
    });
    if (existing) {
      throw new ConflictException(
        `La souche « ${name} » existe déjà dans le référentiel.`,
      );
    }
    const breed = this.repo.create({
      name,
      type,
      species,
      refCode: refCode?.trim() ? refCode.trim() : null,
      isCustom: farmId !== null,
      farmId,
    });
    return this.repo.save(breed);
  }

  /** POUFA lot A2 divers (F8): edit a shared breed (farm breeds stay the farm's). */
  async updateShared(
    id: string,
    input: { name?: string; type?: BatchType; species?: Species; active?: boolean },
  ): Promise<Breed> {
    const breed = await this.repo.findOne({ where: { id } });
    if (!breed || breed.farmId) {
      throw new NotFoundException('Race du référentiel commun introuvable.');
    }
    if (input.name != null && input.name !== breed.name) {
      const clash = await this.repo.findOne({ where: sharedOrFarm<Breed>(null, { name: input.name }) });
      if (clash) throw new ConflictException('Une souche porte déjà ce nom. Choisissez un autre nom.');
      breed.name = input.name;
    }
    if (input.type) breed.type = input.type;
    if (input.species) breed.species = input.species;
    if (input.active != null) breed.active = input.active;
    return this.repo.save(breed);
  }
}
