/** Kind of entry in the audit journal (`audit_events.action`). */
export enum AuditAction {
  /** POST / PUT / PATCH / DELETE, successful or not. */
  WRITE = 'WRITE',
  /** A read marked `@AuditRead` (personal, HR, platform-wide data, the journal itself). */
  READ_SENSITIVE = 'READ_SENSITIVE',
  /** A file export marked `@AuditExport` (CSV, PDF). */
  EXPORT = 'EXPORT',
  LOGIN = 'LOGIN',
  LOGIN_FAILED = 'LOGIN_FAILED',
  /** Written by the server itself (daily seal). */
  SYSTEM = 'SYSTEM',
}
