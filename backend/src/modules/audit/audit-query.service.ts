import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  type SelectQueryBuilder,
  type ObjectLiteral,
} from 'typeorm';
import { AuditEvent } from './entities/audit-event.entity.js';
import { AuditRowChange } from './entities/audit-row-change.entity.js';
import type {
  AuditEventsQueryDto,
  AuditRowChangesQueryDto,
} from './dto/audit-query.dto.js';

export const EXPORT_MAX_ROWS = 50_000;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `from`/`to` bounds: a bare day covers the whole UTC day (`to` inclusive). */
export function periodBounds(from?: string, to?: string) {
  const start = from
    ? new Date(DAY.test(from) ? `${from}T00:00:00.000Z` : from)
    : null;
  let end: Date | null = null;
  if (to) {
    end = DAY.test(to)
      ? new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000)
      : new Date(Date.parse(to) + 1);
  }
  if (start && end && start >= end) {
    throw new BadRequestException(
      'Période invalide : la date de début suit la date de fin.',
    );
  }
  return { start, end };
}

function applyPeriod<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  column: string,
  from?: string,
  to?: string,
) {
  const { start, end } = periodBounds(from, to);
  if (start) qb.andWhere(`${column} >= :start`, { start });
  if (end) qb.andWhere(`${column} < :end`, { end });
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** Read side of the audit journal (filters, pagination, export rows). */
@Injectable()
export class AuditQueryService {
  constructor(
    @InjectRepository(AuditEvent)
    private readonly events: Repository<AuditEvent>,
    @InjectRepository(AuditRowChange)
    private readonly rowChanges: Repository<AuditRowChange>,
  ) {}

  private eventsQuery(query: AuditEventsQueryDto) {
    const qb = this.events.createQueryBuilder('e');
    applyPeriod(qb, 'e.occurredAt', query.from, query.to);
    if (query.actorUserId) {
      qb.andWhere('e.actorUserId = :actor', { actor: query.actorUserId });
    }
    if (query.farmId) qb.andWhere('e.farmId = :farm', { farm: query.farmId });
    if (query.action)
      qb.andWhere('e.action = :action', { action: query.action });
    if (query.route) {
      qb.andWhere(`e.route ILIKE :route ESCAPE '\\'`, {
        route: `%${escapeLike(query.route)}%`,
      });
    }
    return qb.orderBy('e.id', 'DESC');
  }

  async listEvents(query: AuditEventsQueryDto): Promise<Page<AuditEvent>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const [items, total] = await this.eventsQuery(query)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { items, total, page, limit };
  }

  /** Newest first, capped at `EXPORT_MAX_ROWS`; `truncated` says the cap was hit. */
  async exportEvents(query: AuditEventsQueryDto) {
    const items = await this.eventsQuery(query)
      .take(EXPORT_MAX_ROWS + 1)
      .getMany();
    return {
      items: items.slice(0, EXPORT_MAX_ROWS),
      truncated: items.length > EXPORT_MAX_ROWS,
    };
  }

  async listRowChanges(
    query: AuditRowChangesQueryDto,
  ): Promise<Page<AuditRowChange>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const qb = this.rowChanges.createQueryBuilder('r');
    applyPeriod(qb, 'r.at', query.from, query.to);
    if (query.table)
      qb.andWhere('r.tableName = :table', { table: query.table });
    if (query.rowId) qb.andWhere('r.rowId = :rowId', { rowId: query.rowId });
    if (query.requestId) {
      qb.andWhere('r.requestId = :requestId', { requestId: query.requestId });
    }
    const [items, total] = await qb
      .orderBy('r.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { items, total, page, limit };
  }
}
