import { AuditAction } from '../../common/enums/audit-action.enum.js';
import { LOGIN_ROUTE, WRITE_METHODS } from './audit-route.js';

/** What the journal records for one request, decided before the handler runs. */
export type AuditPlan =
  | { kind: 'LOGIN' }
  | { kind: AuditAction.EXPORT; label: string | null }
  | { kind: AuditAction.READ_SENSITIVE; reason: string }
  | { kind: AuditAction.WRITE };

/** Request properties holding the plan (set by `AuditPlanGuard`) and the done flag. */
export const AUDIT_PLAN = Symbol('auditPlan');
export const AUDIT_RECORDED = Symbol('auditRecorded');

/**
 * Login first (it is a POST but is journaled as LOGIN / LOGIN_FAILED), then
 * an export, then a sensitive read, then any write. Other reads: nothing.
 */
export function resolveAuditPlan(
  method: string,
  route: string,
  readReason: unknown,
  exportMeta: unknown,
): AuditPlan | null {
  const verb = method.toUpperCase();
  if (verb === 'POST' && route === LOGIN_ROUTE) return { kind: 'LOGIN' };
  if (exportMeta) {
    return {
      kind: AuditAction.EXPORT,
      label: typeof exportMeta === 'string' ? exportMeta : null,
    };
  }
  if (typeof readReason === 'string') {
    return { kind: AuditAction.READ_SENSITIVE, reason: readReason };
  }
  if (WRITE_METHODS.has(verb)) return { kind: AuditAction.WRITE };
  return null;
}
