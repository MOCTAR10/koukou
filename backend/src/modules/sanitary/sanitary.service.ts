import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AlertKind, AlertLevel } from '../../common/enums/alert-level.enum.js';
import { BatchType, BatchStatus } from '../../common/enums/batch-type.enum.js';
import { CareType } from '../../common/enums/care-type.enum.js';
import { FeedEntryType } from '../../common/enums/feed-entry-type.enum.js';
import { ProphylaxisStatus } from '../../common/enums/prophylaxis-status.enum.js';
import { ReferenceKey } from '../../common/enums/reference-key.enum.js';
import { ScheduleSource } from '../../common/enums/schedule-source.enum.js';
import { Species } from '../../common/enums/species.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { ReferenceConstantsService } from '../reference-constants/reference-constants.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { ageZeroDay } from '../batches/poufa/bande-rules.js';
import { InputLot } from '../inputs/entities/input-lot.entity.js';
import { SanitaryProtocol } from './entities/sanitary-protocol.entity.js';
import { ProtocolStep } from './entities/protocol-step.entity.js';
import { ProphylaxisEvent } from './entities/prophylaxis-event.entity.js';

/** Événement prophylaxie tel qu'exposé à l'API : protocole d'origine résolu. */
export type ProphylaxisEventWithProtocol = ProphylaxisEvent & {
  protocolId: string | null;
};
import {
  TreatmentRecord,
  computeWithdrawalEndDate,
} from './entities/treatment-record.entity.js';
import {
  CreateSanitaryProtocolDto,
  ProtocolStepInput,
} from './dto/create-protocol.dto.js';
import { CreateTreatmentDto } from './dto/create-treatment.dto.js';
import { GenerateProgramDto } from './dto/generate-program.dto.js';
import { sharedOrFarm } from '../../common/utils/farm-scope.js';
import { CreateManualScheduleDto } from './dto/create-manual-schedule.dto.js';
import { UpdateScheduleDto } from './dto/update-schedule.dto.js';
import { CompleteProphylaxisDto } from './dto/complete-prophylaxis.dto.js';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import { createOnce } from '../../common/utils/idempotency.js';
import { RefListsService } from '../programme/ref-lists.service.js';
import {
  animalCountError,
  resolveTreatmentProduct,
  treatmentPeriodError,
} from './treatment-rules.js';
// POUFA lot A2 sante: reference calendar, postponement and completion rules.
import {
  ANIMAL_COUNT_REQUIRED_MESSAGE,
  PROGRAMME_STEP_TREATMENT_REASON,
  TREATMENT_ANIMALS_REQUIRED_MESSAGE,
  TREATMENT_REASON_REQUIRED_MESSAGE,
  completionOpensTreatment,
  completionTreatmentError,
  lateFrom,
  originalDateAfterMove,
  referenceContentRefusal,
  referenceStepRemovalRefusal,
} from './care-reference-rules.js';
import { isReferenceProtocol } from './reference-calendar.js';
import { dateFr, todayLocal } from '../../common/utils/date.utils.js';
import { TaskSyncService } from '../tasks/task-sync.service.js';

function todayStr(): string {
  return todayLocal();
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const SPECIES_LABELS: Record<Species, string> = {
  POULET: 'Poulet',
  DINDE: 'Dinde',
  PINTADE: 'Pintade',
  CAILLE: 'Caille',
  CANARD: 'Canard',
  OIE: 'Oie',
  FAISAN: 'Faisan',
  AUTRE: 'Autre',
};

const BATCH_TYPE_LABELS: Record<BatchType, string> = {
  CHAIR: 'Chair',
  PONDEUSE: 'Pondeuse',
};

@Injectable()
export class SanitaryService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(SanitaryProtocol)
    private readonly protocolRepo: Repository<SanitaryProtocol>,
    @InjectRepository(ProtocolStep)
    private readonly stepRepo: Repository<ProtocolStep>,
    @InjectRepository(ProphylaxisEvent)
    private readonly eventRepo: Repository<ProphylaxisEvent>,
    @InjectRepository(TreatmentRecord)
    private readonly treatmentRepo: Repository<TreatmentRecord>,
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    @InjectRepository(InputLot)
    private readonly inputRepo: Repository<InputLot>,
    private readonly farmsService: FarmsService,
    private readonly alertsService: AlertsService,
    private readonly constants: ReferenceConstantsService,
    private readonly lists: RefListsService,
    private readonly taskSync: TaskSyncService,
  ) {}

  // ---------- Protocoles sanitaire (données de référence) ----------

  /** Shared programs plus the farm's own (shared only without a farm). */
  async listProtocols(
    farmId: string | null,
    species?: string,
    type?: string,
  ): Promise<SanitaryProtocol[]> {
    const where: Record<string, string> = {};
    if (species) where.species = species;
    if (type) where.type = type;
    return this.protocolRepo.find({
      where: sharedOrFarm<SanitaryProtocol>(farmId, where),
      order: { name: 'ASC' },
    });
  }

  /** A program the farm may use: shared or its own. */
  private findUsableProtocol(
    id: string,
    farmId: string,
  ): Promise<SanitaryProtocol | null> {
    return this.protocolRepo.findOne({
      where: sharedOrFarm<SanitaryProtocol>(farmId, { id }),
    });
  }

  async findProtocol(
    id: string,
    farmId: string | null,
  ): Promise<SanitaryProtocol & { steps: ProtocolStep[] }> {
    const protocol = await this.protocolRepo.findOne({
      where: sharedOrFarm<SanitaryProtocol>(farmId, { id }),
    });
    if (!protocol)
      throw new NotFoundException('Protocole sanitaire introuvable.');
    const steps = await this.stepRepo.find({
      where: { protocolId: id },
      order: { stepOrder: 'ASC' },
    });
    return { ...protocol, steps };
  }

  /**
   * Protocole par défaut pour une espèce/type donné. Pas de repli sur le
   * protocole POULET : un programme vaccinal est propre à l'espèce (règle
   * « jamais de programme POULET sur un lot non-POULET »).
   */
  private async resolveDefaultProtocol(
    species: Species,
    type: BatchType,
  ): Promise<SanitaryProtocol | null> {
    return this.protocolRepo.findOne({
      where: { species, type, isDefault: true, farmId: IsNull() },
      order: { createdAt: 'ASC' },
    });
  }

  async createProtocol(
    farmId: string | null,
    dto: CreateSanitaryProtocolDto,
  ): Promise<SanitaryProtocol & { steps: ProtocolStep[] }> {
    const code = dto.code ?? this.slugify(dto.name);
    const existing = await this.protocolRepo.findOne({
      where: sharedOrFarm<SanitaryProtocol>(farmId, { code }),
    });
    if (existing)
      throw new BadRequestException('Un protocole existe déjà avec ce code.');
    const protocol = await this.protocolRepo.save(
      this.protocolRepo.create({
        code,
        name: dto.name,
        species: dto.species ?? Species.POULET,
        type: dto.type,
        isDefault: false,
        isEditable: true,
        adminShared: farmId === null,
        farmId,
      }),
    );
    await this.saveSteps(protocol.id, dto.steps);
    return this.findProtocol(protocol.id, farmId);
  }

  // ---------- Calendrier prophylactique ----------

  async generateCalendar(
    user: AuthUser,
    farmId: string,
    batchId: string,
    protocolId?: string,
  ): Promise<ProphylaxisEvent[]> {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.batchRepo.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch)
      throw new NotFoundException('Lot introuvable dans cette ferme.');
    if (batch.status === BatchStatus.CLOTURE) {
      throw new BadRequestException(
        'Lot clôturé : impossible de générer un calendrier sanitaire.',
      );
    }

    const protocol = protocolId
      ? await this.findUsableProtocol(protocolId, farmId)
      : await this.resolveDefaultProtocol(batch.species, batch.type);
    if (protocolId && !protocol) {
      throw new NotFoundException(
        'Programme sanitaire introuvable pour cette ferme.',
      );
    }
    if (!protocol) {
      throw new BadRequestException(
        `Aucun protocole sanitaire par défaut pour les ${SPECIES_LABELS[batch.species]} ${BATCH_TYPE_LABELS[batch.type]}. Choisissez ou créez un programme adapté à cette espèce.`,
      );
    }
    if (protocol.species !== batch.species || protocol.type !== batch.type) {
      throw new BadRequestException(
        `Le programme « ${protocol.name} » est destiné aux ${SPECIES_LABELS[protocol.species]} ${BATCH_TYPE_LABELS[protocol.type]} : il ne peut pas s'appliquer à un lot ${SPECIES_LABELS[batch.species]} ${BATCH_TYPE_LABELS[batch.type]}.`,
      );
    }
    const steps = await this.stepRepo.find({
      where: { protocolId: protocol.id, active: true },
      order: { stepOrder: 'ASC' },
    });
    if (steps.length === 0) {
      throw new BadRequestException(
        'Le protocole sélectionné ne contient aucune étape active.',
      );
    }

    const existing = await this.eventRepo.find({
      where: { batchId },
    });
    const existingStepIds = new Set(
      existing.filter((e) => e.protocolStepId).map((e) => e.protocolStepId),
    );

    const calendar: ProphylaxisEvent[] = [];
    const today = todayStr();
    for (const step of steps) {
      if (existingStepIds.has(step.id)) continue;
      // Like generateVaccineProgram: a step already past is skipped (it would
      // turn overdue at once and block slaughter and readiness).
      const scheduledDate = addDays(
        ageZeroDay(batch.integrationDate, batch.initialAgeDays),
        step.dayFrom,
      );
      if (scheduledDate < today) continue;
      const event = await this.eventRepo.save(
        this.eventRepo.create({
          farmId,
          batchId,
          buildingId: batch.buildingId,
          protocolStepId: step.id,
          careType: step.careType,
          name: step.name,
          dosage: step.dosage,
          route: step.route,
          withdrawalDays: step.withdrawalDays,
          scheduledDate,
          status: ProphylaxisStatus.PLANIFIE,
          isReference: isReferenceProtocol(protocol),
        }),
      );
      calendar.push(event);
    }

    await this.refreshProphylaxis(batchId);
    return this.listProphylaxis(user, farmId, batchId);
  }

  async listProphylaxis(
    user: AuthUser,
    farmId: string,
    batchId: string,
  ): Promise<ProphylaxisEventWithProtocol[]> {
    await this.farmsService.assertAccessible(user, farmId);
    await this.assertBatchInFarm(farmId, batchId);
    // La lecture réconcilie statuts (EN_RETARD) ET alertes PROPHYLAXIE /
    // DELAI_ATTENTE : un soin échu par simple passage du temps déclenche la
    // bascule d'état et l'alerte associée (« badge » cohérent côté mobile).
    // A read-only institution consulting the calendar must not write.
    if (user.role !== UserRole.INSTITUTION) {
      await this.refreshProphylaxis(batchId);
    }
    const events = await this.eventRepo.find({
      where: { batchId },
      order: { scheduledDate: 'ASC' },
    });
    return this.decorateProtocolId(events);
  }

  /**
   * Renseigne le protocole (programme) d'origine de chaque événement, via
   * l'étape qu'il référence (`protocol_step_id` → `protocol_steps.protocol_id`).
   * Permet au mobile d'afficher les « à réaliser » du bon programme (celui qui
   * a réellement été planifié), pas d'un programme par défaut différent.
   */
  private async decorateProtocolId(
    events: ProphylaxisEvent[],
  ): Promise<ProphylaxisEventWithProtocol[]> {
    const stepIds = [
      ...new Set(
        events.map((e) => e.protocolStepId).filter((s): s is string => Boolean(s)),
      ),
    ];
    if (stepIds.length === 0) {
      return events.map((e) => ({ ...e, protocolId: null }));
    }
    const steps = await this.stepRepo.find({
      where: { id: In(stepIds) },
      select: { id: true, protocolId: true },
    });
    const protocolByStep = new Map(
      steps.map((s) => [s.id, s.protocolId] as const),
    );
    return events.map((e) => ({
      ...e,
      protocolId: e.protocolStepId
        ? protocolByStep.get(e.protocolStepId) ?? null
        : null,
    }));
  }

  /**
   * Marks a care done (CDC n° 22: date, vaccine, route, number of animals).
   * One transaction with the care row locked: a care is completed once, and a
   * replay of the same completion (same `idempotencyKey`, offline queue)
   * returns it instead of « déjà réalisé ». POUFA lot A2 sante: the number of
   * animals is required for a new completion (the replay of one already
   * stored passes, whatever it carried), and a care with a withdrawal period
   * opens a treatment like the register: a manual care takes its product from
   * PRODUIT_TRAITEMENT, its real reason and end day (no fixed reason).
   */
  async completeEvent(
    user: AuthUser,
    farmId: string,
    batchId: string,
    eventId: string,
    dto: CompleteProphylaxisDto,
  ): Promise<ProphylaxisEvent> {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.assertBatchInFarm(farmId, batchId);
    const current = await this.assertEvent(farmId, batchId, eventId);
    const key = dto.idempotencyKey?.trim() || null;
    if (
      current.status === ProphylaxisStatus.FAIT &&
      key &&
      current.idempotencyKey === key
    ) {
      return current;
    }
    // Same refusals as under the lock below, before asking for missing fields.
    if (current.status === ProphylaxisStatus.FAIT) {
      throw new BadRequestException('Ce soin a déjà été réalisé.');
    }
    if (current.status === ProphylaxisStatus.ANNULE) {
      throw new BadRequestException(
        'Ce soin a été annulé : planifiez un nouveau soin plutôt que de le compléter.',
      );
    }
    if (dto.medicationLotId) {
      await this.assertMedicationLot(farmId, dto.medicationLotId);
    }
    if (dto.animalCount == null) {
      throw new BadRequestException(ANIMAL_COUNT_REQUIRED_MESSAGE);
    }
    const countError = animalCountError(dto.animalCount, batch.quantityAtStart);
    if (countError) throw new BadRequestException(countError);
    const completedAt = dto.completedAt ? new Date(dto.completedAt) : new Date();
    const treatment = completionOpensTreatment(current)
      ? await this.completionTreatment(current, dto, completedAt)
      : null;

    const { event, replay } = await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(ProphylaxisEvent);
      const locked = await repo
        .createQueryBuilder('e')
        .setLock('pessimistic_write')
        .where(
          'e.id = :eventId AND e.farm_id = :farmId AND e.batch_id = :batchId',
          { eventId, farmId, batchId },
        )
        .getOneOrFail();
      if (locked.status === ProphylaxisStatus.FAIT) {
        if (key && locked.idempotencyKey === key) {
          return { event: locked, replay: true };
        }
        throw new BadRequestException('Ce soin a déjà été réalisé.');
      }
      // Cancelling gave its medication back to stock: completing it now would
      // record a treatment that took nothing out.
      if (locked.status === ProphylaxisStatus.ANNULE) {
        throw new BadRequestException(
          'Ce soin a été annulé : planifiez un nouveau soin plutôt que de le compléter.',
        );
      }

      locked.status = ProphylaxisStatus.FAIT;
      locked.completedAt = completedAt;
      locked.performedById = user.id;
      locked.performedNotes = dto.notes ?? null;
      locked.animalCount = dto.animalCount ?? null;
      if (dto.route?.trim()) locked.route = dto.route.trim();
      if (dto.medicationLotId) locked.medicationLotId = dto.medicationLotId;
      if (treatment?.productCode) locked.productCode = treatment.productCode;
      locked.idempotencyKey = key;
      await repo.save(locked);

      // Tout soin avec délai d'attente (antibiotique, médicament…) ouvre un
      // suivi HACCP : c'est le délai qui protège le consommateur, pas le type.
      if (treatment) {
        const treatments = em.getRepository(TreatmentRecord);
        await treatments.save(
          treatments.create({
            farmId,
            batchId,
            careType: locked.careType,
            productCode: treatment.productCode,
            productName: treatment.productName,
            dosage: locked.dosage,
            route: locked.route,
            administeredAt: completedAt,
            endDate: treatment.endDate,
            withdrawalDays: locked.withdrawalDays,
            withdrawalEndDate: computeWithdrawalEndDate(
              completedAt,
              locked.withdrawalDays,
              treatment.endDate,
            ),
            reason: treatment.reason,
            animalCount: locked.animalCount,
            performedById: user.id,
            medicationLotId: locked.medicationLotId,
            notes: locked.performedNotes,
          }),
        );
      }
      return { event: locked, replay: false };
    });

    if (!replay) await this.refreshProphylaxis(batchId);
    return event;
  }

  /**
   * Treatment a completion opens (CDC n° 23). A step of a vets' programme
   * keeps its own name and defaults its reason to the calendar; a manual care
   * resolves its product in PRODUIT_TRAITEMENT (the code picked at planning or
   * now; free text only while the list is empty, as in the register) and
   * needs its real reason and end day.
   */
  private async completionTreatment(
    care: ProphylaxisEvent,
    dto: CompleteProphylaxisDto,
    completedAt: Date,
  ): Promise<{
    productCode: string | null;
    productName: string;
    reason: string;
    endDate: string | null;
  }> {
    const missing = completionTreatmentError(care, dto);
    if (missing) throw new BadRequestException(missing);
    const endDate = dto.endDate ? dto.endDate.slice(0, 10) : null;
    const periodError = treatmentPeriodError(
      completedAt.toISOString().slice(0, 10),
      endDate,
    );
    if (periodError) throw new BadRequestException(periodError);
    const reason = dto.reason?.trim() || null;
    if (care.protocolStepId) {
      return {
        productCode: null,
        productName: care.name,
        reason: reason ?? PROGRAMME_STEP_TREATMENT_REASON,
        endDate,
      };
    }
    const product = resolveTreatmentProduct(
      {
        productCode: dto.productCode?.trim() || care.productCode,
        productName: care.name,
      },
      await this.lists.list(ProgramListType.PRODUIT_TRAITEMENT),
    );
    if (!product.ok) throw new BadRequestException(product.error);
    return {
      productCode: product.productCode,
      productName: product.productName,
      reason: reason ?? '',
      endDate,
    };
  }

  async cancelEvent(
    user: AuthUser,
    farmId: string,
    batchId: string,
    eventId: string,
    reason?: string,
  ): Promise<ProphylaxisEvent> {
    await this.farmsService.assertAccessible(user, farmId);
    const event = await this.assertEvent(farmId, batchId, eventId);
    if (event.status === ProphylaxisStatus.FAIT) {
      throw new BadRequestException(
        'Impossible d’annuler un soin déjà réalisé.',
      );
    }
    const locked = referenceStepRemovalRefusal(event, user.role);
    if (locked) throw new BadRequestException(locked);
    // A cancelled care gives its medication back (once: stockConsumedAt is
    // cleared, so a later delete does not restore it again).
    if (
      event.decrementStock &&
      event.stockConsumedAt &&
      event.medicationLotId &&
      event.medicationQty
    ) {
      await this.restoreMedicationStock(
        farmId,
        event.medicationLotId,
        event.medicationQty,
      );
      event.stockConsumedAt = null;
    }
    event.status = ProphylaxisStatus.ANNULE;
    event.cancelledReason = reason ?? 'Non précisé';
    event.performedById = user.id;
    await this.eventRepo.save(event);
    await this.refreshProphylaxis(batchId);
    return event;
  }

  async rescheduleEvent(
    user: AuthUser,
    farmId: string,
    batchId: string,
    eventId: string,
    scheduledDate: string,
  ): Promise<ProphylaxisEvent> {
    await this.farmsService.assertAccessible(user, farmId);
    const event = await this.assertEvent(farmId, batchId, eventId);
    if (event.status === ProphylaxisStatus.FAIT) {
      throw new BadRequestException(
        'Impossible de reporter un soin déjà réalisé.',
      );
    }
    if (event.status === ProphylaxisStatus.ANNULE) {
      throw new BadRequestException(
        'Impossible de reporter un soin annulé : planifiez un nouveau soin.',
      );
    }
    // A postponement keeps the first planned date: a reference step stays late from it.
    event.originalDate = originalDateAfterMove(event, scheduledDate);
    event.scheduledDate = scheduledDate;
    event.status = ProphylaxisStatus.PLANIFIE;
    await this.eventRepo.save(event);
    await this.refreshProphylaxis(batchId);
    return event;
  }

  // ---------- Traitements (registre HACCP) ----------

  /**
   * Treatment register (CDC n° 23): start and end days, product from the
   * PRODUIT_TRAITEMENT list (free text only while it is empty), reason and
   * animals. Idempotent on `idempotencyKey` (offline queue): a replay returns
   * the record already stored, whatever the list says by then.
   */
  async createTreatment(
    user: AuthUser,
    farmId: string,
    batchId: string,
    dto: CreateTreatmentDto,
  ): Promise<TreatmentRecord> {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.assertBatchInFarm(farmId, batchId);
    const key = dto.idempotencyKey?.trim() || null;
    if (key) {
      const replay = await this.treatmentRepo.findOne({
        where: { farmId, idempotencyKey: key },
      });
      if (replay) return replay;
    }
    if (dto.medicationLotId) {
      await this.assertMedicationLot(farmId, dto.medicationLotId);
    }
    // A care of a usable programme (the vets' calendar, or a farm programme
    // they set) recorded after the fact carries the step's own name.
    const product = dto.protocolStepId
      ? await this.stepProduct(farmId, dto.protocolStepId)
      : resolveTreatmentProduct(
          dto,
          await this.lists.list(ProgramListType.PRODUIT_TRAITEMENT),
        );
    if (!product.ok) throw new BadRequestException(product.error);
    const administeredAt = dto.administeredAt
      ? new Date(dto.administeredAt)
      : new Date();
    const endDate = dto.endDate ? dto.endDate.slice(0, 10) : null;
    const periodError = treatmentPeriodError(
      administeredAt.toISOString().slice(0, 10),
      endDate,
    );
    if (periodError) throw new BadRequestException(periodError);
    const countError = animalCountError(dto.animalCount, batch.quantityAtStart);
    if (countError) throw new BadRequestException(countError);
    // POUFA lot A2 sante: reason and animals required for a new record (the
    // replay of one already stored was returned above).
    if (!dto.reason?.trim()) {
      throw new BadRequestException(TREATMENT_REASON_REQUIRED_MESSAGE);
    }
    if (dto.animalCount == null) {
      throw new BadRequestException(TREATMENT_ANIMALS_REQUIRED_MESSAGE);
    }
    const withdrawalDays = dto.withdrawalDays ?? 0;

    const treatment = await createOnce(this.treatmentRepo, farmId, key, () =>
      this.treatmentRepo.save(
        this.treatmentRepo.create({
          farmId,
          batchId,
          careType: dto.careType,
          productCode: product.productCode,
          productName: product.productName,
          dosage: dto.dosage ?? null,
          route: dto.route ?? null,
          administeredAt,
          endDate,
          reason: dto.reason?.trim() || null,
          animalCount: dto.animalCount ?? null,
          withdrawalDays,
          withdrawalEndDate: computeWithdrawalEndDate(
            administeredAt,
            withdrawalDays,
            endDate,
          ),
          performedById: user.id,
          medicationLotId: dto.medicationLotId ?? null,
          notes: dto.notes ?? null,
          idempotencyKey: key,
        }),
      ),
    );
    await this.refreshProphylaxis(batchId);
    return treatment;
  }

  async listTreatments(
    user: AuthUser,
    farmId: string,
    batchId: string,
  ): Promise<TreatmentRecord[]> {
    await this.farmsService.assertAccessible(user, farmId);
    await this.assertBatchInFarm(farmId, batchId);
    return this.treatmentRepo.find({
      where: { batchId },
      order: { administeredAt: 'DESC' },
    });
  }

  // ---------- Programmes & échéances (Traitements) ----------

  /**
   * Applique un programme pré-chargé (calendrier vaccinal Gabon) à un ou
   * plusieurs lots. Non bloquant : les étapes dont la date d'application est
   * déjà passée, ou déjà planifiées/réalisées, sont **sautées** avec une
   * raison (remontée en `skippedSteps`), jamais bloquantes.
   */
  async generateVaccineProgram(
    user: AuthUser,
    farmId: string,
    dto: GenerateProgramDto,
  ): Promise<{
    protocolId: string;
    programName: string;
    planned: number;
    skipped: number;
    perLot: {
      batchId: string;
      batchName: string;
      planned: number;
      skipped: number;
      skippedSteps: { step: string; date: string | null; reason: string }[];
    }[];
    events: ProphylaxisEvent[];
  }> {
    await this.farmsService.assertAccessible(user, farmId);
    const protocol = await this.findUsableProtocol(dto.protocolId, farmId);
    if (!protocol)
      throw new NotFoundException('Programme de vaccination introuvable.');
    const steps = await this.stepRepo.find({
      where: { protocolId: protocol.id, active: true },
      order: { stepOrder: 'ASC' },
    });
    if (steps.length === 0) {
      throw new BadRequestException(
        'Ce programme ne contient aucune étape active.',
      );
    }

    const lots = await Promise.all(
      dto.lotIds.map((lotId) => this.assertBatchInFarm(farmId, lotId)),
    );
    const mismatched = lots.filter(
      (lot) =>
        lot.species !== protocol.species || lot.type !== protocol.type,
    );
    if (mismatched.length > 0) {
      const names = mismatched
        .map(
          (l) =>
            `${l.batchName ?? l.id} (${SPECIES_LABELS[l.species]} ${BATCH_TYPE_LABELS[l.type]})`,
        )
        .join(', ');
      throw new BadRequestException(
        `Le programme « ${protocol.name} » est destiné aux ${SPECIES_LABELS[protocol.species]} ${BATCH_TYPE_LABELS[protocol.type]}. Il ne peut pas s'appliquer au lot « ${names} » — sélectionnez un lot ${SPECIES_LABELS[protocol.species]} ${BATCH_TYPE_LABELS[protocol.type]} ou le programme adapté à son espèce.`,
      );
    }

    const today = todayStr();
    const events: ProphylaxisEvent[] = [];
    const perLot: {
      batchId: string;
      batchName: string;
      planned: number;
      skipped: number;
      skippedSteps: { step: string; date: string | null; reason: string }[];
    }[] = [];
    let planned = 0;
    let skipped = 0;

    for (const lot of lots) {
      const lotId = lot.id;
      const existing = await this.eventRepo.find({ where: { batchId: lotId } });
      const existingByStep = new Map(
        existing
          .filter((e) => e.protocolStepId)
          .map((e) => [e.protocolStepId as string, e]),
      );

      let lotPlanned = 0;
      let lotSkipped = 0;
      const skippedSteps: {
        step: string;
        date: string | null;
        reason: string;
      }[] = [];

      for (const step of steps) {
        const scheduledDate = addDays(
          ageZeroDay(lot.integrationDate, lot.initialAgeDays),
          step.dayFrom,
        );
        const already = existingByStep.get(step.id);
        if (already) {
          const reason =
            already.status === ProphylaxisStatus.FAIT
              ? 'Étape déjà réalisée'
              : 'Étape déjà planifiée';
          skippedSteps.push({ step: step.name, date: scheduledDate, reason });
          skipped += 1;
          lotSkipped += 1;
          continue;
        }
        if (scheduledDate < today) {
          skippedSteps.push({
            step: step.name,
            date: scheduledDate,
            reason:
              'Date d’application déjà passée — étape sautée, non bloquante',
          });
          skipped += 1;
          lotSkipped += 1;
          continue;
        }
        const event = await this.eventRepo.save(
          this.eventRepo.create({
            farmId,
            batchId: lotId,
            buildingId: lot.buildingId,
            protocolStepId: step.id,
            source: ScheduleSource.PROGRAM,
            careType: step.careType,
            name: step.name,
            dosage: step.dosage,
            route: step.route,
            withdrawalDays: step.withdrawalDays,
            scheduledDate,
            status: ProphylaxisStatus.PLANIFIE,
            isReference: isReferenceProtocol(protocol),
          }),
        );
        events.push(event);
        planned += 1;
        lotPlanned += 1;
      }

      await this.refreshProphylaxis(lotId);
      perLot.push({
        batchId: lotId,
        batchName: lot.batchName ?? lotId,
        planned: lotPlanned,
        skipped: lotSkipped,
        skippedSteps,
      });
    }

    return {
      protocolId: protocol.id,
      programName: protocol.name,
      planned,
      skipped,
      perLot,
      events,
    };
  }

  /**
   * Planifie un soin unique (vaccin ou médicament) sur un ou plusieurs lots.
   * Pour un médicament choisi « Sortir du stock » : la quantité (dose) est
   * déduite une seule fois au niveau de la ferme (verrou pessimiste, jamais
   * de stock négatif) et le soin « porteur » la restitue s'il est annulé.
   */
  async createManualSchedule(
    user: AuthUser,
    farmId: string,
    dto: CreateManualScheduleDto,
  ): Promise<ProphylaxisEvent[]> {
    await this.farmsService.assertAccessible(user, farmId);
    if (
      dto.careType !== CareType.VACCIN &&
      dto.careType !== CareType.MEDICAMENT
    ) {
      throw new BadRequestException(
        'Type de soin invalide : choisissez Vaccin ou Médicament.',
      );
    }

    const decrementStock = dto.decrementStock === true;
    if (decrementStock) {
      if (dto.careType !== CareType.MEDICAMENT) {
        throw new BadRequestException(
          'Seul un médicament peut être sorti du stock.',
        );
      }
      if (!dto.medicationLotId || (dto.medicationQty ?? 0) <= 0) {
        throw new BadRequestException(
          'Sélectionnez le lot de médicament et indiquez la quantité à sortir du stock.',
        );
      }
    }

    // POUFA lot A2 sante (CDC n° 23): a medication comes from the vets'
    // PRODUIT_TRAITEMENT list (free text only while it is empty, as in the
    // treatment register); a vaccine keeps its free name.
    let productCode: string | null = null;
    let name = dto.name;
    if (dto.careType === CareType.MEDICAMENT) {
      const product = resolveTreatmentProduct(
        { productCode: dto.productCode, productName: dto.name },
        await this.lists.list(ProgramListType.PRODUIT_TRAITEMENT),
      );
      if (!product.ok) throw new BadRequestException(product.error);
      productCode = product.productCode;
      name = product.productName;
    }

    // Validate every lot before taking anything out of stock: a 404 on the
    // second lot must not leave doses consumed with no care to give them back.
    const lots = [];
    for (const lotId of dto.lotIds) {
      lots.push(await this.assertBatchInFarm(farmId, lotId));
    }
    if (decrementStock) {
      await this.consumeMedicationStock(
        farmId,
        dto.medicationLotId!,
        dto.medicationQty ?? 0,
      );
    }

    const created: ProphylaxisEvent[] = [];
    for (const lot of lots) {
      const lotId = lot.id;
      const event = await this.eventRepo.save(
        this.eventRepo.create({
          farmId,
          batchId: lotId,
          buildingId: lot.buildingId,
          protocolStepId: null,
          source: ScheduleSource.MANUEL,
          careType: dto.careType,
          name,
          productCode,
          dosage: dto.dosage ?? null,
          route: dto.route ?? null,
          withdrawalDays: dto.withdrawalDays ?? 0,
          scheduledDate: dto.scheduledDate,
          status: ProphylaxisStatus.PLANIFIE,
          notes: dto.notes ?? null,
          decrementStock,
          medicationLotId: dto.medicationLotId ?? null,
          medicationQty: decrementStock ? (dto.medicationQty ?? null) : null,
          medicationUnit: dto.medicationUnit ?? null,
          stockConsumedAt:
            decrementStock && created.length === 0 ? new Date() : null,
        }),
      );
      created.push(event);
      await this.refreshProphylaxis(lotId);
    }
    return created;
  }

  /**
   * Édite un soin planifié (vaccin ↔ médicament, intitulé, voie, dosage,
   * délai d'attente, notes, date). Un soin déjà réalisé reste immuable
   * (historique HACCP). Une nouvelle date replace le soin en PLANIFIE.
   */
  async updateSchedule(
    user: AuthUser,
    farmId: string,
    batchId: string,
    eventId: string,
    dto: UpdateScheduleDto,
  ): Promise<ProphylaxisEvent> {
    await this.farmsService.assertAccessible(user, farmId);
    const event = await this.assertEvent(farmId, batchId, eventId);
    if (event.status === ProphylaxisStatus.FAIT) {
      throw new BadRequestException(
        'Un soin déjà réalisé est immuable (histoire HACCP).',
      );
    }
    const locked = referenceContentRefusal(event, dto, user.role);
    if (locked) throw new BadRequestException(locked);
    if (dto.careType) {
      if (
        dto.careType !== CareType.VACCIN &&
        dto.careType !== CareType.MEDICAMENT
      ) {
        throw new BadRequestException(
          'Type de soin invalide : choisissez Vaccin ou Médicament.',
        );
      }
      event.careType = dto.careType;
    }
    if (dto.name != null && dto.name.trim().length > 0) {
      event.name = dto.name.trim();
    }
    if ('route' in dto) event.route = dto.route ?? null;
    if ('dosage' in dto) event.dosage = dto.dosage ?? null;
    if ('notes' in dto) event.notes = dto.notes ?? null;
    if (dto.withdrawalDays != null) event.withdrawalDays = dto.withdrawalDays;
    if (dto.scheduledDate) {
      // A cancelled care gave its medication back: it can't be revived here.
      if (event.status === ProphylaxisStatus.ANNULE) {
        throw new BadRequestException(
          'Impossible de replanifier un soin annulé : planifiez un nouveau soin.',
        );
      }
      event.originalDate = originalDateAfterMove(event, dto.scheduledDate);
      event.scheduledDate = dto.scheduledDate;
      event.status = ProphylaxisStatus.PLANIFIE;
    }
    await this.eventRepo.save(event);
    await this.refreshProphylaxis(batchId);
    return event;
  }

  /**
   * Supprime définitivement un soin planifié (Propriétaire). Restaure le
   * stock si ce soin portait la sortie de stock d'un médicament. Les soins
   * déjà réalisés ne sont jamais supprimés (historique HACCP).
   */
  async deleteSchedule(
    user: AuthUser,
    farmId: string,
    batchId: string,
    eventId: string,
  ): Promise<{ deleted: boolean }> {
    await this.farmsService.assertAccessible(user, farmId);
    const event = await this.assertEvent(farmId, batchId, eventId);
    if (event.status === ProphylaxisStatus.FAIT) {
      throw new BadRequestException(
        'Impossible de supprimer un soin déjà réalisé (historique HACCP) : annulez-le plutôt.',
      );
    }
    const locked = referenceStepRemovalRefusal(event, user.role);
    if (locked) throw new BadRequestException(locked);
    if (
      event.decrementStock &&
      event.stockConsumedAt &&
      event.medicationLotId &&
      event.medicationQty
    ) {
      await this.restoreMedicationStock(
        farmId,
        event.medicationLotId,
        event.medicationQty,
      );
    }
    await this.eventRepo.delete({ id: eventId });
    await this.refreshProphylaxis(batchId);
    return { deleted: true };
  }

  // ---------- Évaluation des alertes (advisory) ----------

  /**
   * Reçoit la lotion des alertes PROPHYLAXIE et DELAI_ATTENTE après chaque
   * mutation sanitaire : soins en retard (ROUGE) / à venir bientôt (JAUNE),
   * et délais d'attente en cours (ROUGE, sécurité alimentaire).
   */
  async refreshProphylaxis(batchId: string): Promise<void> {
    const batch = await this.batchRepo.findOne({ where: { id: batchId } });
    if (!batch) return;
    // The care calendar is the source of truth of the vaccination tasks (and
    // of the PROPHYLAXIE alerts below): every change of it passes here.
    await this.taskSync.syncBatch(batchId);
    // A closed lot's alerts were resolved at closing: reading its calendar
    // must not raise them again.
    if (batch.status === BatchStatus.CLOTURE) return;
    const farmId = batch.farmId;

    await this.refreshProphylaxisStatuses(batchId);

    const [events, treatments] = await Promise.all([
      this.eventRepo.find({ where: { batchId } }),
      this.treatmentRepo.find({ where: { batchId } }),
    ]);

    // --- PROPHYLAXIE : soins en retard ou imminents ---
    const leadDays = await this.constants.get(
      ReferenceKey.CALENDAR_LEAD_DAYS,
      1,
    );
    const today = todayStr();

    const overdue = events.filter(
      (e) => e.status === ProphylaxisStatus.EN_RETARD,
    );
    const upcoming = events
      .filter((e) => e.status === ProphylaxisStatus.PLANIFIE)
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

    if (overdue.length > 0) {
      const names = overdue
        .slice(0, 3)
        .map((e) => e.name)
        .join(', ');
      await this.alertsService.raise(
        {
          kind: AlertKind.PROPHYLAXIE,
          level: AlertLevel.ROUGE,
          message: `Soin(s) prophylactique(s) en retard sur le lot : ${names}. Un retard de vaccination expose le lot aux maladies.`,
          recommendation:
            'Réaliser le soin dès que possible ou reporter explicitement la date. En cas de doute, contacter le vétérinaire.',
          context: { overdueCount: overdue.length },
        },
        { farmId, batchId },
        // Re-evaluated on every calendar read: keep the farmer's ack.
        { keepAcknowledgedIfUnchanged: true },
      );
    } else if (
      upcoming.length > 0 &&
      upcoming[0].scheduledDate <= addDays(today, leadDays)
    ) {
      const next = upcoming[0];
      await this.alertsService.raise(
        {
          kind: AlertKind.PROPHYLAXIE,
          level: AlertLevel.JAUNE,
          message: `Soin à venir : « ${next.name} » planifié le ${dateFr(next.scheduledDate)}.`,
          recommendation:
            'Préparer le produit et l’abreuvement avant la date prévue pour ne pas dépasser la fenêtre recommandée.',
          context: { nextDate: next.scheduledDate },
        },
        { farmId, batchId },
        // Re-evaluated on every calendar read: keep the farmer's ack.
        { keepAcknowledgedIfUnchanged: true },
      );
    } else {
      await this.alertsService.clearKind(
        farmId,
        batchId,
        AlertKind.PROPHYLAXIE,
      );
    }

    // --- DELAI_ATTENTE : sécurité alimentaire (commercialisation suspendue) ---
    const activeWithdrawal = treatments
      .filter(
        (t) => t.withdrawalEndDate != null && t.withdrawalEndDate >= today,
      )
      .sort((a, b) => a.withdrawalEndDate!.localeCompare(b.withdrawalEndDate!));

    if (activeWithdrawal.length > 0) {
      const endDate = activeWithdrawal[0].withdrawalEndDate!;
      await this.alertsService.raise(
        {
          kind: AlertKind.DELAI_ATTENTE,
          level: AlertLevel.ROUGE,
          message: `Délai d'attente actif sur le lot : commercialisation et vente suspendues jusqu'au ${endDate} (sécurité alimentaire).`,
          recommendation: `Attendre le ${endDate} avant toute vente ou publication sur le marché. Respecter scrupuleusement le délai d'élimination de la molécule.`,
          context: {
            withdrawalEndDate: endDate,
            activeTreatments: activeWithdrawal.length,
          },
        },
        { farmId, batchId },
      );
    } else {
      await this.alertsService.clearKind(
        farmId,
        batchId,
        AlertKind.DELAI_ATTENTE,
      );
    }
  }

  private async refreshProphylaxisStatuses(batchId: string): Promise<void> {
    const warnDays = await this.constants.get(
      ReferenceKey.PROPHYLAXIE_RETARD_WARN_DAYS,
      1,
    );
    const limit = addDays(todayStr(), -warnDays);
    const events = await this.eventRepo.find({
      where: { batchId, status: ProphylaxisStatus.PLANIFIE },
    });
    // A reference step is late from its first planned date (postponed or not).
    const toFlag = events.filter((e) => lateFrom(e) < limit);
    if (toFlag.length > 0) {
      for (const e of toFlag) e.status = ProphylaxisStatus.EN_RETARD;
      await this.eventRepo.save(toFlag);
    }
  }

  // ---------- Helpers ----------

  private async assertEvent(
    farmId: string,
    batchId: string,
    eventId: string,
  ): Promise<ProphylaxisEvent> {
    await this.assertBatchInFarm(farmId, batchId);
    const event = await this.eventRepo.findOne({
      where: { id: eventId, farmId, batchId },
    });
    if (!event)
      throw new NotFoundException(
        'Soin prophylactique introuvable sur ce lot.',
      );
    return event;
  }

  /** Product of a step of a programme the farm may use (shared or its own). */
  private async stepProduct(
    farmId: string,
    stepId: string,
  ): Promise<{ ok: true; productCode: null; productName: string }> {
    const step = await this.stepRepo.findOne({ where: { id: stepId } });
    const protocol = step
      ? await this.findUsableProtocol(step.protocolId, farmId)
      : null;
    if (!step || !protocol) {
      throw new BadRequestException(
        'Étape de programme sanitaire introuvable pour cette ferme.',
      );
    }
    return { ok: true, productCode: null, productName: step.name };
  }

  private async assertBatchInFarm(
    farmId: string,
    batchId: string,
  ): Promise<ProductionBatch> {
    const batch = await this.batchRepo.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch)
      throw new NotFoundException('Lot introuvable dans cette ferme.');
    return batch;
  }

  private async assertMedicationLot(
    farmId: string,
    inputLotId: string,
  ): Promise<void> {
    const lot = await this.inputRepo.findOne({
      where: { id: inputLotId, farmId },
    });
    if (!lot)
      throw new BadRequestException(
        'Lot d’intrant (médicament) introuvable dans cette ferme.',
      );
  }

  /**
   * Déduit une quantité (dose) du stock d'un lot d'intrant MEDICAMENT.
   * Transaction + verrou pessimiste : jamais de stock négatif (400 sinon).
   */
  private async consumeMedicationStock(
    farmId: string,
    medicationLotId: string,
    qty: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const lot = await em
        .getRepository(InputLot)
        .createQueryBuilder('lot')
        .setLock('pessimistic_write')
        .where('lot.id = :id', { id: medicationLotId })
        .andWhere('lot.farmId = :farmId', { farmId })
        .getOne();
      if (!lot)
        throw new BadRequestException(
          'Lot d’intrant (médicament) introuvable dans cette ferme.',
        );
      if (lot.entryType !== FeedEntryType.MEDICAMENT)
        throw new BadRequestException(
          'Ce lot d’intrant n’est pas un médicament : sortie de stock impossible.',
        );
      const available = Math.max(0, lot.quantity ?? 0);
      if (qty <= 0 || qty > available) {
        throw new BadRequestException(
          `Sortie de stock impossible : il ne reste que ${available} ${lot.unit ?? lot.doseUnit ?? ''} de « ${lot.productName} » (jamais de quantité négative). Réapprovisionnez le stock ou choisissez « Externe au stock ».`,
        );
      }
      lot.quantity = Math.round((available - qty) * 1000) / 1000;
      await em.getRepository(InputLot).save(lot);
    });
  }

  /** Restitue la quantité au lot MEDICAMENT (annulation/suppression du soin). */
  private async restoreMedicationStock(
    farmId: string,
    medicationLotId: string,
    qty: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const lot = await em
        .getRepository(InputLot)
        .createQueryBuilder('lot')
        .setLock('pessimistic_write')
        .where('lot.id = :id', { id: medicationLotId })
        .andWhere('lot.farmId = :farmId', { farmId })
        .getOne();
      if (!lot || lot.entryType !== FeedEntryType.MEDICAMENT) return;
      lot.quantity =
        Math.round((Math.max(0, lot.quantity ?? 0) + (qty ?? 0)) * 1000) / 1000;
      await em.getRepository(InputLot).save(lot);
    });
  }

  private async saveSteps(
    protocolId: string,
    steps: ProtocolStepInput[],
  ): Promise<void> {
    const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
    for (const s of sorted) {
      await this.stepRepo.save(
        this.stepRepo.create({
          protocolId,
          stepOrder: s.stepOrder,
          dayFrom: s.dayFrom,
          dayTo: s.dayTo,
          careType: s.careType,
          name: s.name,
          dosage: s.dosage ?? null,
          route: s.route ?? null,
          withdrawalDays: s.withdrawalDays ?? 0,
          active: true,
        }),
      );
    }
  }

  private slugify(name: string): string {
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return `custom-${slug || 'protocol'}-${Date.now().toString(36)}`;
  }
}
