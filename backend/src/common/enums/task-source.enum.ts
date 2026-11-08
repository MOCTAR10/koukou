/**
 * Origin of a farm task. MANUELLE = created by hand; the others are generated
 * from a programme and carry `batchId` + `stepId` (idempotent per
 * batch + source + step).
 */
export enum TaskSource {
  MANUELLE = 'MANUELLE',
  /** Mirror of a planned care (`ProphylaxisEvent`); stepId = the care's id. */
  PROGRAMME_VACCIN = 'PROGRAMME_VACCIN',
  /** Weighing of the weighing plan; stepId = `J<age in days>`. */
  PESEE = 'PESEE',
  /** Cleaning / sanitary vacancy after the lot's closure; stepId = `VS`. */
  VIDE_SANITAIRE = 'VIDE_SANITAIRE',
}

/** Sources whose lateness is already alerted elsewhere (PROPHYLAXIE, WEIGHING_LATE). */
export const SOURCES_ALERTED_ELSEWHERE: readonly TaskSource[] = [
  TaskSource.PROGRAMME_VACCIN,
  TaskSource.PESEE,
];

/** Sources completed through `POST …/tasks/:id/complete` (they update the lot). */
export const SOURCES_COMPLETED_WITH_DATA: readonly TaskSource[] = [
  TaskSource.PROGRAMME_VACCIN,
  TaskSource.PESEE,
];
