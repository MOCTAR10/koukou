/**
 * Which band's history shows an input delivery (CDC §6.1 T2, POUFA lot A2
 * divers; audit v3: « une livraison sans bande s'affiche dans chaque bande
 * ouverte »). A delivery appears in **one band at most**:
 *
 * 1. linked to a band (`input_deliveries.band_id`, set at recording or by
 *    `PUT /farms/:farmId/input-deliveries/:id/band`) → that band;
 * 2. otherwise the farm's bands open on the reception day (placed on or
 *    before it, not closed before it):
 *    - exactly one → that band;
 *    - several → the one band whose daily entries drew feed from the
 *      delivery's stock lots, if exactly one of them did;
 * 3. otherwise (no band open that day, or still ambiguous) → no band: the
 *    delivery stays in the farm's delivery list only, until the farmer links
 *    it to a band.
 *
 * Rule documented in `backend/docs/poufa-historique-intrants.md`. Pure.
 */
export interface BandWindow {
  id: string;
  /** `YYYY-MM-DD`, the band's opening day. */
  integrationDate: string;
  /** `YYYY-MM-DD` of the closure, null while the band is open. */
  closedDay: string | null;
}

export interface DeliveryToAttribute {
  bandId: string | null;
  /** `YYYY-MM-DD`, reception (or confirmation) day. */
  receivedDate: string;
  /** Bands whose daily entries drew feed from this delivery's lots. */
  consumerBandIds: readonly string[];
}

export function openOn(band: BandWindow, day: string): boolean {
  return (
    band.integrationDate.slice(0, 10) <= day &&
    (band.closedDay == null || band.closedDay >= day)
  );
}

/** The band whose history shows the delivery, or null (farm list only). */
export function deliveryBand(
  delivery: DeliveryToAttribute,
  bands: readonly BandWindow[],
): string | null {
  if (delivery.bandId) return delivery.bandId;
  const open = bands.filter((b) => openOn(b, delivery.receivedDate));
  if (open.length === 1) return open[0].id;
  if (open.length === 0) return null;
  const openIds = new Set(open.map((b) => b.id));
  const consumers = [
    ...new Set(delivery.consumerBandIds.filter((id) => openIds.has(id))),
  ];
  return consumers.length === 1 ? consumers[0] : null;
}
