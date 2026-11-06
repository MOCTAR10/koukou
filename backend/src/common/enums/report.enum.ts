/** How often a report template produces a run (CDC « Rapports périodiques »). */
export enum ReportPeriodicity {
  /** Monday → Sunday (UTC), produced once the week is over. */
  HEBDOMADAIRE = 'HEBDOMADAIRE',
  /** Calendar month (UTC), produced once the month is over. */
  MENSUEL = 'MENSUEL',
  /** Once per band, when it closes (frozen bilan). */
  FIN_DE_BANDE = 'FIN_DE_BANDE',
}

/** What one run of a template covers. */
export enum ReportLevel {
  /** The whole programme (one run per period). */
  NATIONAL = 'NATIONAL',
  /** One province (one run per province and period). */
  PROVINCE = 'PROVINCE',
  /** One band (one run per closed band). */
  BANDE = 'BANDE',
}

/** Sections a report template may hold, by level. */
export enum ReportSection {
  /** Key figures of the period (headcount, mortality, volumes, prices). */
  SYNTHESE = 'SYNTHESE',
  /** One line per province (national level). */
  PROVINCES = 'PROVINCES',
  /** Volumes produced and sold, average prices. */
  PRODUCTION = 'PRODUCTION',
  /** Farms by status and cohort. */
  FERMES = 'FERMES',
  /** Advisory alerts and published sanitary alerts. */
  ALERTES = 'ALERTES',
  /** Data-entry completeness. */
  COMPLETUDE = 'COMPLETUDE',
  /** Contribution to the 100 000 t objective and projection (national level). */
  OBJECTIF = 'OBJECTIF',
  /** Farms to follow up (high mortality, low completeness): farm rows. */
  FERMES_A_SUIVRE = 'FERMES_A_SUIVRE',
  /** Frozen bilan of the band (band level). */
  BILAN = 'BILAN',
  /** Band vs programme average at the same age week (band level). */
  COMPARAISON = 'COMPARAISON',
  /**
   * Inputs and resources of the period: deliveries, quantities, value,
   * subsidy, gaps over `SEUIL_ECART_INTRANTS_PCT` (POUFA lot A).
   */
  INTRANTS = 'INTRANTS',
}
