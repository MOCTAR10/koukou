import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Farm } from '../../farms/entities/farm.entity.js';
import { bandeCode, bandeCounterScope } from '../../programme/codes.js';
import { IdCounterService } from '../../programme/id-counter.service.js';
import { ParametersService } from '../../programme/parameters.service.js';
import { TraceLotsService } from '../../trace/trace-lots.service.js';
import { ProductionBatch } from '../entities/production-batch.entity.js';
import { factInstant } from './bande-rules.js';
import { BandeStatsService } from './bande-stats.service.js';
// POUFA lot A2 sante: the vets' reference calendar is planned at opening (CDC n° 22).
import { applyReferenceCalendar } from '../../sanitary/reference-calendar.js';

export interface BandeOpeningInput {
  initialAgeDays?: number;
  initialAvgWeightG?: number;
}

/**
 * Opening of a POUFA band (every lot is one): band number from the farm
 * code and an IdCounter rank, age and weight at a mid-cycle opening (J+x),
 * reference duration copied from the parameter in force at the opening date,
 * the band's root traceability lot (`G1-0012-B07-L01`, same transaction) and
 * the vets' reference care calendar (steps already past are not planned).
 */
@Injectable()
export class BandeOpeningService {
  constructor(
    private readonly idCounter: IdCounterService,
    private readonly parameters: ParametersService,
    private readonly stats: BandeStatsService,
    private readonly trace: TraceLotsService,
  ) {}

  /** Saves `batch` in `em` as a new band of `farm`. */
  async open(
    em: EntityManager,
    farm: Farm,
    batch: ProductionBatch,
    input: BandeOpeningInput,
  ): Promise<ProductionBatch> {
    if (!farm.code) {
      throw new BadRequestException(
        "La ferme n'a pas encore de code du programme : impossible d'ouvrir une bande.",
      );
    }
    const resolver = await this.parameters.resolver(farm.programId, em);
    const rank = await this.idCounter.next(bandeCounterScope(farm.code), em);
    batch.code = bandeCode(farm.code, rank);
    batch.initialAgeDays = input.initialAgeDays ?? 0;
    batch.initialAvgWeightG = input.initialAvgWeightG ?? null;
    batch.referenceDurationDays = resolver.value<number>(
      'BANDE_DUREE_REFERENCE_J',
      factInstant(batch.integrationDate.slice(0, 10)),
    );
    const saved = await em.getRepository(ProductionBatch).save(batch);
    await this.trace.openRootLot(em, farm.programId, saved);
    // POUFA lot A2 sante: reference calendar in the same transaction.
    await applyReferenceCalendar(em, saved);
    await this.stats.refresh(em, saved.id);
    return saved;
  }
}
