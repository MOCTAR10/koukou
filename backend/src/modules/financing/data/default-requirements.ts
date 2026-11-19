import { FinancingStep } from '../../../common/enums/financing.enum.js';

/**
 * Document checklist seeded for the bank (financer workspace): the bank edits
 * it afterwards (label, required, legal basis, deactivation). Seeded by the
 * migration FinancingModule for existing programmes and, for a fresh
 * database, by `FinancingService.ensureRequirements` (idempotent, by code,
 * never overwriting a row the bank edited).
 */
export interface DefaultRequirement {
  code: string;
  label: string;
  step: FinancingStep;
  required: boolean;
  legalBasis: string | null;
  /** Who supplies it (default BCEG). */
  providedBy?: 'EXPLOITANT' | 'BCEG';
  validityMonths?: number;
}

const S = FinancingStep;

export const DEFAULT_REQUIREMENTS: readonly DefaultRequirement[] = [
  { code: 'DEMANDE_FORMULAIRE', label: 'Formulaire de demande de financement', step: S.DEMANDE, required: true, legalBasis: null, providedBy: 'EXPLOITANT' },
  { code: 'DEMANDE_IDENTITE', label: 'Pièce d’identité du promoteur', step: S.DEMANDE, required: true, legalBasis: 'COBAC R-2023/01', providedBy: 'EXPLOITANT' },
  { code: 'DEMANDE_STATUTS', label: 'Statuts et pouvoirs du signataire (société ou coopérative)', step: S.DEMANDE, required: false, legalBasis: null, providedBy: 'EXPLOITANT' },
  { code: 'DEMANDE_IMMATRICULATION', label: 'Immatriculation RCCM ou NIF', step: S.DEMANDE, required: false, legalBasis: null, providedBy: 'EXPLOITANT' },
  { code: 'DEMANDE_PLAN_AFFAIRES', label: 'Plan d’affaires ou note de projet', step: S.DEMANDE, required: true, legalBasis: null, providedBy: 'EXPLOITANT' },
  { code: 'DEMANDE_CONSENTEMENT', label: 'Consentement au partage des données', step: S.DEMANDE, required: true, legalBasis: 'Loi n° 001/2011 modifiée, art. 72' },
  { code: 'INSTRUCTION_ETATS_FINANCIERS', label: 'États financiers ou état de trésorerie', step: S.INSTRUCTION, required: false, legalBasis: 'AUDCIF', providedBy: 'EXPLOITANT' },
  { code: 'INSTRUCTION_VISITE', label: 'Rapport de visite de terrain', step: S.INSTRUCTION, required: true, legalBasis: null },
  { code: 'INSTRUCTION_CAPACITE', label: 'Analyse de la capacité de remboursement', step: S.INSTRUCTION, required: true, legalBasis: null },
  { code: 'INSTRUCTION_GARANTIES', label: 'Garanties proposées', step: S.INSTRUCTION, required: false, legalBasis: null, providedBy: 'EXPLOITANT' },
  { code: 'DECISION_FICHE_COMITE', label: 'Fiche de décision du comité de crédit', step: S.DECISION, required: true, legalBasis: null },
  { code: 'DECISION_CONTRAT', label: 'Contrat de crédit signé', step: S.DECISION, required: true, legalBasis: null },
  { code: 'DECAISSEMENT_CAUTIONNEMENT', label: 'Acte de cautionnement signé', step: S.DECAISSEMENT, required: false, legalBasis: 'AUS OHADA, art. 13-14' },
  { code: 'DECAISSEMENT_GAGE', label: 'Acte de gage de matériel ou de stocks', step: S.DECAISSEMENT, required: false, legalBasis: 'AUS OHADA, art. 96 et 121' },
  { code: 'DECAISSEMENT_ASSURANCE', label: 'Attestation d’assurance', step: S.DECAISSEMENT, required: false, legalBasis: 'AUS OHADA, art. 121', providedBy: 'EXPLOITANT', validityMonths: 12 },
  { code: 'DECAISSEMENT_JUSTIFICATIF', label: 'Justificatif de la tranche', step: S.DECAISSEMENT, required: true, legalBasis: null },
  { code: 'SUIVI_CONTROLE_TERRAIN', label: 'Rapport de contrôle de terrain', step: S.SUIVI, required: false, legalBasis: null },
  { code: 'SUIVI_UTILISATION_FONDS', label: 'Justificatif d’utilisation des fonds', step: S.SUIVI, required: false, legalBasis: null, providedBy: 'EXPLOITANT' },
  { code: 'CLOTURE_ATTESTATION', label: 'Attestation de remboursement', step: S.CLOTURE, required: false, legalBasis: null },
  { code: 'CLOTURE_MAINLEVEE', label: 'Mainlevée des sûretés', step: S.CLOTURE, required: false, legalBasis: null },
];
