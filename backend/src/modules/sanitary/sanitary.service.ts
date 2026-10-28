import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AlertKind, AlertLevel } from '../../common/enums/alert-level.enum.js';
import { BatchType } from '../../common/enums/batch-type.enum.js';
import { CareType } from '../../common/enums/care-type.enum.js';
import { FeedEntryType } from '../../common/enums/feed-entry-type.enum.js';
import { ProphylaxisStatus } from '../../common/enums/prophylaxis-status.enum.js';
import { ReferenceKey } from '../../common/enums/reference-key.enum.js';
import { ScheduleSource } from '../../common/enums/schedule-source.enum.js';
import { Species } from '../../common/enums/species.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { ReferenceConstantsService } from '../reference-constants/reference-constants.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
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
import { CreateManualScheduleDto } from './dto/create-manual-schedule.dto.js';
import { UpdateScheduleDto } from './dto/update-schedule.dto.js';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
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
  ) {}

  // ---------- Protocoles sanitaire (données de référence) ----------

  async listProtocols(
    species?: string,
    type?: string,
  ): Promise<SanitaryProtocol[]> {
    const where: Record<string, string> = {};
    if (species) where.species = species;
    if (type) where.type = type;
    return this.protocolRepo.find({ where, order: { name: 'ASC' } });
  }

  async findProtocol(
    id: string,
  ): Promise<SanitaryProtocol & { steps: ProtocolStep[] }> {
    const protocol = await this.protocolRepo.findOne({ where: { id } });
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
      where: { species, type, isDefault: true },
      order: { createdAt: 'ASC' },
    });
  }

  async createProtocol(
    dto: CreateSanitaryProtocolDto,
  ): Promise<SanitaryProtocol & { steps: ProtocolStep[] }> {
    const code = dto.code ?? this.slugify(dto.name);
    const existing = await this.protocolRepo.findOne({ where: { code } });
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
      }),
    );
    await this.saveSteps(protocol.id, dto.steps);
    return this.findProtocol(protocol.id);
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

    const protocol = protocolId
      ? await this.protocolRepo.findOne({ where: { id: protocolId } })
      : await this.resolveDefaultProtocol(batch.species, batch.type);
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
    for (const step of steps) {
      if (existingStepIds.has(step.id)) continue;
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
          scheduledDate: addDays(batch.integrationDate, step.dayFrom),
          status: ProphylaxisStatus.PLANIFIE,
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
    await this.refreshProphylaxis(batchId);
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

  async completeEvent(
    user: AuthUser,
    farmId: string,
    batchId: string,
    eventId: string,
    dto: {
      completedAt?: string;
      notes?: string;
      medicationLotId?: string;
    },
  ): Promise<ProphylaxisEvent> {
    await this.farmsService.assertAccessible(user, farmId);
    const event = await this.assertEvent(farmId, batchId, eventId);
    if (event.status === ProphylaxisStatus.FAIT) {
      throw new BadRequestException('Ce soin a déjà été réalisé.');
    }

    event.status = ProphylaxisStatus.FAIT;
    event.completedAt = dto.completedAt
      ? new Date(dto.completedAt)
      : new Date();
    event.performedById = user.id;
    event.performedNotes = dto.notes ?? null;
    if (dto.medicationLotId) {
      await this.assertMedicationLot(farmId, dto.medicationLotId);
      event.medicationLotId = dto.medicationLotId;
    }
    await this.eventRepo.save(event);

    // Tout soin avec délai d'attente (antibiotique, médicament…) ouvre un
    // suivi HACCP : c'est le délai qui protège le consommateur, pas le type.
    if (event.withdrawalDays > 0) {
      await this.treatmentRepo.save(
        this.treatmentRepo.create({
          farmId,
          batchId,
          careType: event.careType,
          productName: event.name,
          dosage: event.dosage,
          route: event.route,
          administeredAt: event.completedAt,
          withdrawalDays: event.withdrawalDays,
          withdrawalEndDate: computeWithdrawalEndDate(
            event.completedAt,
            event.withdrawalDays,
          ),
          performedById: user.id,
          medicationLotId: event.medicationLotId,
          notes: event.performedNotes,
        }),
      );
    }

    await this.refreshProphylaxis(batchId);
    return event;
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
    event.scheduledDate = scheduledDate;
    event.status = ProphylaxisStatus.PLANIFIE;
    await this.eventRepo.save(event);
    await this.refreshProphylaxis(batchId);
    return event;
  }

  // ---------- Traitements (registre HACCP) ----------

  async createTreatment(
    user: AuthUser,
    farmId: string,
    batchId: string,
    dto: CreateTreatmentDto,
  ): Promise<TreatmentRecord> {
    await this.farmsService.assertAccessible(user, farmId);
    await this.assertBatchInFarm(farmId, batchId);
    if (dto.medicationLotId) {
      await this.assertMedicationLot(farmId, dto.medicationLotId);
    }
    const administeredAt = dto.administeredAt
      ? new Date(dto.administeredAt)
      : new Date();
    const treatment = await this.treatmentRepo.save(
      this.treatmentRepo.create({
        farmId,
        batchId,
        careType: dto.careType,
        productName: dto.productName,
        dosage: dto.dosage ?? null,
        route: dto.route ?? null,
        administeredAt,
        withdrawalDays: dto.withdrawalDays ?? 0,
        withdrawalEndDate: computeWithdrawalEndDate(
          administeredAt,
          dto.withdrawalDays ?? 0,
        ),
        performedById: user.id,
        medicationLotId: dto.medicationLotId ?? null,
        notes: dto.notes ?? null,
      }),
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
    const protocol = await this.protocolRepo.findOne({
      where: { id: dto.protocolId },
    });
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
        const scheduledDate = addDays(lot.integrationDate, step.dayFrom);
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
      await this.consumeMedicationStock(
        farmId,
        dto.medicationLotId,
        dto.medicationQty ?? 0,
      );
    }

    const created: ProphylaxisEvent[] = [];
    for (const lotId of dto.lotIds) {
      const lot = await this.assertBatchInFarm(farmId, lotId);
      const event = await this.eventRepo.save(
        this.eventRepo.create({
          farmId,
          batchId: lotId,
          buildingId: lot.buildingId,
          protocolStepId: null,
          source: ScheduleSource.MANUEL,
          careType: dto.careType,
          name: dto.name,
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
          message: `Soin à venir : « ${next.name} » planifié le ${next.scheduledDate}.`,
          recommendation:
            'Préparer le produit et l’abreuvement avant la date prévue pour ne pas dépasser la fenêtre recommandée.',
          context: { nextDate: next.scheduledDate },
        },
        { farmId, batchId },
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
    const toFlag = events.filter((e) => e.scheduledDate < limit);
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
