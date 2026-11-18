import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DEFAULT_ITINERARY } from './data/default-itinerary.js';
import { TechnicalItineraryStep } from './entities/technical-itinerary-step.entity.js';

/**
 * Seeds the default itinerary, per species and production type, only when
 * that pair has no step at all: never overwrites what the DGE changed or
 * deactivated.
 */
@Injectable()
export class ItinerarySeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ItinerarySeedService.name);

  constructor(
    @InjectRepository(TechnicalItineraryStep)
    private readonly repo: Repository<TechnicalItineraryStep>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const pairs = new Map<
      string,
      { species: TechnicalItineraryStep['species']; productionType: TechnicalItineraryStep['productionType'] }
    >();
    for (const s of DEFAULT_ITINERARY) {
      pairs.set(`${s.species}/${s.productionType}`, {
        species: s.species,
        productionType: s.productionType,
      });
    }
    for (const pair of pairs.values()) {
      if ((await this.repo.count({ where: pair })) > 0) continue;
      const steps = DEFAULT_ITINERARY.filter(
        (s) =>
          s.species === pair.species && s.productionType === pair.productionType,
      );
      await this.repo.save(steps.map((s) => this.repo.create({ ...s, active: true })));
      this.logger.log(
        `Itinéraire technique par défaut : ${pair.species} ${pair.productionType} (${steps.length} étapes).`,
      );
    }
  }
}
