import { EntityManager, In, LessThan, MoreThanOrEqual } from 'typeorm';
import {
  AlertKind,
  AlertLevel,
  AlertStatus,
} from '../../common/enums/alert-level.enum.js';
import { ProphylaxisStatus } from '../../common/enums/prophylaxis-status.enum.js';
import { ReferenceKey } from '../../common/enums/reference-key.enum.js';
import { Alert } from '../alerts/entities/alert.entity.js';
import { ReferenceConstant } from '../reference-constants/entities/reference-constant.entity.js';
import { ProphylaxisEvent } from './entities/prophylaxis-event.entity.js';
import { TreatmentRecord } from './entities/treatment-record.entity.js';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export interface SanitaryHolds {
  /** Last day of the longest running withdrawal period, null when none. */
  withdrawalEndDate: string | null;
  /**
   * A care is overdue: read from the events (statuses and the red alert are
   * only refreshed by sanitary routes), or a red PROPHYLAXIE alert is open,
   * acknowledged or not.
   */
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
  const warn = await em
    .getRepository(ReferenceConstant)
    .findOne({ where: { key: ReferenceKey.PROPHYLAXIE_RETARD_WARN_DAYS } });
  // Same rule as SanitaryService.refreshProphylaxisStatuses (EN_RETARD).
  const overdueBefore = daysBefore(todayStr(), warn?.value ?? 1);
  const [treatments, overdue, lateEvents] = await Promise.all([
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
    em.getRepository(ProphylaxisEvent).count({
      where: [
        { farmId, batchId, status: ProphylaxisStatus.EN_RETARD },
        {
          farmId,
          batchId,
          status: ProphylaxisStatus.PLANIFIE,
          scheduledDate: LessThan(overdueBefore),
        },
      ],
    }),
  ]);
  const ends = treatments
    .map((t) => t.withdrawalEndDate)
    .filter((d): d is string => d != null)
    .sort();
  return {
    withdrawalEndDate: ends.length > 0 ? ends[ends.length - 1] : null,
    prophylaxisOverdue: overdue > 0 || lateEvents > 0,
  };
}
