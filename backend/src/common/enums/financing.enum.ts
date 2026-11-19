/** Steps of a financing file, in order (financer workspace, BCEG). */
export enum FinancingStep {
  DEMANDE = 'DEMANDE',
  INSTRUCTION = 'INSTRUCTION',
  DECISION = 'DECISION',
  DECAISSEMENT = 'DECAISSEMENT',
  SUIVI = 'SUIVI',
  CLOTURE = 'CLOTURE',
}

export enum FinancingDecision {
  ACCORDE = 'ACCORDE',
  REFUSE = 'REFUSE',
  AJOURNE = 'AJOURNE',
}

/** Manual claim flag set by the bank (the other classes are computed). */
export enum ClaimFlag {
  SENSIBLE = 'SENSIBLE',
  RESTRUCTURE = 'RESTRUCTURE',
  IRRECOUVRABLE = 'IRRECOUVRABLE',
}

export enum FinancingPeriodicity {
  MENSUELLE = 'MENSUELLE',
  TRIMESTRIELLE = 'TRIMESTRIELLE',
  SEMESTRIELLE = 'SEMESTRIELLE',
  PAR_BANDE = 'PAR_BANDE',
}

export enum DisbursementStatus {
  PREVUE = 'PREVUE',
  DEBLOQUEE = 'DEBLOQUEE',
  ANNULEE = 'ANNULEE',
}

export enum RepaymentMethod {
  VIREMENT = 'VIREMENT',
  MOBILE_MONEY = 'MOBILE_MONEY',
  ESPECES = 'ESPECES',
  CHEQUE = 'CHEQUE',
  PRELEVEMENT = 'PRELEVEMENT',
}

export enum FinancingDocumentStatus {
  DEPOSE = 'DEPOSE',
  VALIDE = 'VALIDE',
  REJETE = 'REJETE',
}

export enum ConsentRecordStatus {
  ACTIVE = 'ACTIVE',
  WITHDRAWN = 'WITHDRAWN',
}

export enum ConsentMethod {
  EN_LIGNE = 'EN_LIGNE',
  PAPIER = 'PAPIER',
}

/** Who must supply a checklist document. */
export enum DocumentProvider {
  EXPLOITANT = 'EXPLOITANT',
  BCEG = 'BCEG',
}

/** Who filed a document: the farmer, the bank, a technical agent for the farmer, or Fermia (generated). */
export enum DocumentSource {
  EXPLOITANT = 'EXPLOITANT',
  BCEG = 'BCEG',
  AGENT = 'AGENT',
  FERMIA = 'FERMIA',
}

/** Accepted format families of a checklist document. */
export type DocumentFormat = 'PDF' | 'IMAGE';
