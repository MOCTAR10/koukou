/** Programme layer (POUFA): lists and registry shapes shared by the screens. */

/** An item of a programme list (`GET /programme/lists/:listType`). */
export interface RefItem {
  id: string;
  listType: string;
  code: string;
  label: string;
  /** What the code reacts to (STATUT_FERME: PREPARATION, OPERATIONNELLE, SUSPENDUE). */
  family: string | null;
  parentId: string | null;
  sort: number;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Farm registry (W2): `/programme/farms/*`, `/programme/provinces`
// ---------------------------------------------------------------------------

/** A localité of `GET /programme/provinces`. */
export interface LocaliteView {
  id: string;
  provinceId: string;
  code: string;
  name: string;
  kind: string;
  chefLieu: string | null;
  active: boolean;
  sort: number;
}

/** `GET /programme/provinces` (no boundaries). */
export interface ProvinceView {
  id: string;
  /** `G1` … `G9`. */
  code: string;
  name: string;
  chefLieu: string | null;
  sort: number;
  /** A boundary is loaded: the GPS ↔ province check can run. */
  hasGeometry: boolean;
  localites: LocaliteView[];
}

export interface RegistryPlace {
  id: string;
  code: string;
  name: string;
}

export interface RegistryStatus {
  code: string;
  label: string;
  family: string | null;
  since: string | null;
}

/** A row of `GET /programme/farms`. */
export interface RegistryFarmRow {
  id: string;
  code: string | null;
  name: string;
  province: RegistryPlace | null;
  localite: RegistryPlace | null;
  cohort: { code: string; label: string } | null;
  status: RegistryStatus | null;
  exploitantName: string | null;
  exploitantPhone: string | null;
  amiRef: string | null;
  capacityPlaces: number | null;
  hasOwnerAccount: boolean;
  active: boolean;
  gpsProvinceWarning: string | null;
  createdAt: string;
}

export interface RegistryFarmPage {
  total: number;
  page: number;
  pageSize: number;
  items: RegistryFarmRow[];
}

export interface RegistryInfrastructure {
  code: string;
  label: string;
  count: number;
  surfaceM2: number | null;
}

export interface RegistryGps {
  latitude: number;
  longitude: number;
  capturedAt: string | null;
  source: 'APPAREIL' | 'MANUEL' | 'IMPORT' | null;
  accuracyM: number | null;
  provinceWarning: string | null;
}

/** `GET /programme/farms/:farmId` (also the answer of every sheet write). */
export interface RegistrySheet {
  id: string;
  code: string | null;
  programId: string;
  name: string;
  administrativeCity: string;
  province: RegistryPlace | null;
  localite: RegistryPlace | null;
  amiRef: string | null;
  cohort: { code: string; label: string } | null;
  exploitant: { name: string | null; phone: string | null };
  owner: { id: string; fullName: string; phone: string } | null;
  hasOwnerAccount: boolean;
  capacityPlaces: number | null;
  occupation: { chicksPlaced: number; capacityPlaces: number | null; ratePct: number | null };
  gps: RegistryGps | null;
  status: RegistryStatus | null;
  active: boolean;
  isVerified: boolean;
  infrastructures: RegistryInfrastructure[];
  /** Set when the farm was recorded despite probable duplicates. */
  duplicateOverride: { confirmedAt: string; confirmedById: string | null; candidateCodes: string[] } | null;
  createdAt: string;
  updatedAt: string;
}

export interface GpsFixBody {
  latitude: number;
  longitude: number;
  capturedAt?: string;
  source?: 'APPAREIL' | 'MANUEL';
  accuracyM?: number;
}

/** `PUT /programme/farms/:farmId/gps`. */
export interface SetGpsBody extends GpsFixBody {
  reason?: string;
  /** POUFA lot A droits: unique per farm; a replay adds no second history row. */
  idempotencyKey?: string;
}

export interface SetGpsResult {
  gps: RegistryGps | null;
  previous: { latitude: number; longitude: number; capturedAt: string | null; source: string | null } | null;
  /** The point is outside the farm's province: a warning, the fix is stored. */
  provinceWarning: string | null;
  /** POUFA lot A droits: false when the fix was older than the current point (kept) or a replay; `message` says why. Older servers omit both. */
  applied?: boolean;
  message?: string | null;
}

/** POUFA lot A droits: `PUT /programme/farms/:farmId/verification` (REGISTRE:VALIDER), answers the sheet. */
export interface SetVerificationBody {
  verified: boolean;
  reason?: string;
}

interface RegistryAuthor {
  id: string;
  fullName: string;
}

export interface GpsHistoryRow {
  id: string;
  latitude: number;
  longitude: number;
  capturedAt: string;
  source: string;
  accuracyM: number | null;
  provinceWarning: string | null;
  reason: string | null;
  createdBy: RegistryAuthor | null;
  createdAt: string;
}

export interface StatusHistoryRow {
  id: string;
  statusCode: string;
  statusLabel: string;
  statusFamily: string;
  cohort: string | null;
  from: string;
  reason: string | null;
  createdBy: RegistryAuthor | null;
  createdAt: string;
}

export interface InfrastructureLineBody {
  code: string;
  count: number;
  surfaceM2?: number;
}

/** Sheet fields shared by `POST` and `PATCH /programme/farms`. */
export interface RegistrySheetFields {
  localiteId?: string | null;
  exploitantName?: string | null;
  exploitantPhone?: string | null;
  amiRef?: string | null;
  cohort?: string | null;
  capacityPlaces?: number | null;
}

export interface CreateRegistryFarmBody extends RegistrySheetFields {
  name: string;
  provinceCode: string;
  statusCode?: string;
  gps?: GpsFixBody;
  infrastructures?: InfrastructureLineBody[];
  confirmDuplicate?: boolean;
}

export interface UpdateRegistryFarmBody extends RegistrySheetFields {
  name?: string;
  provinceCode?: string;
  confirmDuplicate?: boolean;
}

/** A probable duplicate the caller may see. */
export interface DuplicateCandidate {
  farmId: string | null;
  code: string | null;
  name: string;
  /** Province of the candidate (null when it has none). */
  provinceCode: string | null;
  provinceName: string | null;
  score: number;
  reasons: string[];
  /** Import only: the line of the file that resembles. */
  line?: number;
}

/** A probable duplicate out of an institution's scope: neither code nor name. */
export interface HiddenDuplicate {
  hidden: true;
  score: number;
  reasons: string[];
}

/** 409 body of a creation, a rename or a sheet change that looks like another farm. */
export interface DuplicateConflictBody {
  message: string;
  duplicates: Array<DuplicateCandidate | HiddenDuplicate>;
}

/** `POST /programme/farms/:farmId/activate-owner`. */
export interface ActivateOwnerResult {
  farm: { id: string; code: string | null; name: string };
  owner: { id: string; fullName: string; phone: string };
  linkedExistingAccount: boolean;
  /** Shown once; null when an existing account was linked. */
  loginCode: string | null;
}

/** 409 body of an owner activation. */
export interface ActivateOwnerConflictBody {
  message: string;
  /** A PROPRIETAIRE holds this phone: offer to link the farm to it. */
  existingAccount: true;
  /** A Market buyer holds this phone: another number is needed on the sheet. */
  buyerAccount: true;
}

/**
 * `POST /programme/farms/:farmId/owner-login-code` (platform admin, or
 * ADMINISTRATION:ADMINISTRER with every farm of that owner in scope).
 */
export interface OwnerLoginCodeResult {
  farm: { id: string; code: string | null; name: string };
  owner: { id: string; fullName: string; phone: string };
  /** Shown once. */
  loginCode: string;
}

/** 409 body of a new owner code: the farm has no owner account yet. */
export interface OwnerLoginCodeConflictBody {
  message: string;
  noOwnerAccount: true;
}

export type ImportOutcome = 'CREEE' | 'A_CREER' | 'DEJA_PRESENTE' | 'REJETEE';

export interface ImportLine {
  line: number;
  name: string | null;
  outcome: ImportOutcome;
  farmId?: string | null;
  code?: string | null;
  reason?: string;
  duplicates?: DuplicateCandidate[];
}

/** `POST /programme/farms/import`. */
export interface ImportReport {
  dryRun: boolean;
  format: 'LISTE_POUFA' | 'COMPLET';
  read: number;
  /** Created, or in a dry run, that would be created. */
  created: number;
  matched: number;
  rejected: number;
  unknownColumns: string[];
  lines: ImportLine[];
}

/** `POST /programme/farms/:farmId/status`. */
export interface SetFarmStatusBody {
  statusCode: string;
  /** Effective date (default now; never future nor before the current status). */
  from?: string;
  /** Mandatory for a suspension. */
  reason?: string;
}

/** `GET /programme/farms/:farmId/team` (F13): one team account created by the exploitant. */
export interface TeamMemberRow {
  employmentId: string;
  userId: string;
  fullName: string;
  phone: string | null;
  /** FarmStaffRole: ADMIN (administrateur de ferme) or ELEVEUR (membre). */
  role: 'ADMIN' | 'ELEVEUR';
  permissions: string[] | null;
  /** Access to this farm (suspension is per farm). */
  linkActive: boolean;
  accountActive: boolean;
  createdAt: string;
}
