import { EntityManager, IsNull } from 'typeorm';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import { ProphylaxisStatus } from '../../common/enums/prophylaxis-status.enum.js';
import { ScheduleSource } from '../../common/enums/schedule-source.enum.js';
import type { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { ageZeroDay } from '../batches/poufa/bande-rules.js';
import { ProphylaxisEvent } from './entities/prophylaxis-event.entity.js';
import { ProtocolStep } from './entities/protocol-step.entity.js';
import { SanitaryProtocol } from './entities/sanitary-protocol.entity.js';
import { planSteps } from './care-reference-rules.js';

/** The vets' reference calendar for a species and type (shared, `isDefault`). */
export function findReferenceProtocol(
  em: EntityManager,
  species: string,
  type: string,
): Promise<SanitaryProtocol | null> {
  return em.getRepository(SanitaryProtocol).findOne({
    where: {
      species: species as SanitaryProtocol['species'],
      type: type as SanitaryProtocol['type'],
      isDefault: true,
      farmId: IsNull(),
    },
    order: { createdAt: 'ASC' },
  });
}

/** True when `protocol` is the vets' reference calendar. */
export function isReferenceProtocol(protocol: SanitaryProtocol): boolean {
  return protocol.isDefault && protocol.farmId == null;
}

/**
 * POUFA lot A2 sante (CDC n° 22): plans the reference calendar of the band's
 * species and type, in the opening transaction `em` (every opening path goes
 * through `BandeOpeningService.open`: new band, J+x band, data recovery).
 * Steps dated before `today` are not planned (see `planSteps`). No reference
 * calendar for the species and type, or a closed band: nothing happens, the
 * opening never fails on it. Returns the number of cares planned.
 */
export async function applyReferenceCalendar(
  em: EntityManager,
  batch: ProductionBatch,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<number> {
  if (batch.status === BatchStatus.CLOTURE) return 0;
  const protocol = await findReferenceProtocol(em, batch.species, batch.type);
  if (!protocol) return 0;
  const steps = await em.getRepository(ProtocolStep).find({
    where: { protocolId: protocol.id, active: true },
    order: { stepOrder: 'ASC' },
  });
  const events = em.getRepository(ProphylaxisEvent);
  const existing = await events.find({
    where: { batchId: batch.id },
    select: { id: true, protocolStepId: true },
  });
  const plan = planSteps(
    steps,
    ageZeroDay(batch.integrationDate, batch.initialAgeDays),
    today,
    new Set(
      existing
        .map((e) => e.protocolStepId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  for (const { step, date } of plan.planned) {
    await events.save(
      events.create({
        farmId: batch.farmId,
        batchId: batch.id,
        buildingId: batch.buildingId,
        protocolStepId: step.id,
        source: ScheduleSource.PROGRAM,
        careType: step.careType,
        name: step.name,
        dosage: step.dosage,
        route: step.route,
        withdrawalDays: step.withdrawalDays,
        scheduledDate: date,
        status: ProphylaxisStatus.PLANIFIE,
        isReference: true,
      }),
    );
  }
  return plan.planned.length;
}
