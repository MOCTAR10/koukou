import { EntityManager, In, MoreThanOrEqual } from 'typeorm';
import {
  AlertKind,
  AlertLevel,
  AlertStatus,
} from '../../common/enums/alert-level.enum.js';
import { Alert } from '../alerts/entities/alert.entity.js';
import { TreatmentRecord } from './entities/treatment-record.entity.js';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface SanitaryHolds {
  /** Last day of the longest running withdrawal period, null when none. */
  withdrawalEndDate: string | null;
  /** A red PROPHYLAXIE alert (overdue care) is open, acknowledged or not. */
  prophylaxisOverdue: boolean;
}

/**
 * Sanitary holds on a lot, for slaughter, the passport and sale readiness.
 * The withdrawal period is read from the treatments themselves: the
 * DELAI_ATTENTE alert can be acknowledged and is only refreshed by sanitary
 * routes, so it may be stale in both directions. Acknowledging an overdue
 * care alert does not make the care done, so ACQUITTEE still counts.
 */
export async function sanitaryHolds(
  em: EntityManager,
  farmId: string,
  batchId: string,
): Promise<SanitaryHolds> {
  const [treatments, overdue] = await Promise.all([
    em.getRepository(TreatmentRecord).find({
      where: { batchId, withdrawalEndDate: MoreThanOrEqual(todayStr()) },
    }),
    em.getRepository(Alert).count({
      where: {
        farmId,
        batchId,
        kind: AlertKind.PROPHYLAXIE,
        level: AlertLevel.ROUGE,
        status: In([AlertStatus.ACTIVE, AlertStatus.ACQUITTEE]),
      },
    }),
  ]);
  const ends = treatments
    .map((t) => t.withdrawalEndDate)
    .filter((d): d is string => d != null)
    .sort();
  return {
    withdrawalEndDate: ends.length > 0 ? ends[ends.length - 1] : null,
    prophylaxisOverdue: overdue > 0,
  };
}
