import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestContextMiddleware } from '../../common/context/request-context.middleware.js';
import { CommonModule } from '../../common/services/common.module.js';
import { AuditContextSubscriber } from './audit-context.subscriber.js';
import { AuditExceptionFilter } from './audit-exception.filter.js';
import { AuditInterceptor, AuditPlanGuard } from './audit.interceptor.js';
import { AuditQueryService } from './audit-query.service.js';
import { AuditSealService } from './audit-seal.service.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { AuditEvent } from './entities/audit-event.entity.js';
import { AuditRowChange } from './entities/audit-row-change.entity.js';
import { AuditSeal } from './entities/audit-seal.entity.js';

/**
 * Audit journal (POUFA, ANINF requirement). Level 1: `AuditInterceptor` +
 * `AuditExceptionFilter` write `audit_events`. Level 2: PostgreSQL triggers
 * write `audit_row_changes`, fed by `AuditContextSubscriber`. Daily seal:
 * `AuditSealService`. Must be imported before `AuthModule` (see
 * `AuditPlanGuard`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditEvent, AuditRowChange, AuditSeal]),
    CommonModule,
  ],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditQueryService,
    AuditSealService,
    AuditContextSubscriber,
    { provide: APP_GUARD, useClass: AuditPlanGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AuditExceptionFilter },
  ],
  exports: [AuditService, AuditSealService],
})
export class AuditModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
