import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BatchType } from '../../common/enums/batch-type.enum.js';
import { Species } from '../../common/enums/species.enum.js';
import {
  CreateItineraryStepDto,
  UpdateItineraryStepDto,
} from './dto/itinerary.dto.js';
import { TechnicalItineraryStep } from './entities/technical-itinerary-step.entity.js';

@Injectable()
export class ItineraryService {
  constructor(
    @InjectRepository(TechnicalItineraryStep)
    private readonly repo: Repository<TechnicalItineraryStep>,
  ) {}

  /** Steps ordered by start age then `sort`; deactivated ones only on request. */
  list(
    filter: { species?: Species; type?: BatchType },
    includeInactive: boolean,
  ): Promise<TechnicalItineraryStep[]> {
    return this.repo.find({
      where: {
        ...(filter.species ? { species: filter.species } : {}),
        ...(filter.type ? { productionType: filter.type } : {}),
        ...(includeInactive ? {} : { active: true }),
      },
      order: { dayFrom: 'ASC', sort: 'ASC', title: 'ASC' },
    });
  }

  async create(dto: CreateItineraryStepDto): Promise<TechnicalItineraryStep> {
    this.assertRange(dto.dayFrom, dto.dayTo ?? null);
    await this.assertLegalRef(dto.legalRef ?? null);
    return this.repo.save(
      this.repo.create({
        species: dto.species,
        productionType: dto.productionType,
        dayFrom: dto.dayFrom,
        dayTo: dto.dayTo ?? null,
        feedPhase: dto.feedPhase ?? null,
        title: dto.title.trim(),
        instructions: dto.instructions.trim(),
        category: dto.category,
        legalRef: dto.legalRef?.trim() || null,
        sort: dto.sort ?? 0,
        active: true,
      }),
    );
  }

  async update(
    id: string,
    dto: UpdateItineraryStepDto,
  ): Promise<TechnicalItineraryStep> {
    const step = await this.repo.findOne({ where: { id } });
    if (!step) throw new NotFoundException('Étape d’itinéraire introuvable.');
    const dayFrom = dto.dayFrom ?? step.dayFrom;
    const dayTo = dto.dayTo !== undefined ? dto.dayTo : step.dayTo;
    this.assertRange(dayFrom, dayTo);
    if (dto.legalRef !== undefined) {
      await this.assertLegalRef(dto.legalRef);
      step.legalRef = dto.legalRef?.trim() || null;
    }
    step.dayFrom = dayFrom;
    step.dayTo = dayTo;
    if (dto.feedPhase !== undefined) step.feedPhase = dto.feedPhase;
    if (dto.title !== undefined) step.title = dto.title.trim();
    if (dto.instructions !== undefined) step.instructions = dto.instructions.trim();
    if (dto.category !== undefined) step.category = dto.category;
    if (dto.sort !== undefined) step.sort = dto.sort;
    if (dto.active !== undefined) step.active = dto.active;
    return this.repo.save(step);
  }

  private assertRange(dayFrom: number, dayTo: number | null): void {
    if (dayTo != null && dayTo < dayFrom) {
      throw new BadRequestException(
        'L’âge de fin doit être supérieur ou égal à l’âge de début.',
      );
    }
  }

  /** `legalRef` must be the code of a TEXTE_REFERENCE list item. */
  private async assertLegalRef(code: string | null | undefined): Promise<void> {
    if (!code?.trim()) return;
    const rows: unknown[] = await this.repo.manager.query(
      `SELECT 1 FROM "ref_items" WHERE "list_type" = 'TEXTE_REFERENCE' AND "code" = $1 LIMIT 1`,
      [code.trim()],
    );
    if (rows.length === 0) {
      throw new BadRequestException(
        'Référence légale inconnue : choisissez un texte de la liste « Textes de référence ».',
      );
    }
  }
}
