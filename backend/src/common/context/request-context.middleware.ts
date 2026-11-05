import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  REQUEST_ID_HEADER,
  RequestContext,
  resolveRequestId,
} from './request-context.js';

/**
 * Opens the request context (global middleware, see `AuditModule`): keeps the
 * client's `X-Request-Id` when it is a UUID, otherwise creates one, and echoes
 * it in the response so a client can quote it to support or to an auditor.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = resolveRequestId(req.headers['x-request-id']);
    res.setHeader(REQUEST_ID_HEADER, requestId);
    RequestContext.run({ requestId, actorUserId: null, actorRole: null }, () =>
      next(),
    );
  }
}
