import { UserRole } from '../../common/enums/role.enum.js';

/**
 * Treatment and vaccination register rules (CDC §5.2 n° 22-23), pure.
 *
 * - The product comes from the PRODUIT_TRAITEMENT list the veterinary services
 *   maintain (« liste des produits paramétrable »). Free text is accepted only
 *   while that list has no active item (initial setup not done yet).
 * - A treatment has a start (administration) and an optional end day; the
 *   withdrawal period then runs from the end day (`computeWithdrawalEndDate`).
 * - The animal count never exceeds the birds placed in the band.
 */

export interface ProductListItem {
  readonly code: string;
  readonly label: string;
}

export type ProductResolution =
  | { ok: true; productCode: string | null; productName: string }
  | { ok: false; error: string };

export const PRODUCT_LIST_NAME = 'PRODUIT_TRAITEMENT';

/** Maximum length of the product label kept on the record. */
const PRODUCT_NAME_MAX = 200;

/** `activeItems`: active items of PRODUIT_TRAITEMENT, in list order. */
export function resolveTreatmentProduct(
  input: { productCode?: string | null; productName?: string | null },
  activeItems: readonly ProductListItem[],
): ProductResolution {
  const code = input.productCode?.trim() ?? '';
  const name = input.productName?.trim() ?? '';
  if (activeItems.length > 0) {
    if (!code) {
      return {
        ok: false,
        error: `Choisissez le produit dans la liste des produits de traitement (${PRODUCT_LIST_NAME}) fixée par les services vétérinaires.`,
      };
    }
    const item = activeItems.find((i) => i.code === code);
    if (!item) {
      return {
        ok: false,
        error: `Produit « ${code} » inconnu ou désactivé dans la liste ${PRODUCT_LIST_NAME}.`,
      };
    }
    return { ok: true, productCode: item.code, productName: item.label };
  }
  if (code) {
    return {
      ok: false,
      error: `La liste des produits de traitement (${PRODUCT_LIST_NAME}) est vide : saisissez le nom du produit.`,
    };
  }
  if (!name) {
    return { ok: false, error: 'Le nom du produit est obligatoire.' };
  }
  if (name.length > PRODUCT_NAME_MAX) {
    return {
      ok: false,
      error: `Le nom du produit dépasse ${PRODUCT_NAME_MAX} caractères.`,
    };
  }
  return { ok: true, productCode: null, productName: name };
}

/** `startDay` and `endDay` are `YYYY-MM-DD` (UTC). */
export function treatmentPeriodError(
  startDay: string,
  endDay: string | null | undefined,
): string | null {
  if (!endDay) return null;
  if (endDay < startDay) {
    return 'La date de fin du traitement ne peut pas précéder sa date de début.';
  }
  return null;
}

/** Birds treated or vaccinated: at most the birds placed in the band. */
export function animalCountError(
  count: number | null | undefined,
  placed: number,
): string | null {
  if (count == null) return null;
  if (count > placed) {
    return `Le nombre d’animaux (${count}) dépasse l’effectif mis en place sur la bande (${placed}).`;
  }
  return null;
}

/**
 * CDC n° 22 « comparaison au calendrier de référence » and « calendrier
 * vaccinal paramétrable par les services vétérinaires »: a farm's own
 * vaccination programme is a veterinary decision. Only an institutional
 * account granted SANITAIRE:CREER in its matrix (the seeded VETERINAIRE
 * profile; checked by `ProgramAccessGuard`) creates one for a farm, so a care
 * is always late against a calendar the veterinary services set. Neither the
 * farm owner nor the platform admin creates one; the platform admin keeps the
 * shared programmes (`farmId` absent). À valider DGE / vétérinaires.
 */
export const FARM_PROTOCOL_MESSAGE =
  'Accès refusé : le programme de vaccination d’une ferme est fixé par les services vétérinaires (droit Sanitaire : Créer). Utilisez le calendrier de référence ou demandez-leur un programme adapté.';

/** Null when `role` may create a farm-specific programme, else the refusal. */
export function farmProtocolRefusal(role: string): string | null {
  return role === UserRole.INSTITUTION ? null : FARM_PROTOCOL_MESSAGE;
}
