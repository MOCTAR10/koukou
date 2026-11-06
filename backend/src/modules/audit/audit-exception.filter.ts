import { ArgumentsHost, Catch, Injectable } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request, Response } from 'express';
import {
  AUDIT_PLAN,
  AUDIT_RECORDED,
  resolveAuditPlan,
  type AuditPlan,
} from './audit-plan.js';
import { routeTemplate } from './audit-route.js';
import { AuditService, statusOfError } from './audit.service.js';

type AuditedRequest = Request & {
  [AUDIT_PLAN]?: AuditPlan | null;
  [AUDIT_RECORDED]?: boolean;
};

/**
 * Journals the requests that failed before `AuditInterceptor` could see them:
 * refused by a guard (401, 403, 429), unknown route (404), malformed body.
 * Then answers exactly like Nest's default filter.
 */
@Catch()
@Injectable()
export class AuditExceptionFilter extends BaseExceptionFilter {
  constructor(private readonly audit: AuditService) {
    super();
  }

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    if (host.getType() === 'http') {
      const req = host.switchToHttp().getRequest<AuditedRequest>();
      const res = host.switchToHttp().getResponse<Response>();
      if (req && !req[AUDIT_RECORDED]) {
        req[AUDIT_RECORDED] = true;
        // Without the guard's plan (no route matched, body parser error),
        // fall back to the method: writes are always journaled.
        const plan =
          req[AUDIT_PLAN] !== undefined
            ? req[AUDIT_PLAN]
            : resolveAuditPlan(
                req.method,
                routeTemplate(req),
                undefined,
                undefined,
              );
        if (plan) {
          await this.audit.recordRequest(req, res, plan, {
            statusCode: statusOfError(exception),
            error: exception,
          });
        }
      }
    }
    super.catch(exception, host);
  }
}
