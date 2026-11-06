/**
 * Programme administration screens (POUFA): versioned parameters, lists and
 * territories, the audit journal and the data recovery. Shapes of
 * `backend/src/modules/programme` (`parameters.service.ts` `ParameterView`,
 * `program-parameter.entity.ts`, `ref-item.entity.ts`, `territory.service.ts`),
 * `backend/src/modules/audit` (`audit-query.service.ts`, `audit-seal.service.ts`)
 * and `backend/src/modules/data-import` (`import-jobs.service.ts` views,
 * `import-report.ts`, `import-templates.ts`).
 */

// ---------------------------------------------------------------------------
// Parameters: `GET /programme/parameters[?at=]`, `…/:key/history`, `POST …/:key`
// ---------------------------------------------------------------------------

export type ParameterType = 'number' | 'integer' | 'string' | 'formula' | 'json';

/** One catalog key with the version in force (`ParameterView`). */
export interface ParameterView {
  key: string;
  label: string;
  type: ParameterType;
  unit: string | null;
  /** Owner key (DGE, VETERINAIRE, ADMIN): its matrix right (`ownerRight`) changes the value. */
  ownerProfile: string;
  /** POUFA lot A2 vet: the right owning the value (server `PARAMETER_OWNER_RIGHTS`). */
  ownerRight?: { domain: string; action: string } | null;
  min: number | null;
  max: number | null;
  /** Null when no version is in force at the date asked. */
  value: unknown;
  validFrom: string | null;
  reason: string | null;
  createdById: string | null;
  /** Author's name; null for the seed or an unknown account. */
  createdByName?: string | null;
  versionId: string | null;
  /** Catalog « Proposé » value, used while no version is stored. */
  defaultValue?: unknown;
  /** Who must still decide the default, when the catalog says so. */
  defaultNote?: string | null;
}

/** A stored version (`ProgramParameter`), immutable. */
export interface ParameterVersion {
  id: string;
  programId: string;
  key: string;
  value: unknown;
  ownerProfile: string;
  validFrom: string;
  /** Null for the seed (« Proposé » value). */
  createdById: string | null;
  /** Author's name (`GET …/:key/history`); null for the seed or an unknown account. */
  createdByName?: string | null;
  reason: string | null;
  createdAt: string;
}

/** `POST /programme/parameters/:key`. */
export interface SetParameterBody {
  value: unknown;
  reason: string;
  /** ISO, now by default, never in the past. */
  validFrom?: string;
}

// ---------------------------------------------------------------------------
// Lists and territories
// ---------------------------------------------------------------------------

export type ProgramListType =
  | 'STATUT_FERME'
  | 'COHORTE'
  | 'INFRASTRUCTURE'
  | 'INTRANT'
  | 'UNITE'
  | 'MOTIF_SORTIE'
  | 'POSTE_CHARGE'
  | 'PRODUIT_TRAITEMENT'
  | 'SIGNE_CLINIQUE'
  | 'TYPE_OPERATEUR'
  | 'STATUT_ALERTE';

/** `GET /programme/lists/:listType/history` entry (`ref-list-history.ts`), newest first. */
export interface ListHistoryEntry {
  id: string;
  at: string;
  kind: 'CREATION' | 'MODIFICATION' | 'SUPPRESSION';
  code: string | null;
  label: string | null;
  /** Changed fields: label, active, sort, parentId, meta. */
  changes: Array<{ field: string; before: unknown; after: unknown }>;
  actorUserId: string | null;
  actorName: string | null;
  requestId: string | null;
}

/** `GET /programme/lists/:listType` item (`RefItem`). */
export interface ListItem {
  id: string;
  programId: string;
  listType: ProgramListType;
  code: string;
  label: string;
  family: string | null;
  parentId: string | null;
  meta: Record<string, unknown>;
  sort: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** `POST /programme/lists/:listType` (`CreateRefItemDto`). */
export interface CreateListItemBody {
  code: string;
  label: string;
  family?: string;
  sort?: number;
  active?: boolean;
}

/** `PATCH /programme/lists/:listType/:code`: code and family never change. */
export interface UpdateListItemBody {
  label?: string;
  sort?: number;
  active?: boolean;
}

export type LocaliteKind = 'DEPARTEMENT' | 'COMMUNE' | 'AUTRE';

/** `POST /programme/localites`. */
export interface CreateLocaliteBody {
  provinceCode: string;
  name: string;
  kind?: LocaliteKind;
  chefLieu?: string;
}

/** `PATCH /programme/localites/:id` (code and province never change). */
export interface UpdateLocaliteBody {
  name?: string;
  kind?: LocaliteKind;
  chefLieu?: string;
  active?: boolean;
}

/** `PUT /programme/provinces/:code/geometry` answer. */
export interface SetGeometryResult {
  code: string;
  hasGeometry: true;
}

// ---------------------------------------------------------------------------
// Audit journal: `/audit/*`
// ---------------------------------------------------------------------------

export type AuditAction = 'WRITE' | 'READ_SENSITIVE' | 'EXPORT' | 'LOGIN' | 'LOGIN_FAILED' | 'SYSTEM';

export interface AuditPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** Level 1: one action (`AuditEvent`). `id` is a bigint, served as text. */
export interface AuditEvent {
  id: string;
  occurredAt: string;
  requestId: string | null;
  action: AuditAction;
  actorUserId: string | null;
  /** Author's name (null: system, not signed in or unknown account). */
  actorName?: string | null;
  actorRole: string | null;
  farmId: string | null;
  method: string;
  /** Route template, never the raw URL. */
  route: string;
  params: Record<string, string> | null;
  statusCode: number | null;
  ip: string | null;
  userAgent: string | null;
  offlineOpId: string | null;
  summary: Record<string, unknown> | null;
  errorMessage: string | null;
}

/** Level 2: a row before / after (`AuditRowChange`). */
export interface AuditRowChange {
  /** Author's name (null: system or unknown account). */
  actorName?: string | null;
  id: string;
  at: string;
  requestId: string | null;
  actorUserId: string | null;
  txid: string;
  tableName: string;
  rowId: string | null;
  /** I (insert), U (update), D (delete). */
  op: 'I' | 'U' | 'D' | string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/** `GET /audit/seals` row. */
export interface AuditSeal {
  day: string;
  eventsCount: number;
  rowChangesCount: number;
  hash: string;
  prevHash: string | null;
  sealedAt?: string;
}

export type SealMismatchReason = 'HASH' | 'COUNT' | 'CHAIN' | 'GAP' | 'UNSEALED_BEFORE_FIRST_SEAL';

/** `POST /audit/seals/verify` answer. */
export interface SealVerification {
  ok: boolean;
  checkedDays: number;
  firstDay: string | null;
  lastDay: string | null;
  mismatch: {
    day: string;
    reason: SealMismatchReason;
    message: string;
    expected?: unknown;
    actual?: unknown;
  } | null;
}

// ---------------------------------------------------------------------------
// Data recovery: `/programme/imports/*`
// ---------------------------------------------------------------------------

export type ImportJobType = 'AMI' | 'BANDES_HISTORIQUES' | 'OUTIL_TRANSITOIRE';
export type ImportJobStatus = 'DEPOSE' | 'ANALYSE' | 'CONTROLE' | 'ESSAI' | 'VALIDE' | 'INTEGRE' | 'REJETE';
export type ImportRowStatus = 'VALIDE' | 'AVERTISSEMENT' | 'ERREUR' | 'EXCLUE';
export type ImportRowOutcome = 'INTEGREE' | 'ENRICHIE' | 'DEJA_PRESENTE' | 'REJETEE' | 'EXCLUE';
export type ImportJobStep = 'SETTINGS' | 'CORRECT' | 'DRY_RUN' | 'VALIDATE' | 'INTEGRATE' | 'REJECT';
export type ImportPipeline = 'FARMS' | 'BANDS';

export interface ImportField {
  key: string;
  header: string;
  label: string;
  required: boolean;
}

/** `GET /programme/imports/templates` row. */
export interface ImportTemplate {
  type: ImportJobType;
  label: string;
  description: string;
  pipeline: ImportPipeline;
  fileName: string;
  fields: ImportField[];
}

export interface ImportJobCounts {
  read: number;
  valid: number;
  warnings: number;
  errors: number;
  excluded: number;
  corrected: number;
  integrated: number;
  enriched: number;
  alreadyPresent: number;
  rejected: number;
}

export interface ImportPerson {
  id: string;
  fullName: string | null;
}

/** `GET /programme/imports` row. */
export interface ImportJobSummary {
  id: string;
  type: ImportJobType;
  typeLabel: string;
  status: ImportJobStatus;
  fileName: string;
  note: string | null;
  counts: ImportJobCounts;
  createdBy: ImportPerson | null;
  createdAt: string;
  integratedAt: string | null;
}

/** `GET /programme/imports/:id` (also the answer of every step). */
export interface ImportJob extends ImportJobSummary {
  pipeline: ImportPipeline;
  fileSize: number;
  fileSha256: string;
  encoding: string;
  delimiter: string;
  headers: string[];
  /** File header → field key (null: ignored). */
  columnMapping: Record<string, string | null>;
  unknownColumns: string[];
  mappingError: string | null;
  options: { confirmDuplicate: boolean };
  allowedSteps: ImportJobStep[];
  analysedAt: string | null;
  controlledAt: string | null;
  dryRunAt: string | null;
  dryRunBy: ImportPerson | null;
  validatedAt: string | null;
  validatedBy: ImportPerson | null;
  validationComment: string | null;
  integratedBy: ImportPerson | null;
  rejectedAt: string | null;
  rejectedBy: ImportPerson | null;
  rejectionReason: string | null;
  fields: ImportField[];
  /** « déjà intégré » and similar notices. */
  warnings: string[];
}

export interface ImportRowCorrection {
  at: string;
  byId: string;
  reason: string;
  changes: { field: string; before: string | null; after: string | null }[];
  excluded?: boolean;
}

/** A staging line (`GET …/:id/rows`). */
export interface ImportRow {
  id: string;
  line: number;
  raw: Record<string, string>;
  values: Record<string, string>;
  status: ImportRowStatus;
  excluded: boolean;
  errors: string[];
  warnings: string[];
  details: Record<string, unknown> | null;
  plannedOutcome: ImportRowOutcome | null;
  groupKey: string | null;
  sourceKey: string | null;
  dryRunOutcome: ImportRowOutcome | null;
  dryRunMessage: string | null;
  dryRunCode: string | null;
  outcome: ImportRowOutcome | null;
  outcomeMessage: string | null;
  targetId: string | null;
  targetCode: string | null;
  corrections: ImportRowCorrection[];
}

export interface ImportRowsPage {
  total: number;
  page: number;
  pageSize: number;
  items: ImportRow[];
}

/** `PATCH …/:id/rows/:line` answer. */
export interface CorrectRowResult {
  job: ImportJob;
  row: ImportRow;
}

export interface RecoveryReportLine {
  line: number;
  label: string;
  sourceKey: string | null;
  status: ImportRowStatus;
  outcome: ImportRowOutcome | null;
  code: string | null;
  message: string | null;
}

/** `GET …/:id/report`. */
export interface RecoveryReport {
  phase: 'CONTROLE' | 'ESSAI' | 'REPRISE';
  title: string;
  job: {
    id: string;
    type: ImportJobType;
    typeLabel: string;
    status: ImportJobStatus;
    statusLabel: string;
    fileName: string;
    fileSize: number;
    fileSha256: string;
    note: string | null;
    createdAt: string;
    createdBy: string | null;
    dryRunAt: string | null;
    dryRunBy: string | null;
    validatedAt: string | null;
    validatedBy: string | null;
    validationComment: string | null;
    integratedAt: string | null;
    integratedBy: string | null;
    rejectedAt: string | null;
    rejectedBy: string | null;
    rejectionReason: string | null;
  };
  counts: ImportJobCounts;
  rejected: RecoveryReportLine[];
  corrections: { line: number; at: string; by: string; reason: string; changes: string[] }[];
  targets: { code: string; outcome: ImportRowOutcome; label: string; lines: number }[];
  lines: RecoveryReportLine[];
  fingerprint: string;
  generatedAt: string;
}
