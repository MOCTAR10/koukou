import type { AccountNature } from './entities/account.entity.js';

export interface AccountSeed {
  code: string;
  label: string;
  classe: number;
  nature: AccountNature;
}

/**
 * Plan comptable SYSCOHADA de base (abrégé, adapté à l'aviculture).
 * Classe 1 Capitaux · 2 Immobilisations · 3 Stocks · 4 Tiers ·
 * 5 Trésorerie · 6 Charges · 7 Produits · 8 Hors bilan.
 * Les comptes réellement employés par le moteur d'écritures sont marqués
 * « USED » ; les autres offrent le contexte standard pour bilan/résultat.
 * Naturellement extensible par compte local (ferme).
 */
export const ACCOUNT_PLAN: AccountSeed[] = [
  // ---- Classe 1 : capitaux & dettes financières ----
  { code: '10', label: 'Capital', classe: 1, nature: 'CAPITAUX' },
  { code: '101', label: 'Capital social', classe: 1, nature: 'CAPITAUX' },
  { code: '104', label: 'Compte de l’exploitant', classe: 1, nature: 'CAPITAUX' },
  { code: '108', label: 'Apports & prélèvements de l’exploitant', classe: 1, nature: 'CAPITAUX' },
  { code: '106', label: 'Réserves', classe: 1, nature: 'CAPITAUX' },
  { code: '12', label: 'Résultat net de l’exercice', classe: 1, nature: 'CAPITAUX' },
  { code: '129', label: 'Résultat net de l’exercice (transit de clôture)', classe: 1, nature: 'CAPITAUX' },
  { code: '13', label: 'Report à nouveau', classe: 1, nature: 'CAPITAUX' },
  { code: '16', label: 'Emprunts et dettes assimilées', classe: 1, nature: 'PASSIF' },
  { code: '164', label: 'Emprunts auprès des organismes financiers', classe: 1, nature: 'PASSIF' },

  // ---- Classe 2 : immobilisations ----
  { code: '20', label: 'Charges immobilisées', classe: 2, nature: 'ACTIF' },
  { code: '21', label: 'Immobilisations incorporelles', classe: 2, nature: 'ACTIF' },
  { code: '22', label: 'Terrains', classe: 2, nature: 'ACTIF' },
  { code: '23', label: 'Bâtiments, installations et aménagements', classe: 2, nature: 'ACTIF' },
  { code: '231', label: 'Bâtiments d’élevage', classe: 2, nature: 'ACTIF' },
  { code: '24', label: 'Matériel', classe: 2, nature: 'ACTIF' },
  { code: '241', label: 'Matériel et outillage d’élevage', classe: 2, nature: 'ACTIF' },
  { code: '25', label: 'Autres immobilisations corporelles', classe: 2, nature: 'ACTIF' },
  { code: '26', label: 'Immobilisations financières', classe: 2, nature: 'ACTIF' },
  { code: '28', label: 'Amortissements des immobilisations', classe: 2, nature: 'ACTIF' },
  { code: '281', label: 'Amortissements bâtiments', classe: 2, nature: 'ACTIF' },
  { code: '282', label: 'Amortissements matériel', classe: 2, nature: 'ACTIF' },

  // ---- Classe 3 : stocks ----
  { code: '30', label: 'Stocks de marchandises', classe: 3, nature: 'ACTIF' },
  { code: '31', label: 'Matières premières', classe: 3, nature: 'ACTIF' },
  { code: '311', label: 'Provende et aliments', classe: 3, nature: 'ACTIF' },
  { code: '32', label: 'Autres approvisionnements', classe: 3, nature: 'ACTIF' },
  { code: '35', label: 'Produits finis', classe: 3, nature: 'ACTIF' },
  { code: '352', label: 'Œufs en stock', classe: 3, nature: 'ACTIF' },
  { code: '36', label: 'Produits en cours (animaux vivants)', classe: 3, nature: 'ACTIF' },
  { code: '39', label: 'Dépréciations des stocks', classe: 3, nature: 'ACTIF' },

  // ---- Classe 4 : tiers ----
  { code: '40', label: 'Fournisseurs et comptes rattachés', classe: 4, nature: 'PASSIF' },
  { code: '401', label: 'Fournisseurs — achats à crédit', classe: 4, nature: 'PASSIF' },
  { code: '409', label: 'Fournisseurs débiteurs, avances versées', classe: 4, nature: 'ACTIF' },
  { code: '41', label: 'Clients et comptes rattachés', classe: 4, nature: 'ACTIF' },
  { code: '411', label: 'Clients — créances', classe: 4, nature: 'ACTIF' },
  { code: '416', label: 'Clients douteux', classe: 4, nature: 'ACTIF' },
  { code: '419', label: 'Clients créditeurs, avances et acomptes reçus', classe: 4, nature: 'PASSIF' },
  { code: '421', label: 'Personnel', classe: 4, nature: 'PASSIF' },
  { code: '431', label: 'Organismes de prévoyance sociale', classe: 4, nature: 'PASSIF' },
  { code: '441', label: 'État — TVA collectée', classe: 4, nature: 'PASSIF' },
  { code: '445', label: 'État — TVA récupérable', classe: 4, nature: 'ACTIF' },
  { code: '45', label: 'Autres comptes de tiers', classe: 4, nature: 'PASSIF' },
  { code: '471', label: 'Comptes d’attente', classe: 4, nature: 'PASSIF' },

  // ---- Classe 5 : trésorerie ----
  { code: '50', label: 'Titres de placement', classe: 5, nature: 'TRESORERIE' },
  { code: '52', label: 'Banques', classe: 5, nature: 'TRESORERIE' },
  { code: '53', label: 'Établissements financiers et assimilés', classe: 5, nature: 'TRESORERIE' },
  { code: '54', label: 'Instruments de trésorerie', classe: 5, nature: 'TRESORERIE' },
  { code: '57', label: 'Caisse', classe: 5, nature: 'TRESORERIE' },
  { code: '571', label: 'Caisse — espèces', classe: 5, nature: 'TRESORERIE' },
  { code: '581', label: 'Virements internes', classe: 5, nature: 'TRESORERIE' },

  // ---- Classe 6 : charges ----
  { code: '60', label: 'Achats', classe: 6, nature: 'CHARGE' },
  { code: '601', label: 'Achats de matières premières et fournitures liées', classe: 6, nature: 'CHARGE' },
  { code: '6010', label: 'Achats de volailles d’élevage', classe: 6, nature: 'CHARGE' },
  { code: '6011', label: 'Achats d’aliments pour animaux', classe: 6, nature: 'CHARGE' },
  { code: '6012', label: 'Achats de produits sanitaires et vétérinaires', classe: 6, nature: 'CHARGE' },
  { code: '6018', label: 'Achats de matières premières & fournitures (autres)', classe: 6, nature: 'CHARGE' },
  { code: '603', label: 'Variation de stocks de matières premières', classe: 6, nature: 'CHARGE' },
  { code: '604', label: 'Transports et déplacements', classe: 6, nature: 'CHARGE' },
  { code: '6061', label: 'Électricité, gaz et combustibles', classe: 6, nature: 'CHARGE' },
  { code: '62', label: 'Services extérieurs', classe: 6, nature: 'CHARGE' },
  { code: '624', label: 'Honoraires', classe: 6, nature: 'CHARGE' },
  { code: '63', label: 'Impôts, taxes et versements assimilés', classe: 6, nature: 'CHARGE' },
  { code: '64', label: 'Charges de personnel', classe: 6, nature: 'CHARGE' },
  { code: '641', label: 'Salaires et appointements', classe: 6, nature: 'CHARGE' },
  { code: '645', label: 'Charges sociales et prévoyance', classe: 6, nature: 'CHARGE' },
  { code: '65', label: 'Autres charges d’exploitation', classe: 6, nature: 'CHARGE' },
  { code: '66', label: 'Charges financières', classe: 6, nature: 'CHARGE' },
  { code: '67', label: 'Charges exceptionnelles et pénalités', classe: 6, nature: 'CHARGE' },
  { code: '658', label: 'Pertes et charges diverses', classe: 6, nature: 'CHARGE' },
  { code: '681', label: 'Dotations aux amortissements', classe: 6, nature: 'CHARGE' },
  { code: '691', label: 'Dotations aux provisions', classe: 6, nature: 'CHARGE' },

  // ---- Classe 7 : produits ----
  { code: '70', label: 'Ventes', classe: 7, nature: 'PRODUIT' },
  { code: '701', label: 'Ventes de produits de la ferme', classe: 7, nature: 'PRODUIT' },
  { code: '7011', label: 'Ventes de volailles et animaux', classe: 7, nature: 'PRODUIT' },
  { code: '7012', label: 'Ventes d’œufs', classe: 7, nature: 'PRODUIT' },
  { code: '7013', label: 'Ventes de provende', classe: 7, nature: 'PRODUIT' },
  { code: '7019', label: 'Ventes de produits divers', classe: 7, nature: 'PRODUIT' },
  { code: '702', label: 'Ventes de marchandises', classe: 7, nature: 'PRODUIT' },
  { code: '708', label: 'Ventes de services', classe: 7, nature: 'PRODUIT' },
  { code: '71', label: 'Production immobilisée', classe: 7, nature: 'PRODUIT' },
  { code: '75', label: 'Autres produits de gestion', classe: 7, nature: 'PRODUIT' },
  { code: '758', label: 'Produits et gains divers', classe: 7, nature: 'PRODUIT' },
  { code: '76', label: 'Produits financiers', classe: 7, nature: 'PRODUIT' },
  { code: '77', label: 'Produits exceptionnels', classe: 7, nature: 'PRODUIT' },
  { code: '781', label: 'Reprises sur amortissements et provisions', classe: 7, nature: 'PRODUIT' },
  { code: '791', label: 'Transferts de charges', classe: 7, nature: 'PRODUIT' },

  // ---- Classe 8 : engagements hors bilan (comptes de suivi) ----
  { code: '89', label: 'Engagements hors bilan', classe: 8, nature: 'ACTIF' },
];