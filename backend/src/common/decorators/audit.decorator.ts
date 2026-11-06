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

/** Metadata of {@link AuditThirdPartyRead}. */
export interface ThirdPartyReadMeta {
  reason: string;
  thirdPartyOnly: true;
}

/**
 * Sensitive read journaled when the reader is a third party to the farm: an
 * institutional account or the platform admin (CDC §8 « consultations
 * sensibles tracées »; POUFA audit F7/F8). The farm's own accounts (owner,
 * members) reading their business are not consultations by others and are
 * not journaled. A refused request is journaled whoever sent it.
 */
export const AuditThirdPartyRead = (reason: string) =>
  SetMetadata(AUDIT_READ_KEY, {
    reason,
    thirdPartyOnly: true,
  } satisfies ThirdPartyReadMeta);
