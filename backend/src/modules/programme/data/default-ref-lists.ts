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

/** Conduct the law imposes for a disease « réputée contagieuse » (loi n° 2/65, art. 2). */
const NOTIFIABLE_CONDUCT =
  'Déclarer sans délai aux services vétérinaires et à la préfecture ou sous-préfecture, isoler les animaux malades ou morts, ne déplacer ni vendre aucun animal du troupeau.';

function notifiable(code: string, label: string, legalName: string): SeedRefItem {
  return {
    code,
    label,
    family: 'DECLARATION_OBLIGATOIRE',
    meta: { legalRef: 'LOI_2_65', legalName, conduct: NOTIFIABLE_CONDUCT },
  };
}

function disease(code: string, label: string): SeedRefItem {
  return { code, label, family: 'AUTRE' };
}

function legalText(
  code: string,
  label: string,
  date: string,
  articles: string,
  summary: string,
  url?: string,
): SeedRefItem {
  return { code, label, meta: { date, articles, summary, ...(url ? { url } : {}) } };
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
  [ProgramListType.MALADIE]: [
    // Poultry diseases « réputées contagieuses » by loi n° 2/65 art. 1er
    // (`legalName` = the wording of the law). Fermia proposal for the
    // veterinary services to validate and complete.
    notifiable('INFLUENZA_AVIAIRE', 'Influenza aviaire (grippe aviaire)', 'peste chez les animaux de basse-cour'),
    notifiable('NEWCASTLE', 'Maladie de Newcastle', 'pseudo-peste chez les animaux de basse-cour'),
    notifiable('TYPHOSE', 'Typhose aviaire', 'typhose chez les animaux de basse-cour'),
    notifiable('PULLOROSE', 'Pullorose', 'pullorose chez les animaux de basse-cour'),
    notifiable('VARIOLE_AVIAIRE', 'Variole aviaire', 'variole chez les animaux de basse-cour'),
    notifiable('TUBERCULOSE_AVIAIRE', 'Tuberculose aviaire', 'tuberculose aviaire'),
    notifiable('PSITTACOSE', 'Psittacose (ornithose)', "psittacose chez toutes les espèces d'oiseaux"),
    disease('GUMBORO', 'Maladie de Gumboro (bursite infectieuse)'),
    disease('BRONCHITE_INFECTIEUSE', 'Bronchite infectieuse'),
    disease('MAREK', 'Maladie de Marek'),
    disease('COCCIDIOSE', 'Coccidiose'),
    disease('CORYZA', 'Coryza infectieux'),
    disease('COLIBACILLOSE', 'Colibacillose'),
    disease('MYCOPLASMOSE', 'Mycoplasmose (maladie respiratoire chronique)'),
  ],
  [ProgramListType.TEXTE_REFERENCE]: [
    legalText(
      'LOI_2_65',
      'Loi n° 2/65 du 5 juin 1965 organisant la police sanitaire en matière de maladies contagieuses du bétail',
      '1965-06-05',
      'Art. 1er à 4',
      'Liste des maladies réputées contagieuses. Déclaration immédiate à la préfecture ou sous-préfecture, isolement des animaux atteints, suspects ou morts ; périmètre infecté et vaccination obligatoire par arrêté ; sanctions en cas de non-déclaration.',
      'https://faolex.fao.org/docs/pdf/gab88398.pdf',
    ),
    legalText(
      'DECRET_0190_2022',
      "Décret n° 0190/PR/MAA du 5 août 2022 fixant les conditions d'implantation, de production, de contrôle sanitaire des élevages avicoles et de commercialisation de leurs produits",
      '2022-08-05',
      'Art. 4, 8, 17, 19, 20, 22, 25',
      "Agrément technique au-delà de 500 volailles par bande ; plan de prophylaxie sanitaire et médicale et registres obligatoires ; vétérinaire désigné par ferme ; aliments, additifs et médicaments autorisés seulement, délais d'attente ; document d'origine des volailles ; élimination des cadavres ; lutte contre les rongeurs.",
      'https://faolex.fao.org/docs/pdf/gab233301.pdf',
    ),
    legalText(
      'DECRET_0578_2015',
      "Décret n° 0578/PR/MAEAMOPG du 26 novembre 2015 fixant les conditions sanitaires et d'hygiène applicables aux établissements du secteur alimentaire et du secteur de l'alimentation animale",
      '2015-11-26',
      '',
      "Conditions sanitaires et d'hygiène des établissements d'alimentation animale (fabricants et distributeurs d'aliments).",
    ),
    legalText(
      'LOI_001_2021',
      'Loi n° 001/2021 du 8 septembre 2021 relative aux médicaments et produits vétérinaires en République Gabonaise',
      '2021-09-08',
      '',
      'Encadre la fabrication, la mise sur le marché, la distribution et l’usage des médicaments et produits vétérinaires, dont les vaccins.',
    ),
    legalText(
      'LOI_010_2021',
      "Loi n° 010/2021 fixant le cadre d'exercice de la profession de vétérinaire en République Gabonaise",
      '2021',
      '',
      'Conditions d’exercice de la médecine et de la pharmacie vétérinaires.',
    ),
  ],
};
