import {
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
  async getStandards(breedId: string) {
    const breed = await this.findById(breedId);
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
}
