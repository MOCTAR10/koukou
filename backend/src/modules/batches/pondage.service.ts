import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { BatchType } from '../../common/enums/batch-type.enum.js';
import { isoWeekStart } from '../../common/utils/date.utils.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { ProductionBatch } from './entities/production-batch.entity.js';
import { FlockTimeline, populationOn } from './flock-performance.js';
import { FlockReconciliationService } from './flock-reconciliation.service.js';

export interface PondageWeek {
  weekStart: string;
  collected: number;
  sellable: number;
  cracked: number;
  small: number;
  daysRecorded: number;
  layRatePercent: number | null;
}

export interface PondageSummary {
  batchId: string;
  type: BatchType;
  quantityAtStart: number;
  quantityAlive: number;
  daysRecorded: number;
  totals: {
    collected: number;
    sellable: number;
    cracked: number;
    small: number;
  };
  sellableRatioPercent: number | null;
  eggsPerHen: number | null;
  layRatePercent: number | null;
  weekly: PondageWeek[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class PondageService {
  constructor(
    @InjectRepository(DailyEntry)
    private readonly entryRepo: Repository<DailyEntry>,
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    private readonly farmsService: FarmsService,
    private readonly flockReconciliation: FlockReconciliationService,
  ) {}

  async summary(
    user: AuthUser,
    farmId: string,
    batchId: string,
  ): Promise<PondageSummary> {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.batchRepo.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch)
      throw new NotFoundException('Lot introuvable dans cette ferme.');

    const entries = await this.entryRepo.find({
      where: { batchId },
      order: { entryDate: 'ASC' },
    });

    const collected = entries.reduce((s, e) => s + e.eggsCollected, 0);
    const sellable = entries.reduce((s, e) => s + e.eggsSellable, 0);
    const cracked = entries.reduce((s, e) => s + e.eggsCracked, 0);
    const small = entries.reduce((s, e) => s + e.eggsSmall, 0);
    const daysRecorded = entries.filter((e) => e.eggsCollected > 0).length;

    const liveCount = Math.max(0, batch.quantityAlive);

    return {
      batchId: batch.id,
      type: batch.type,
      quantityAtStart: batch.quantityAtStart,
      quantityAlive: liveCount,
      daysRecorded,
      totals: { collected, sellable, cracked, small },
      sellableRatioPercent:
        collected > 0 ? round2((sellable / collected) * 100) : null,
      eggsPerHen:
        batch.quantityAtStart > 0
          ? round2(collected / batch.quantityAtStart)
          : null,
      layRatePercent:
        batch.type === BatchType.PONDEUSE
          ? this.recentLayRate(entries, liveCount)
          : null,
      weekly: this.buildWeekly(entries, batch, {
        integrationDate: batch.integrationDate,
        quantityAtStart: batch.quantityAtStart,
        day1WeightKg: 0,
        entries,
        removalsByDate: await this.flockReconciliation.removalsByDate(batch.id),
      }),
    };
  }

  /**
   * Average daily lay rate over the last 7 days with eggs recorded, the same
   * window as MetricsService (eggs collected over the whole life divided by
   * today's hens would read 2700 % after a month). Capped at 100 %.
   */
  private recentLayRate(
    entries: DailyEntry[],
    liveCount: number,
  ): number | null {
    const since = new Date(Date.now() - 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const recent = entries.filter(
      (e) => e.entryDate >= since && e.eggsCollected > 0,
    );
    const days = new Set(recent.map((e) => e.entryDate)).size;
    if (liveCount <= 0 || days === 0) return null;
    const eggs = recent.reduce((s, e) => s + e.eggsCollected, 0);
    return round2(Math.min(100, (eggs / (liveCount * days)) * 100));
  }

  private buildWeekly(
    entries: DailyEntry[],
    batch: ProductionBatch,
    timeline: FlockTimeline,
  ): PondageWeek[] {
    type WeekGroup = {
      weekStart: string;
      collected: number;
      sellable: number;
      cracked: number;
      small: number;
      dates: Set<string>;
    };
    const byWeek = new Map<string, WeekGroup>();
    for (const e of entries) {
      if (e.eggsCollected <= 0 && e.deaths <= 0) continue;
      const weekStart = isoWeekStart(e.entryDate);
      let group = byWeek.get(weekStart);
      if (!group) {
        group = {
          weekStart,
          collected: 0,
          sellable: 0,
          cracked: 0,
          small: 0,
          dates: new Set(),
        };
        byWeek.set(weekStart, group);
      }
      group.collected += e.eggsCollected;
      group.sellable += e.eggsSellable;
      group.cracked += e.eggsCracked;
      group.small += e.eggsSmall;
      group.dates.add(e.entryDate);
    }

    const weeks = [...byWeek.values()].sort((a, b) =>
      a.weekStart.localeCompare(b.weekStart),
    );
    return weeks.map((w) => {
      // Hens present at the start of the week: deaths, MORTALITE events,
      // réformes and sales all leave the flock (selling half the hens must
      // not halve the lay rate).
      const hens = populationOn(timeline, addDaysIso(w.weekStart, -1));
      // Taux journalier moyen de la semaine, plafonné à 100 % (une poule ne
      // pond jamais plus d'un œuf/jour ; au-delà = saisie d'œufs incohérente).
      const rawLayRate =
        hens > 0 && w.dates.size > 0
          ? (w.collected / (hens * w.dates.size)) * 100
          : null;
      const layRatePercent =
        batch.type === BatchType.PONDEUSE && rawLayRate != null
          ? round2(Math.min(100, rawLayRate))
          : null;
      return {
        weekStart: w.weekStart,
        collected: w.collected,
        sellable: w.sellable,
        cracked: w.cracked,
        small: w.small,
        daysRecorded: w.dates.size,
        layRatePercent: layRatePercent != null ? round2(layRatePercent) : null,
      };
    });
  }
}
