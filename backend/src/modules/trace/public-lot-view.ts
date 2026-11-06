import { BatchType } from '../../common/enums/batch-type.enum.js';
import { Species } from '../../common/enums/species.enum.js';
import {
  TraceLotKind,
  TraceLotStatus,
} from '../../common/enums/trace.enum.js';

/** Mandatory mention of the public page (CDC §6.2 and §8). */
export const PUBLIC_LOT_NOTICE =
  "Ce QR code indique l'origine du produit. Il ne constitue pas un certificat sanitaire.";

export const CONSOMMONS_GABONAIS_LABEL = 'Consommons Gabonais';

const SPECIES_LABELS: Record<Species, string> = {
  POULET: 'Poulet',
  DINDE: 'Dinde',
  PINTADE: 'Pintade',
  CAILLE: 'Caille',
  CANARD: 'Canard',
  OIE: 'Oie',
  FAISAN: 'Faisan',
  AUTRE: 'Autre',
};

const BATCH_TYPE_LABELS: Record<BatchType, string> = {
  CHAIR: 'Chair',
  PONDEUSE: 'Pondeuse',
};

/** Facts the public page may be built from (read by `QrScansService`). */
export interface PublicLotSource {
  code: string;
  kind: TraceLotKind;
  status: TraceLotStatus;
  quantity: number;
  cededOn: string | null;
  farmName: string;
  localiteName: string | null;
  provinceName: string | null;
  bandCode: string | null;
  species: Species;
  customSpecies: string | null;
  batchType: BatchType;
  integrationDate: string;
  closedAt: Date | null;
  operatorTypeLabel: string | null;
}

/**
 * Whitelist of what anyone with the QR code reads (like the Market public
 * catalogue): the producer (farm name, localité, province), the band dates,
 * the product, the « Consommons Gabonais » link and the mandatory mention.
 * Never a phone, a precise GPS point, a cost, a person's name nor an id.
 */
export function toPublicLotView(
  src: PublicLotSource,
  consommonsGabonaisUrl: string,
) {
  return {
    code: src.code,
    kind: src.kind,
    status: src.status,
    quantity: src.quantity,
    cededOn: src.cededOn,
    product: {
      species: src.species,
      speciesLabel:
        src.species === Species.AUTRE && src.customSpecies
          ? src.customSpecies
          : SPECIES_LABELS[src.species],
      type: src.batchType,
      typeLabel: BATCH_TYPE_LABELS[src.batchType],
    },
    producer: {
      farmName: src.farmName,
      localite: src.localiteName,
      province: src.provinceName,
    },
    band: {
      code: src.bandCode,
      openedOn: src.integrationDate.slice(0, 10),
      closedOn: src.closedAt ? src.closedAt.toISOString().slice(0, 10) : null,
    },
    /** Kind of operator the lot was ceded to (never its name or contact). */
    operatorType: src.operatorTypeLabel,
    consommonsGabonais: {
      label: CONSOMMONS_GABONAIS_LABEL,
      url: consommonsGabonaisUrl,
    },
    notice: PUBLIC_LOT_NOTICE,
  };
}

export type PublicLotView = ReturnType<typeof toPublicLotView>;
