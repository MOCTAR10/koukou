import { SetMetadata } from '@nestjs/common';

export const AUDIT_READ_KEY = 'audit:read';
export const AUDIT_EXPORT_KEY = 'audit:export';

/**
 * Sensitive read: the audit journal records who consulted this route and why
 * (`reason`, in French, is stored in the event summary). Writes are always
 * recorded and need no decorator.
 */
export const AuditRead = (reason: string) =>
  SetMetadata(AUDIT_READ_KEY, reason);

/** File export (CSV, PDF…): recorded in the audit journal as EXPORT. */
export const AuditExport = (label?: string) =>
  SetMetadata(AUDIT_EXPORT_KEY, label ?? true);
