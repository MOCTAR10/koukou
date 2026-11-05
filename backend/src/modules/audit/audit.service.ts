import { HttpException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';
import {
  isUuid,
  REQUEST_ID_HEADER,
  RequestContext,
} from '../../common/context/request-context.js';
import { AuditAction } from '../../common/enums/audit-action.enum.js';
import { AuditEvent } from './entities/audit-event.entity.js';
import { type AuditPlan } from './audit-plan.js';
import {
  offlineOpId,
  requestFarmId,
  routeParams,
  routeTemplate,
} from './audit-route.js';
import {
  maskPhone,
  sanitizeSummary,
  sanitizeValue,
  truncate,
} from './audit-sanitize.js';

export interface AuditOutcome {
  statusCode: number;
  /** Response body of a successful request (login: the authenticated user). */
  body?: unknown;
  error?: unknown;
}

/** HTTP status of a thrown error, as Nest's exception filter answers it. */
export function statusOfError(error: unknown): number {
  if (error instanceof HttpException) return error.getStatus();
  const status =
    (error as { status?: unknown; statusCode?: unknown } | null)?.statusCode ??
    (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 600
    ? status
    : 500;
}

export function errorMessageOf(error: unknown): string | null {
  if (error == null) return null;
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const message =
      typeof response === 'string'
        ? response
        : ((response as { message?: unknown }).message ?? error.message);
    return truncate(
      Array.isArray(message) ? message.join(' ; ') : String(message),
      1000,
    );
  }
  return truncate(error instanceof Error ? error.message : String(error), 1000);
}

/**
 * Writes the audit journal (level 1). Every insert is awaited by the caller
 * (no silent loss) but never throws: a journal failure is logged loudly and
 * the business response goes out unchanged. The repository uses the default
 * connection, outside any business transaction, so a rollback never erases
 * the trace of the attempt.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditEvent)
    private readonly events: Repository<AuditEvent>,
  ) {}

  async record(event: Partial<AuditEvent>): Promise<void> {
    try {
      await this.events.insert({
        requestId: RequestContext.requestId(),
        ...event,
      } as QueryDeepPartialEntity<AuditEvent>);
    } catch (err) {
      this.logger.error(
        `JOURNAL D'AUDIT : écriture impossible (${event.action} ${event.method ?? ''} ${event.route ?? ''}, requête ${event.requestId ?? RequestContext.requestId() ?? '?'})`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /** Server-side event (seal…), with no HTTP request behind it. */
  recordSystem(route: string, summary: unknown): Promise<void> {
    return this.record({
      requestId: RequestContext.requestId() ?? randomUUID(),
      action: AuditAction.SYSTEM,
      method: 'SYSTEM',
      route,
      summary: sanitizeValue(summary) as Record<string, unknown> | null,
    });
  }

  recordRequest(
    req: Request,
    res: Response | undefined,
    plan: AuditPlan,
    outcome: AuditOutcome,
  ): Promise<void> {
    const failed = outcome.statusCode >= 400 || outcome.error != null;
    const context = RequestContext.current();
    const user = (req as Request & { user?: { id?: string; role?: string } })
      .user;
    let actorUserId = user?.id ?? context?.actorUserId ?? null;
    let actorRole = user?.role ?? context?.actorRole ?? null;

    let action: AuditAction;
    let summary: unknown;
    if (plan.kind === 'LOGIN') {
      action = failed ? AuditAction.LOGIN_FAILED : AuditAction.LOGIN;
      // Never the code: only the masked phone number.
      summary = { phone: maskPhone((req.body as { phone?: unknown })?.phone) };
      const loggedIn = (
        outcome.body as { user?: { id?: string; role?: string } }
      )?.user;
      if (!failed && loggedIn?.id) {
        actorUserId = loggedIn.id;
        actorRole = loggedIn.role ?? null;
      }
    } else if (plan.kind === AuditAction.WRITE) {
      action = AuditAction.WRITE;
      summary = sanitizeSummary(req.body);
    } else {
      action = plan.kind;
      const query = sanitizeSummary(req.query);
      summary =
        plan.kind === AuditAction.READ_SENSITIVE
          ? { reason: plan.reason, query }
          : { export: plan.label, query };
    }

    const headerId = res?.getHeader(REQUEST_ID_HEADER);
    return this.record({
      requestId:
        context?.requestId ?? (isUuid(headerId) ? headerId : randomUUID()),
      action,
      actorUserId: isUuid(actorUserId) ? actorUserId : null,
      actorRole: truncate(actorRole, 40),
      farmId: requestFarmId(req),
      method: req.method.toUpperCase().slice(0, 10),
      route: routeTemplate(req),
      params: routeParams(req),
      statusCode: outcome.statusCode,
      ip: truncate(req.ip ?? req.socket?.remoteAddress, 64),
      userAgent: truncate(req.headers['user-agent'], 300),
      offlineOpId: offlineOpId(req),
      summary: summary as Record<string, unknown> | null,
      errorMessage: failed ? errorMessageOf(outcome.error) : null,
    });
  }
}
