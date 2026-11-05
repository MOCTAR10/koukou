import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  type EntitySubscriberInterface,
  type TransactionStartEvent,
} from 'typeorm';
import { RequestContext } from '../../common/context/request-context.js';

/**
 * Hands the request context to PostgreSQL at the start of every transaction,
 * for the row trigger `audit_row_change()` (level 2): `app.request_id` and
 * `app.actor_id`, transaction-local (`set_config(..., true)`), so a pooled
 * connection never carries them to another request.
 *
 * `afterTransactionStart` is broadcast by `PostgresQueryRunner.startTransaction`
 * right after `START TRANSACTION` (TypeORM 0.3.31), which covers
 * `manager.transaction(...)`, `dataSource.transaction(...)`, and
 * `repository.save/remove` (they open their own transaction). Query-builder
 * `update/insert/delete` and `repository.update/insert/delete` run without a
 * transaction: their row changes get a null request id, and level 1 (the
 * request's `audit_events` row) still covers them.
 */
@Injectable()
export class AuditContextSubscriber implements EntitySubscriberInterface {
  constructor(@InjectDataSource() dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  async afterTransactionStart(event: TransactionStartEvent): Promise<void> {
    const context = RequestContext.current();
    if (!context) return;
    await event.queryRunner.query(
      `SELECT set_config('app.request_id', $1, true), set_config('app.actor_id', $2, true)`,
      [context.requestId, context.actorUserId ?? ''],
    );
  }
}
