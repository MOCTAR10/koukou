/**
 * Glossaire des indicateurs, en français, aligné sur le code du backend
 * (`batches/flock-performance.ts`, `metrics.service.ts`, `rentabilite.service.ts`,
 * `programme/poufa`). Même contenu côté mobile (`src/poufa/glossary.ts`).
 * Pur et testé : chaque indicateur affiché doit avoir une définition ici.
 */
export type GlossaryKey =
  | 'ic_officiel'
  | 'ic_technique'
  | 'gmq'
  | 'ipe'
  | 'mortalite'
  | 'viabilite'
  | 'taux_ponte'
  | 'autonomie_provende'
  | 'rendement_carcasse'
  | 'vide_sanitaire'
  | 'classe_biosecurite'
  | 'cout_kg_vendu'
  | 'cout_kg_produit';

export interface GlossaryEntry {
  /** Libellé affiché à l’écran. */
  term: string;
  /** Définition en une phrase. */
  definition: string;
  /** Formule en clair. */
  formula?: string;
  /** Précision d’unité ou de lecture. */
  note?: string;
}

export const IC_OFFICIEL_LABEL = 'IC officiel (bilan)';
export const IC_TECHNIQUE_LABEL = 'IC technique';
export const COST_PER_KG_SOLD_TERM = 'Coût par kg vendu';
export const COST_PER_KG_PRODUCED_TERM = 'Coût de production par kg produit (officiel)';

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  ic_officiel: {
    term: IC_OFFICIEL_LABEL,
    definition: 'Indice de consommation du bilan de bande, selon la formule du programme : combien de kg d’aliment pour produire 1 kg de poids vif.',
    formula: 'Aliment consommé (kg) ÷ poids vif produit (kg)',
    note: 'Plus il est bas, mieux c’est. C’est le chiffre de référence pour le jury et les rapports.',
  },
  ic_technique: {
    term: IC_TECHNIQUE_LABEL,
    definition: 'Indicateur de conduite calculé par Fermia à la dernière pesée, pour piloter le lot au quotidien.',
    formula: 'Aliment consommé jusqu’à la dernière pesée ÷ poids vif de tous les oiseaux nourris (présents, vendus, abattus, réformés et morts, au poids estimé)',
    note: 'Il compte la croissance des oiseaux morts : il peut différer de l’IC officiel (bilan).',
  },
  gmq: {
    term: 'GMQ (gain moyen quotidien)',
    definition: 'Vitesse de croissance moyenne d’un sujet, en grammes par jour.',
    formula: '(poids actuel − poids d’arrivée) ÷ âge, en g/j',
  },
  ipe: {
    term: 'IPE (indice de performance européen)',
    definition: 'Note globale d’un lot de chair qui combine viabilité, poids, rapidité de croissance et efficacité alimentaire.',
    formula: 'viabilité (%) × poids moyen (kg) ÷ (âge en jours × IC) × 100',
    note: 'Plus il est élevé, meilleur est le lot.',
  },
  mortalite: {
    term: 'Mortalité',
    definition: 'Part des sujets mis en place qui sont morts, à date.',
    formula: 'sujets morts ÷ sujets mis en place × 100',
    note: 'En pourcentage, une décimale.',
  },
  viabilite: {
    term: 'Viabilité',
    definition: 'Part des sujets mis en place qui sont encore en vie.',
    formula: '100 − mortalité (%)',
  },
  taux_ponte: {
    term: 'Taux de ponte',
    definition: 'Nombre d’œufs pondus rapporté aux poules présentes, jour après jour.',
    formula: 'œufs ramassés ÷ poules-jours × 100 (une poule présente un jour = une poule-jour)',
    note: 'Calculé par le serveur sur les poules-jours, pas sur l’effectif du jour. Une alvéole = 30 œufs.',
  },
  autonomie_provende: {
    term: 'Autonomie provende',
    definition: 'Nombre de jours pendant lesquels le stock d’aliment suffit au rythme de consommation actuel.',
    formula: 'stock disponible (kg) ÷ consommation moyenne par jour (kg)',
    note: 'Sur l’accueil, c’est la valeur la plus faible parmi les types d’aliment. Un sac fait 50 kg.',
  },
  rendement_carcasse: {
    term: 'Rendement carcasse',
    definition: 'Part du poids vif qui reste en carcasse après abattage.',
    formula: 'poids carcasse (kg) ÷ poids vif (kg) × 100',
  },
  vide_sanitaire: {
    term: 'Vide sanitaire',
    definition: 'Période où le bâtiment reste vide, nettoyé et désinfecté entre deux bandes.',
    note: 'Durée minimum fixée par les paramètres de l’administration ; une réinstallation trop tôt déclenche une alerte.',
  },
  classe_biosecurite: {
    term: 'Classe de biosécurité',
    definition: 'Classement A, B ou C de la ferme d’après le score de son dernier contrôle de biosécurité (A = meilleur).',
    note: 'Les seuils de score sont dans les paramètres. « Non contrôlée » signifie qu’aucun contrôle n’a eu lieu.',
  },
  cout_kg_vendu: {
    term: COST_PER_KG_SOLD_TERM,
    definition: 'Indicateur de conduite : toutes les charges du lot rapportées aux kilos réellement vendus au poids.',
    formula: 'charges du lot (FCFA) ÷ kg vendus',
    note: 'Indisponible (—) quand le lot est vendu à l’unité (pas de poids vendu).',
  },
  cout_kg_produit: {
    term: COST_PER_KG_PRODUCED_TERM,
    definition: 'Coût du bilan de bande, selon la formule du programme : charges rapportées au poids vif produit.',
    formula: 'charges (FCFA) ÷ poids vif produit (kg)',
    note: 'Peut différer du coût par kg vendu.',
  },
};

export const GLOSSARY_KEYS = Object.keys(GLOSSARY) as GlossaryKey[];

/** Libellé de la raison pour laquelle le coût de production officiel n’est pas calculable. */
const COST_PRODUCED_REASONS = {
  NO_WEIGHT_PRODUCED: 'Pas encore de poids vif produit (aucune pesée ni sortie).',
  NO_CHARGES: 'Aucune charge enregistrée sur ce lot.',
  RESTRICTED: 'Données économiques non accessibles avec votre profil.',
  NOT_COMPUTABLE: 'Bilan indisponible pour le moment.',
} as const;

/** Coût de production officiel du serveur : valeur affichable (ou « — ») et sa raison. */
export function costPerKgProducedView(
  costFcfa: number | null | undefined,
  reason: string | null | undefined,
): { value: number | null; note: string | null } {
  if (costFcfa != null) return { value: costFcfa, note: null };
  return { value: null, note: COST_PRODUCED_REASONS[reason as keyof typeof COST_PRODUCED_REASONS] ?? null };
}

/** Valeur du « coût par kg vendu » : « — » et la raison quand il n’est pas applicable. */
export function costPerKgSoldView(
  costPerKgFcfa: number | null | undefined,
  kgSold: number | null | undefined,
): { applicable: boolean; note: string | null } {
  const applicable = costPerKgFcfa != null && (kgSold ?? 0) > 0;
  return { applicable, note: applicable ? null : 'Non applicable : aucune vente au kilo (vente à l’unité).' };
}
