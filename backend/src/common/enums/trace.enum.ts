/** Traceability (POUFA L7, CDC §6): lots, their events and QR scans. */

/** What a traceability lot is. */
export enum TraceLotKind {
  /** Root lot of a band, created with it. */
  LOT = 'LOT',
  /** Part of a lot ceded to an operator (one per cession). */
  SOUS_LOT = 'SOUS_LOT',
  /** Product made from a lot (slaughter, packaging): later phase. */
  DERIVE = 'DERIVE',
}

/** Where a lot stands in the chain. */
export enum TraceLotStatus {
  /** At the farm (root lot of a band still open). */
  OUVERT = 'OUVERT',
  /** Ceded to an operator, not yet received. */
  CEDE = 'CEDE',
  /** Received by the operator (later phase). */
  RECU = 'RECU',
  /** Closed: its QR code is rejected. */
  CLOS = 'CLOS',
}

/** Events of a lot (architecture §11.1); only CESSION is written today. */
export enum LotEventType {
  CESSION = 'CESSION',
  RECEPTION = 'RECEPTION',
  TRANSFORMATION = 'TRANSFORMATION',
  TRANSPORT = 'TRANSPORT',
  CONTROLE_DISTRIBUTEUR = 'CONTROLE_DISTRIBUTEUR',
}

/** Outcome of a public QR scan (journaled in `qr_scans`). */
export enum QrScanResult {
  OK = 'OK',
  INCONNU = 'INCONNU',
  CLOS = 'CLOS',
  SIGNATURE_INVALIDE = 'SIGNATURE_INVALIDE',
}

/** Kinds of the rearing chronology of a lot (CDC « Historique d'élevage »). */
export enum RearingEventKind {
  OUVERTURE = 'OUVERTURE',
  SOIN = 'SOIN',
  TRAITEMENT = 'TRAITEMENT',
  MORTALITE = 'MORTALITE',
  PESEE = 'PESEE',
  EVENEMENT_SANITAIRE = 'EVENEMENT_SANITAIRE',
  SORTIE = 'SORTIE',
  CLOTURE = 'CLOTURE',
}
