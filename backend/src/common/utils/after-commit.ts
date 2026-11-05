import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  type EntityManager,
  type EntitySubscriberInterface,
  type TransactionCommitEvent,
  type TransactionRollbackEvent,
} from 'typeorm';

const KEY = 'fermia.afterCommit';
const logger = new Logger('AfterCommit');

type Callback = () => unknown;

function runAll(callbacks: readonly Callback[]): void {
  for (const fn of callbacks) {
    Promise.resolve()
      .then(fn)
      .catch((err: unknown) =>
        logger.error(`Après validation : ${String(err)}`),
      );
  }
}

/**
 * Runs `fn` once the transaction of `em` has committed (dropped on rollback),
 * e.g. to emit a bus event whose listeners must see the committed rows. Out
 * of a transaction it runs right away. Errors are logged, never thrown.
 */
export function runAfterCommit(em: EntityManager, fn: Callback): void {
  const runner = em.queryRunner;
  if (!runner || !runner.isTransactionActive) {
    runAll([fn]);
    return;
  }
  const data = runner.data as Record<string, Callback[] | undefined>;
  (data[KEY] ??= []).push(fn);
}

/**
 * Fires the `runAfterCommit` callbacks. TypeORM also broadcasts
 * AfterTransactionCommit when a nested savepoint is released: the callbacks
 * wait for the outermost commit (`isTransactionActive` false).
 */
@Injectable()
export class AfterCommitSubscriber implements EntitySubscriberInterface {
  constructor(@InjectDataSource() dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  afterTransactionCommit(event: TransactionCommitEvent): void {
    const runner = event.queryRunner;
    if (runner.isTransactionActive) return;
    const data = runner.data as Record<string, Callback[] | undefined>;
    const callbacks = data[KEY];
    if (!callbacks) return;
    delete data[KEY];
    runAll(callbacks);
  }

  afterTransactionRollback(event: TransactionRollbackEvent): void {
    if (event.queryRunner.isTransactionActive) return;
    delete (event.queryRunner.data as Record<string, unknown>)[KEY];
  }
}
