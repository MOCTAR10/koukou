import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import { ageOn, utcDay } from '../batches/poufa/bande-rules.js';
import { FarmsService } from '../farms/farms.service.js';

/** A band as the sanitary screens list it (no economics). */
export interface SanitaryLotView {
  id: string;
  code: string | null;
  name: string | null;
  species: string;
  type: string;
  status: string;
  integrationDate: string;
  /** Age today, or on its closing day for a closed band (J+x counted). */
  ageDays: number;
  quantityAtStart: number;
  quantityAlive: number;
  closedAt: Date | null;
  building: { id: string; name: string } | null;
}

/**
 * Minimal band list of a farm for the sanitary side (domain SANITAIRE), so
 * the veterinary services, who hold no TECHNIQUE rights, can pick a band.
 */
@Injectable()
export class SanitaryLotsService {
  constructor(
    private readonly farms: FarmsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async list(
    user: AuthUser,
    farmId: string,
    openOnly: boolean,
  ): Promise<SanitaryLotView[]> {
    await this.farms.assertAccessible(user, farmId);
    const rows: Array<
      Omit<SanitaryLotView, 'ageDays' | 'building'> & {
        initialAgeDays: number | null;
        buildingId: string | null;
        buildingName: string | null;
      }
    > = await this.dataSource.query(
      `SELECT b.id, b.code, b.batch_name AS name, b.species, b.type, b.status,
              TO_CHAR(b.integration_date, 'YYYY-MM-DD') AS "integrationDate",
              b.initial_age_days AS "initialAgeDays",
              b.quantity_at_start AS "quantityAtStart",
              b.quantity_alive AS "quantityAlive",
              b.closed_at AS "closedAt",
              b.building_id AS "buildingId", g.name AS "buildingName"
         FROM production_batches b
         LEFT JOIN buildings g ON g.id = b.building_id
        WHERE b.farm_id = $1 ${openOnly ? 'AND b.status <> $2' : ''}
        ORDER BY b.integration_date DESC, b.id`,
      openOnly ? [farmId, BatchStatus.CLOTURE] : [farmId],
    );
    const today = utcDay();
    return rows.map(({ initialAgeDays, buildingId, buildingName, ...r }) => ({
      ...r,
      ageDays: ageOn(
        r.integrationDate,
        initialAgeDays,
        r.closedAt ? utcDay(new Date(r.closedAt)) : today,
      ),
      building: buildingId ? { id: buildingId, name: buildingName ?? '' } : null,
    }));
  }
}
