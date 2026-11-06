import { HttpException } from '@nestjs/common';
import type { ImportRowOutcome } from '../../common/enums/import-job.enum.js';

/** A staging line as the pipelines read it. */
export interface StagedRow {
  readonly line: number;
  readonly values: Readonly<Record<string, string>>;
  readonly excluded: boolean;
}

/** Findings of the controls on one line. */
export interface RowFinding {
  errors: string[];
  warnings: string[];
  planned: ImportRowOutcome | null;
  groupKey: string | null;
  sourceKey: string | null;
  details: Record<string, unknown> | null;
}

/** What the dry run or the integration did with one line. */
export interface RowResult {
  readonly outcome: ImportRowOutcome;
  readonly message: string | null;
  readonly targetId: string | null;
  readonly targetCode: string | null;
}

/** French message of a refused business rule (HttpException), else null. */
export function refusalMessage(error: unknown): string | null {
  if (!(error instanceof HttpException)) return null;
  const status = error.getStatus();
  if (status >= 500) return null;
  const body = error.getResponse();
  if (typeof body === 'string') return body;
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join(' ');
  return typeof message === 'string' ? message : error.message;
}
