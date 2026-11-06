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

/** `POST /programme/farms/:farmId/status`. */
export interface SetFarmStatusBody {
  statusCode: string;
  /** Effective date (default now; never future nor before the current status). */
  from?: string;
  /** Mandatory for a suspension. */
  reason?: string;
}
