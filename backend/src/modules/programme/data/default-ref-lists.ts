import { ProgramListType } from '../../../common/enums/program-list-type.enum.js';

/**
 * Initial content of the configurable lists, seeded once per programme. The
 * authorized services then add, relabel, reorder and deactivate items; the
 * seed never overwrites an existing item. PRODUIT_TRAITEMENT starts empty:
 * the veterinary services fill it.
 */

export interface SeedRefItem {
  readonly code: string;
  readonly label: string;
  readonly family?: string;
  readonly meta?: Record<string, unknown>;
}

function bio(
  code: string,
  label: string,
  category: string,
  weight: number,
): SeedRefItem {
  return { code, label, meta: { weight, category } };
}

export const DEFAULT_REF_LISTS: Readonly<
  Record<ProgramListType, readonly SeedRefItem[]>
> = {
  [ProgramListType.STATUT_FERME]: [
    { code: 'EN_PREPARATION', label: 'En préparation', family: 'PREPARATION' },
    {
      code: 'OPERATIONNELLE',
      label: 'Opérationnelle',
      family: 'OPERATIONNELLE',
    },
    { code: 'SUSPENDUE', label: 'Suspendue', family: 'SUSPENDUE' },
  ],
  [ProgramListType.COHORTE]: [
    { code: 'COHORTE_1', label: 'Cohorte 1' },
    { code: 'COHORTE_2', label: 'Cohorte 2' },
  ],
  [ProgramListType.INFRASTRUCTURE]: [
    { code: 'BATIMENT_ELEVAGE', label: "Bâtiment d'élevage" },
    { code: 'MAGASIN_ALIMENT', label: "Magasin d'aliment" },
    { code: 'POINT_EAU', label: "Forage ou point d'eau" },
    { code: 'RESERVOIR_EAU', label: "Réservoir ou château d'eau" },
    { code: 'GROUPE_ELECTROGENE', label: 'Groupe électrogène' },
    { code: 'PANNEAUX_SOLAIRES', label: 'Panneaux solaires' },
    { code: 'PEDILUVE', label: 'Pédiluve' },
    { code: 'FOSSE_CADAVRES', label: 'Fosse à cadavres ou incinérateur' },
    { code: 'CLOTURE', label: 'Clôture' },
    { code: 'LOGEMENT_GARDIEN', label: 'Logement du gardien' },
  ],
  [ProgramListType.INTRANT]: [
    { code: 'POUSSINS', label: "Poussins d'un jour", family: 'POUSSIN' },
    {
      code: 'ALIMENT_DEMARRAGE',
      label: 'Aliment démarrage',
      family: 'ALIMENT',
    },
    {
      code: 'ALIMENT_CROISSANCE',
      label: 'Aliment croissance',
      family: 'ALIMENT',
    },
    { code: 'ALIMENT_FINITION', label: 'Aliment finition', family: 'ALIMENT' },
    { code: 'VACCIN', label: 'Vaccin', family: 'VACCIN' },
    { code: 'MEDICAMENT', label: 'Médicament', family: 'MEDICAMENT' },
    { code: 'DESINFECTANT', label: 'Désinfectant', family: 'AUTRE' },
    { code: 'LITIERE', label: 'Litière (copeaux)', family: 'AUTRE' },
  ],
  [ProgramListType.UNITE]: [
    { code: 'TETE', label: 'Tête', meta: { symbol: 'tête' } },
    { code: 'KG', label: 'Kilogramme', meta: { symbol: 'kg' } },
    { code: 'TONNE', label: 'Tonne', meta: { symbol: 't' } },
    { code: 'SAC', label: 'Sac', meta: { symbol: 'sac' } },
    { code: 'DOSE', label: 'Dose', meta: { symbol: 'dose' } },
    { code: 'FLACON', label: 'Flacon', meta: { symbol: 'flacon' } },
    { code: 'LITRE', label: 'Litre', meta: { symbol: 'L' } },
  ],
  [ProgramListType.MOTIF_SORTIE]: [
    { code: 'VENTE_VIF', label: 'Vente de poulets vifs', family: 'VENTE' },
    { code: 'ABATTOIR', label: "Envoi à l'abattoir", family: 'ABATTOIR' },
    { code: 'REFORME', label: 'Réforme', family: 'REFORME' },
    { code: 'AUTOCONSOMMATION', label: 'Autoconsommation', family: 'AUTRE' },
    { code: 'DON', label: 'Don', family: 'AUTRE' },
  ],
  [ProgramListType.POSTE_CHARGE]: [
    { code: 'POUSSINS', label: 'Poussins' },
    { code: 'ALIMENT', label: 'Aliment' },
    { code: 'VETERINAIRE', label: 'Frais vétérinaires' },
    { code: 'MAIN_OEUVRE', label: "Main-d'œuvre" },
    { code: 'ENERGIE', label: 'Énergie (électricité, carburant)' },
    { code: 'TRANSPORT', label: 'Transport' },
    { code: 'AUTRES', label: 'Autres charges' },
  ],
  [ProgramListType.PRODUIT_TRAITEMENT]: [],
  [ProgramListType.SIGNE_CLINIQUE]: [
    { code: 'MORTALITE_BRUTALE', label: 'Mortalité brutale' },
    { code: 'ABATTEMENT', label: 'Abattement, prostration' },
    {
      code: 'BAISSE_CONSOMMATION',
      label: "Baisse de consommation d'eau ou d'aliment",
    },
    { code: 'DIARRHEE', label: 'Diarrhée' },
    { code: 'DIARRHEE_SANGLANTE', label: 'Diarrhée sanglante' },
    {
      code: 'DETRESSE_RESPIRATOIRE',
      label: 'Détresse respiratoire (râles, toux, éternuements)',
    },
    {
      code: 'SIGNES_NERVEUX',
      label: 'Signes nerveux (torticolis, paralysie)',
    },
    {
      code: 'OEDEME_TETE',
      label: 'Œdème de la tête, crête ou barbillons cyanosés',
    },
    { code: 'BOITERIE', label: 'Boiterie' },
  ],
  [ProgramListType.TYPE_OPERATEUR]: [
    { code: 'ABATTOIR', label: 'Abattoir', family: 'ABATTOIR' },
    { code: 'ACHETEUR', label: 'Acheteur', family: 'ACHETEUR' },
    { code: 'DISTRIBUTEUR', label: 'Distributeur', family: 'DISTRIBUTEUR' },
    { code: 'TRANSPORTEUR', label: 'Transporteur', family: 'TRANSPORTEUR' },
  ],
  [ProgramListType.STATUT_ALERTE]: [
    { code: 'NOUVELLE', label: 'Nouvelle', family: 'NOUVELLE' },
    { code: 'EN_ANALYSE', label: 'En analyse', family: 'EN_ANALYSE' },
    { code: 'CONFIRMEE', label: 'Confirmée', family: 'CONFIRMEE' },
    { code: 'INFIRMEE', label: 'Infirmée', family: 'INFIRMEE' },
    { code: 'CLOSE', label: 'Close', family: 'CLOSE' },
  ],
  [ProgramListType.CRITERE_BIOSECURITE]: [
    // Default grid (CDC n° 27), Fermia proposal for the veterinary services to
    // validate: `meta.weight` 1-3 (3 = critical), `meta.category`.
    bio('CLOTURE_ENTREE', 'Clôture entretenue, entrée unique contrôlée', 'Accès', 2),
    bio('REGISTRE_VISITEURS', 'Registre des visiteurs tenu à jour', 'Accès', 1),
    bio('PEDILUVE', 'Pédiluve à l’entrée des bâtiments, renouvelé', 'Accès', 3),
    bio('TENUE_BOTTES', 'Tenue et bottes dédiées aux bâtiments', 'Accès', 2),
    bio('DESINFECTION_VEHICULES', 'Désinfection des véhicules à l’entrée', 'Accès', 2),
    bio('LAVAGE_MAINS', 'Point de lavage des mains avec savon', 'Hygiène', 1),
    bio('NETTOYAGE_BATIMENT', 'Bâtiment nettoyé et désinfecté entre les bandes', 'Hygiène', 3),
    bio('VIDE_SANITAIRE', 'Vide sanitaire respecté', 'Hygiène', 3),
    bio('LITIERE_SECHE', 'Litière sèche et propre', 'Hygiène', 2),
    bio('EAU_POTABLE', 'Eau d’abreuvement propre, abreuvoirs entretenus', 'Eau et aliment', 2),
    bio('STOCK_ALIMENT', 'Aliment stocké à l’abri (humidité, nuisibles)', 'Eau et aliment', 2),
    bio('LUTTE_NUISIBLES', 'Lutte contre rongeurs, insectes et oiseaux sauvages', 'Nuisibles', 2),
    bio('GESTION_CADAVRES', 'Cadavres retirés chaque jour, fosse ou incinérateur', 'Déchets', 3),
    bio('GESTION_FUMIER', 'Fumier et déchets évacués loin des bâtiments', 'Déchets', 1),
    bio('SEPARATION_BANDES', 'Une seule bande par bâtiment (tout plein, tout vide)', 'Conduite', 3),
  ],
};
