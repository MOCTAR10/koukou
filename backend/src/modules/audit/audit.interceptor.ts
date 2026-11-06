import {
  CallHandler,
  CanActivate,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { from, Observable } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import {
  AUDIT_EXPORT_KEY,
  AUDIT_READ_KEY,
} from '../../common/decorators/audit.decorator.js';
import { RequestContext } from '../../common/context/request-context.js';
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
  user?: { id?: string; role?: string };
};

function planFor(reflector: Reflector, context: ExecutionContext) {
  const req = context.switchToHttp().getRequest<AuditedRequest>();
  const targets = [context.getHandler(), context.getClass()];
  return resolveAuditPlan(
    req.method,
    routeTemplate(req),
    reflector.getAllAndOverride<unknown>(AUDIT_READ_KEY, targets),
    reflector.getAllAndOverride<unknown>(AUDIT_EXPORT_KEY, targets),
  );
}

/**
 * Global audit interceptor: one `AuditEvent` per write, sensitive read,
 * export and login, success and failure alike. The insert is awaited before
 * the response is sent; `AuditService.record` never throws, so a journal
 * failure cannot turn a successful business response into an error.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<AuditedRequest>();
    const res = http.getResponse<Response>();
    const plan = planFor(this.reflector, context);
    if (!plan) return next.handle();
    if (req.user?.id)
      RequestContext.setActor(req.user.id, req.user.role ?? null);

    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        req[AUDIT_RECORDED] = true;
        await this.audit.recordRequest(req, res, plan, {
          statusCode: res.statusCode,
          body,
        });
        return body;
      }),
      catchError((error: unknown) =>
        from(
          (async () => {
            req[AUDIT_RECORDED] = true;
            await this.audit.recordRequest(req, res, plan, {
              statusCode: statusOfError(error),
              error,
            });
            throw error;
          })(),
        ),
      ),
    );
  }
}

/**
 * Global guard that never blocks: it only stores the audit plan on the
 * request, so `AuditExceptionFilter` can journal a request refused by a later
 * guard (401, 403) before any interceptor ran. It must run before the auth
 * guards: `AuditModule` is imported ahead of `AuthModule` in `AppModule`
 * (global guards run in module registration order).
 */
@Injectable()
export class AuditPlanGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest<AuditedRequest>();
      req[AUDIT_PLAN] = planFor(this.reflector, context);
    }
    return true;
  }
}
