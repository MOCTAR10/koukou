import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, Not } from 'typeorm';
import type { ProtocolStepInput } from './dto/create-protocol.dto.js';
import type {
  CreateVaccinationCalendarDto,
  UpdateCalendarStepDto,
  UpdateVaccinationCalendarDto,
} from './dto/vaccination-calendar.dto.js';
import { ProtocolStep } from './entities/protocol-step.entity.js';
import { SanitaryProtocol } from './entities/sanitary-protocol.entity.js';
import { SanitaryService } from './sanitary.service.js';

type CalendarView = SanitaryProtocol & { steps: ProtocolStep[] };

/**
 * Reference vaccination calendars of the programme (POUFA plan §10): the
 * shared sanitary protocols (`farmId` null), maintained by the veterinary
 * services (domain SANITAIRE in their matrix). The reference one of a
 * species and type is the shared protocol marked `isDefault`: band calendars
 * are generated from it, and a care past its window is flagged late by the
 * existing prophylaxis rules. Steps are deactivated, never deleted (cares
 * already planned keep their step).
 */
@Injectable()
export class VaccinationCalendarsService {
  constructor(
    private readonly sanitary: SanitaryService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateVaccinationCalendarDto): Promise<CalendarView> {
    dto.steps.forEach((s) => this.checkWindow(s.dayFrom, s.dayTo));
    const created = await this.sanitary.createProtocol(null, dto);
    if (dto.reference) await this.makeReference(created.id);
    return this.sanitary.findProtocol(created.id, null);
  }

  async update(
    id: string,
    dto: UpdateVaccinationCalendarDto,
  ): Promise<CalendarView> {
    const protocol = await this.shared(id);
    if (dto.reference === false) {
      throw new BadRequestException(
        'Pour changer de calendrier de référence, désignez-en un autre (reference: true).',
      );
    }
    if (dto.name !== undefined) {
      await this.dataSource
        .getRepository(SanitaryProtocol)
        .update(protocol.id, { name: dto.name.trim() });
    }
    if (dto.reference) await this.makeReference(protocol.id);
    return this.sanitary.findProtocol(protocol.id, null);
  }

  async addStep(id: string, step: ProtocolStepInput): Promise<CalendarView> {
    const protocol = await this.shared(id);
    this.checkWindow(step.dayFrom, step.dayTo);
    const repo = this.dataSource.getRepository(ProtocolStep);
    await repo.save(
      repo.create({
        protocolId: protocol.id,
        stepOrder: step.stepOrder,
        dayFrom: step.dayFrom,
        dayTo: step.dayTo,
        careType: step.careType,
        name: step.name,
        dosage: step.dosage ?? null,
        route: step.route ?? null,
        withdrawalDays: step.withdrawalDays ?? 0,
        active: true,
      }),
    );
    return this.sanitary.findProtocol(protocol.id, null);
  }

  async updateStep(
    id: string,
    stepId: string,
    dto: UpdateCalendarStepDto,
  ): Promise<CalendarView> {
    const protocol = await this.shared(id);
    const repo = this.dataSource.getRepository(ProtocolStep);
    const step = await repo.findOne({
      where: { id: stepId, protocolId: protocol.id },
    });
    if (!step) throw new NotFoundException('Étape du calendrier introuvable.');
    if (dto.stepOrder !== undefined) step.stepOrder = dto.stepOrder;
    if (dto.dayFrom !== undefined) step.dayFrom = dto.dayFrom;
    if (dto.dayTo !== undefined) step.dayTo = dto.dayTo;
    if (dto.careType !== undefined) step.careType = dto.careType;
    if (dto.name !== undefined) step.name = dto.name;
    if (dto.dosage !== undefined) step.dosage = dto.dosage;
    if (dto.route !== undefined) step.route = dto.route;
    if (dto.withdrawalDays !== undefined) {
      step.withdrawalDays = dto.withdrawalDays;
    }
    if (dto.active !== undefined) step.active = dto.active;
    this.checkWindow(step.dayFrom, step.dayTo);
    await repo.save(step);
    return this.sanitary.findProtocol(protocol.id, null);
  }

  /** Only one reference calendar per species and type. */
  private async makeReference(id: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(SanitaryProtocol);
      const protocol = await repo.findOneByOrFail({ id });
      await repo.update(
        {
          farmId: IsNull(),
          species: protocol.species,
          type: protocol.type,
          id: Not(id),
          isDefault: true,
        },
        { isDefault: false },
      );
      await repo.update(id, { isDefault: true });
    });
  }

  private async shared(id: string): Promise<SanitaryProtocol> {
    const protocol = await this.dataSource
      .getRepository(SanitaryProtocol)
      .findOne({ where: { id, farmId: IsNull() } });
    if (!protocol) {
      throw new NotFoundException(
        'Calendrier de référence introuvable (les programmes d’une ferme se gèrent depuis la ferme).',
      );
    }
    return protocol;
  }

  private checkWindow(dayFrom: number, dayTo: number): void {
    if (dayTo < dayFrom) {
      throw new BadRequestException(
        'Le jour de fin d’une étape ne peut pas précéder son jour de début.',
      );
    }
  }
}
