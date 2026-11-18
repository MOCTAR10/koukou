import { BatchType } from '../../../common/enums/batch-type.enum.js';
import { FeedPhase } from '../../../common/enums/feed-phase.enum.js';
import { ItineraryCategory } from '../../../common/enums/itinerary-category.enum.js';
import { Species } from '../../../common/enums/species.enum.js';

export interface DefaultItineraryStep {
  species: Species;
  productionType: BatchType;
  dayFrom: number;
  dayTo: number | null;
  feedPhase: FeedPhase | null;
  title: string;
  instructions: string;
  category: ItineraryCategory;
  legalRef: string | null;
  sort: number;
}

const DECREE = 'DECRET_0190_2022';

/**
 * Default technical itinerary (itinéraire technique) for chickens.
 *
 * FERMIA PROPOSAL, to be validated by the DGE and the veterinary services: no
 * Gabonese text sets rations or nutritional values, so there is no number
 * here beyond the feed phase age bounds (the ones the apps always used) and no
 * quantity. The practice steps are qualitative and cite décret n° 0190/PR/MAA
 * du 5 août 2022 where it applies (`legalRef` = code of a TEXTE_REFERENCE
 * item). Seeded only when the species/type has no step yet; after that the
 * DGE edits it through `POST/PATCH /programme/itinerary`.
 */
function practices(
  productionType: BatchType,
  firstSort: number,
): DefaultItineraryStep[] {
  const common = {
    species: Species.POULET,
    productionType,
    dayFrom: 0,
    dayTo: null,
    feedPhase: null,
  };
  return [
    {
      ...common,
      title: 'Retirer les morts chaque jour',
      instructions:
        'Retirer chaque jour les oiseaux morts, les compter dans la saisie du jour et les éliminer par incinération ou par un autre moyen autorisé (décret n° 0190/PR/MAA du 5 août 2022, art. 22).',
      category: ItineraryCategory.BIOSECURITE,
      legalRef: DECREE,
      sort: firstSort,
    },
    {
      ...common,
      title: 'Lutter contre les rongeurs',
      instructions:
        'Maintenir une lutte contre les rongeurs autour des bâtiments et du stock d’aliment (décret n° 0190/PR/MAA du 5 août 2022, art. 25).',
      category: ItineraryCategory.BIOSECURITE,
      legalRef: DECREE,
      sort: firstSort + 1,
    },
    {
      ...common,
      title: 'Tenir le registre d’élevage à jour',
      instructions:
        'Consigner dans le registre de la ferme les mouvements d’oiseaux, les mortalités, les traitements et les vaccinations, conformément au plan de prophylaxie (décret n° 0190/PR/MAA du 5 août 2022, art. 8).',
      category: ItineraryCategory.SANITAIRE,
      legalRef: DECREE,
      sort: firstSort + 2,
    },
    {
      ...common,
      title: 'Aliments et additifs autorisés uniquement',
      instructions:
        'N’utiliser que des aliments et additifs autorisés, issus de fournisseurs identifiés, et respecter les délais d’attente avant toute vente ou abattage (décret n° 0190/PR/MAA du 5 août 2022, art. 19).',
      category: ItineraryCategory.ALIMENTATION,
      legalRef: DECREE,
      sort: firstSort + 3,
    },
    {
      ...common,
      title: 'Peser régulièrement un échantillon',
      instructions:
        'Peser un échantillon d’oiseaux à la fréquence fixée par le programme (paramètre PESEE_FREQUENCE_J) et saisir le poids moyen pour suivre la croissance.',
      category: ItineraryCategory.PESEE,
      legalRef: null,
      sort: firstSort + 4,
    },
    {
      ...common,
      title: 'Eau propre chaque jour',
      instructions:
        'Distribuer de l’eau propre en permanence, nettoyer les abreuvoirs chaque jour et signaler toute baisse brutale de consommation, premier signe de maladie.',
      category: ItineraryCategory.ABREUVEMENT,
      legalRef: null,
      sort: firstSort + 5,
    },
    {
      ...common,
      title: 'Garder une litière sèche',
      instructions:
        'Maintenir la litière sèche et friable : retirer les zones humides autour des abreuvoirs et assurer la ventilation du bâtiment.',
      category: ItineraryCategory.AMBIANCE,
      legalRef: null,
      sort: firstSort + 6,
    },
  ];
}

function phase(
  productionType: BatchType,
  dayFrom: number,
  dayTo: number | null,
  feedPhase: FeedPhase,
  title: string,
  sort: number,
): DefaultItineraryStep {
  return {
    species: Species.POULET,
    productionType,
    dayFrom,
    dayTo,
    feedPhase,
    title,
    instructions:
      'Distribuer l’aliment de cette phase. Les quantités se déduisent de la souche (référentiel zootechnique) : valeur indicative, à valider par la DGE.',
    category: ItineraryCategory.ALIMENTATION,
    legalRef: null,
    sort,
  };
}

export const DEFAULT_ITINERARY: DefaultItineraryStep[] = [
  // Broilers: ≤10 d POUSSIN, ≤24 DEMARRAGE, ≤35 CROISSANCE, then FINITION.
  phase(BatchType.CHAIR, 0, 10, FeedPhase.POUSSIN, 'Aliment poussin', 10),
  phase(BatchType.CHAIR, 11, 24, FeedPhase.DEMARRAGE, 'Aliment démarrage', 20),
  phase(BatchType.CHAIR, 25, 35, FeedPhase.CROISSANCE, 'Aliment croissance', 30),
  phase(BatchType.CHAIR, 36, null, FeedPhase.FINITION, 'Aliment finition', 40),
  ...practices(BatchType.CHAIR, 100),
  // Layers (as in the apps): ≤10 d POUSSIN, ≤24 DEMARRAGE, ≤112 CROISSANCE,
  // ≤126 PRE_PONTE, then PONTE_PHASE_1.
  phase(BatchType.PONDEUSE, 0, 10, FeedPhase.POUSSIN, 'Aliment poussin', 10),
  phase(BatchType.PONDEUSE, 11, 24, FeedPhase.DEMARRAGE, 'Aliment démarrage', 20),
  phase(BatchType.PONDEUSE, 25, 112, FeedPhase.CROISSANCE, 'Aliment croissance', 30),
  phase(BatchType.PONDEUSE, 113, 126, FeedPhase.PRE_PONTE, 'Aliment pré-ponte', 40),
  phase(BatchType.PONDEUSE, 127, null, FeedPhase.PONTE_PHASE_1, 'Aliment ponte', 50),
  ...practices(BatchType.PONDEUSE, 100),
];
