export const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  PARTICULIER: 'Particulier',
  RESTAURANT: 'Restaurant',
  HOTEL: 'Hôtel',
  EVENEMENT: 'Événement',
  TRAITEUR: 'Traiteur',
  COMMERCE: 'Commerce',
  REVENDEUR: 'Revendeur',
  GROSSISTE: 'Grossiste',
  BOULANGERIE: 'Boulangerie',
  COLLECTIVITE: 'Collectivité',
  ENTREPRISE: 'Entreprise',
  ELEVEUR: 'Éleveur',
  ONG: 'ONG',
  TRANSFORMATEUR: 'Transformateur',
};

/** Same display order as the mobile app. */
export const CUSTOMER_TYPES = [
  'RESTAURANT',
  'HOTEL',
  'TRAITEUR',
  'EVENEMENT',
  'COMMERCE',
  'REVENDEUR',
  'BOULANGERIE',
  'COLLECTIVITE',
  'ENTREPRISE',
  'ONG',
  'GROSSISTE',
  'TRANSFORMATEUR',
  'ELEVEUR',
  'PARTICULIER',
];

export function customerTypeLabel(type: string | null | undefined): string {
  return type ? (CUSTOMER_TYPE_LABEL[type] ?? 'Autre') : 'Particulier';
}

export const SEGMENT_LABEL: Record<string, string> = {
  NOUVEAU: 'Nouveau',
  REGULIER: 'Régulier',
  TOP: 'Top client',
};

export const LEVEL_LABEL: Record<string, string> = {
  ROUGE: 'Rouge',
  JAUNE: 'Jaune',
  VERT: 'Info',
};

const KIND_LABEL: Record<string, string> = {
  EAU: 'Eau',
  ALIMENT: 'Alimentation',
  MORTALITE: 'Mortalité',
  SURDENSITE: 'Surdensité',
  DENSITE: 'Densité',
  DENSITE_BATIMENT: 'Densité bâtiment',
  COHABITATION: 'Cohabitation',
  VIDE_SANITAIRE: 'Vide sanitaire',
  IPE: 'IPE',
  GMQ: 'GMQ',
  PEREMPTION: 'Péremption',
  TRACABILITE: 'Traçabilité',
  VENTE: 'Vente',
  DELAI_ATTENTE: 'Délai d’attente',
  PROPHYLAXIE: 'Prophylaxie',
  RENTABILITE: 'Rentabilité',
  TACHE: 'Tâche',
  SAISIE_MANQUEE: 'Saisie manquée',
  STOCK_OEUF: 'Stock d’œufs',
  HEAT: 'Stress thermique',
  MALADIE: 'Maladie',
  SAISIE: 'Saisie',
  SOIN: 'Soin',
  STOCK_PROVENDE: 'Provende',
  ALERTE: 'Alerte',
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? 'Autre';
}

export const MOVEMENT_SOURCE_LABEL: Record<string, string> = {
  SALE_PAYMENT: 'Vente',
  MANUAL: 'Manuel',
  REFUND: 'Remboursement',
  EXPENSE: 'Dépense',
};

const UNIT_LABEL: Record<string, string> = {
  PIECE: 'pièce(s)',
  KG: 'kg',
  ALVEOLES: 'alvéole(s)',
  SAC: 'sac(s)',
  UNITE: 'unité(s)',
};

export function unitLabel(unit: string | null | undefined): string {
  return unit ? (UNIT_LABEL[unit] ?? '') : '';
}

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  POULET_PIECE: 'Sur pied (pièce)',
  POULET_KG: 'Sur pied (kg)',
  ABATTU_PIECE: 'Abattu (pièce)',
  ABATTU_KG: 'Abattu (kg)',
  OEUFS: 'Œufs (alvéole)',
  PROVENDE: 'Provende',
  RECOLTE: 'Récolte',
  AUTRE: 'Autre',
};

export function productTypeLabel(type: string): string {
  return PRODUCT_TYPE_LABEL[type] ?? 'Article';
}

export const HEALTH_LABEL: Record<string, string> = {
  EXCELLENT: 'Excellente',
  BON: 'Bonne',
  MOYEN: 'Moyenne',
  CRITIQUE: 'Critique',
};
