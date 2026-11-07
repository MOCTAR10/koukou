import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { utcDay } from '../batches/poufa/bande-rules.js';
import { ParametersService } from '../programme/parameters.service.js';
import {
  latestControls,
  type BiosecurityClassCode,
  type FarmBiosecurity,
} from './pilotage-biosecurity.js';

/**
 * Latest biosecurity control of each farm (visits with a computed class,
 * `farm_visits`), for the steering views. Read-only; the scope (which farms)
 * is the caller's.
 */
@Injectable()
export class PilotageBiosecurityService {
  constructor(
    private readonly parameters: ParametersService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** `BIOSECURITE_CONTROLE_ANCIEN_JOURS` in force (0: no « ancien » flag). */
  async staleAfterDays(programId: string): Promise<number> {
    const resolver = await this.parameters.resolver(programId);
    return Number(
      resolver.value<number>('BIOSECURITE_CONTROLE_ANCIEN_JOURS', new Date()),
    );
  }

  /** One entry per farm id, never-controlled farms included. */
  async ofFarms(
    programId: string,
    farmIds: readonly string[],
    today: string = utcDay(),
  ): Promise<{
    byFarm: Map<string, FarmBiosecurity>;
    staleAfterDays: number;
  }> {
    const staleAfterDays = await this.staleAfterDays(programId);
    if (farmIds.length === 0) return { byFarm: new Map(), staleAfterDays };
    const rows: Array<{
      farm_id: string;
      visit_date: string;
      created_at: Date;
      classification: BiosecurityClassCode;
      score_pct: string | null;
    }> = await this.dataSource.query(
      `SELECT DISTINCT ON (farm_id) farm_id, visit_date::text AS visit_date,
              created_at, classification::text AS classification, score_pct
         FROM farm_visits
        WHERE farm_id = ANY($1::uuid[]) AND classification IS NOT NULL
        ORDER BY farm_id, visit_date DESC, created_at DESC`,
      [farmIds],
    );
    return {
      byFarm: latestControls(
        farmIds,
        rows.map((r) => ({
          farmId: r.farm_id,
          visitDate: r.visit_date,
          createdAt: r.created_at,
          classification: r.classification,
          scorePct: r.score_pct == null ? null : Number(r.score_pct),
        })),
        today,
        staleAfterDays,
      ),
      staleAfterDays,
    };
  }
}
