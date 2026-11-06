/**
 * State of a programme input delivery (`InputDelivery.status`, POUFA L4).
 * EXPEDIEE (recorded by the DGE or the platform admin, awaiting the farmer)
 * → CONFIRMEE (the farmer declared what he really received; the farm's input
 * lots exist) | ANNULEE (withdrawn before confirmation). Both are final.
 */
export enum InputDeliveryStatus {
  EXPEDIEE = 'EXPEDIEE',
  CONFIRMEE = 'CONFIRMEE',
  ANNULEE = 'ANNULEE',
}

/** Who supplies a delivery: the State (SMAG) or another supplier. */
export enum InputDeliverySource {
  ETAT_SMAG = 'ETAT_SMAG',
  AUTRE = 'AUTRE',
}
