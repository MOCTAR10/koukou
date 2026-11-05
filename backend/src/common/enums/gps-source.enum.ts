/** How a programme farm's GPS point was obtained (`Farm.gpsSource`). */
export enum GpsSource {
  /** Captured on site by the phone at enrolment. */
  APPAREIL = 'APPAREIL',
  /** Typed or corrected by hand. */
  MANUEL = 'MANUEL',
  /** Taken from an imported list. */
  IMPORT = 'IMPORT',
}
