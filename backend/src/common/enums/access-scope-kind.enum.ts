/** Scope of an access profile: which farms its members reach (POUFA plan §5.2). */
export enum AccessScopeKind {
  /** Every farm of the programme. */
  ALL = 'ALL',
  /** The programme farms of the membership's provinces. */
  PROVINCES = 'PROVINCES',
  /** The farms listed on the membership. */
  FARMS = 'FARMS',
  /** Farms financed by the member's bank with the farmer's active consent (BCEG). */
  FINANCED = 'FINANCED',
  /** Lots concerning an operator (slaughterhouse, distributor): later phase. */
  OPERATOR = 'OPERATOR',
  /** Aggregates only: no farm-level row (MAEDR). */
  AGGREGATE = 'AGGREGATE',
  /** The audit journal only (ANINF). */
  AUDIT = 'AUDIT',
}
