import { isAfterTomorrow, isIsoDay, parseDecimal } from '../supply/deliveryRules';

/**
 * Band sorties (POUFA L3, CDC « Sorties d'animaux »), mirroring
 * `backend/src/modules/bandes/sorties.service.ts`: the reason's family drives
 * what the server books in the same transaction, sorties never exceed the
 * birds present, a VENTE needs a price (and the weight for a price per kg),
 * the recipient is required (a free name or an operator, CDC n° 9 and T3),
 * and an operator turns the sortie into a cession with a traceability sub-lot.
 */

/** Server message when neither a name nor an operator is given. */
export const RECIPIENT_REQUIRED = 'Le destinataire est obligatoire : un nom ou un opérateur du registre.';

/** Shown on a VENTE motif: the sale is booked with the sortie. */
export const SALE_ALREADY_BOOKED = 'Cette sortie crée la vente : ne la ressaisissez pas en caisse.';

export type SortieFamily = 'VENTE' | 'ABATTOIR' | 'REFORME' | 'AUTRE';

/** Permission a family needs on top of `saisie:creer` (server `FAMILY_PERMISSION`). */
export const FAMILY_PERMISSION: Partial<Record<string, string>> = {
  VENTE: 'vente:creer',
  ABATTOIR: 'production:abattage',
};

export interface ReasonItem {
  code: string;
  label: string;
  family: string | null;
  active: boolean;
}

export interface ReasonChoice extends ReasonItem {
  allowed: boolean;
  /** French reason it is greyed out. */
  why: string | null;
}

/** MOTIF_SORTIE items with whether this account may use them. */
export function reasonChoices(items: readonly ReasonItem[], hasPermission: (...codes: string[]) => boolean): ReasonChoice[] {
  return items
    .filter((i) => i.active && !!i.family)
    .map((i) => {
      const needed = FAMILY_PERMISSION[i.family ?? ''];
      const allowed = !needed || hasPermission(needed);
      return { ...i, allowed, why: allowed ? null : `Permission manquante pour ce motif : ${needed}.` };
    });
}

/** What the server creates for a sortie of this family (French, shown under the form). */
export function sortieEffect(family: string | null | undefined, withOperator: boolean): string[] {
  const lines: string[] = [];
  switch (family) {
    case 'VENTE':
      lines.push(
        `${SALE_ALREADY_BOOKED} Elle est enregistrée (à crédit) dans les ventes de la ferme, dans la même opération ; encaissez-la ensuite depuis Clients ou Ventes.`,
      );
      break;
    case 'ABATTOIR':
      lines.push(
        "Les sujets quittent l'effectif de la bande dès l'enregistrement de la sortie. Un ordre d'abattage brouillon est créé (écran Abattage) pour suivre l'envoi et le traitement ; ne créez pas un second ordre pour ces sujets. Annuler cet ordre remet les sujets dans la bande.",
      );
      break;
    case 'REFORME':
    case 'AUTRE':
      lines.push("Les sujets quittent l'effectif de la bande dès l'enregistrement.");
      break;
    default:
      break;
  }
  if (withOperator) {
    lines.push("Destinataire opérateur du programme : la sortie devient une cession et crée un sous-lot de traçabilité avec son QR code.");
  }
  return lines;
}

export interface SortieDraft {
  sortieDate: string;
  count: string;
  weightKg: string;
  reasonCode: string;
  recipientName: string;
  recipientPhone: string;
  operatorId: string;
  unitPriceFcfa: string;
  priceUnit: 'TETE' | 'KG';
  slaughterType: 'ABATTU' | 'VIVANT';
  destination: 'EXTERNE' | 'INTERNE';
  notes: string;
}

export function emptySortie(today: string): SortieDraft {
  return {
    sortieDate: today,
    count: '',
    weightKg: '',
    reasonCode: '',
    recipientName: '',
    recipientPhone: '',
    operatorId: '',
    unitPriceFcfa: '',
    priceUnit: 'TETE',
    slaughterType: 'ABATTU',
    destination: 'EXTERNE',
    notes: '',
  };
}

export interface SortiePayload {
  sortieDate: string;
  count: number;
  reasonCode: string;
  weightKg?: number;
  recipientName?: string;
  recipientPhone?: string;
  operatorId?: string;
  unitPriceFcfa?: number;
  priceUnit?: 'TETE' | 'KG';
  slaughterType?: 'ABATTU' | 'VIVANT';
  destination?: 'EXTERNE' | 'INTERNE';
  notes?: string;
  capturedAt?: string;
}

export interface SortieContext {
  reason: ReasonChoice | undefined;
  /** Live birds of the band (`quantityAlive`). */
  present: number;
  integrationDate: string;
  closed: boolean;
  todayUtc: string;
}

/** Errors (French) and the request body when there is none. */
export function validateSortie(draft: SortieDraft, ctx: SortieContext): { errors: string[]; payload: SortiePayload | null } {
  const errors: string[] = [];
  if (ctx.closed) errors.push('Bande clôturée : lecture seule, aucune sortie possible.');
  if (!draft.recipientName.trim() && !draft.operatorId) errors.push(RECIPIENT_REQUIRED);
  const family = ctx.reason?.family ?? null;
  if (!draft.reasonCode) errors.push('Choisissez le motif de la sortie.');
  else if (!ctx.reason) errors.push(`Motif de sortie inconnu ou inactif : ${draft.reasonCode}.`);
  else if (!ctx.reason.allowed) errors.push(ctx.reason.why ?? 'Motif non autorisé.');

  if (!draft.sortieDate || !isIsoDay(draft.sortieDate)) errors.push('Indiquez la date de la sortie.');
  else if (isAfterTomorrow(draft.sortieDate, ctx.todayUtc)) errors.push('La date de la sortie ne peut pas être dans le futur.');
  else if (draft.sortieDate < ctx.integrationDate.slice(0, 10)) {
    errors.push(`La sortie ne peut pas précéder l'ouverture de la bande (${ctx.integrationDate.slice(0, 10)}).`);
  }

  const count = parseDecimal(draft.count);
  if (count == null) errors.push('Indiquez le nombre de sujets sortis.');
  else if (Number.isNaN(count) || !Number.isInteger(count) || count < 1) errors.push('Le nombre de sujets est un entier, au moins 1.');
  else if (count > ctx.present) errors.push(`Sortie impossible : ${count} sujet(s) pour ${ctx.present} présent(s).`);

  const weight = parseDecimal(draft.weightKg);
  if (weight != null && (Number.isNaN(weight) || weight < 0.001)) errors.push('Le poids doit être positif.');

  const price = parseDecimal(draft.unitPriceFcfa);
  if (family === 'VENTE') {
    if (price == null) errors.push('Une sortie pour vente demande un prix unitaire.');
    else if (Number.isNaN(price) || !Number.isInteger(price) || price < 0) errors.push('Le prix est un entier positif (FCFA).');
    if (draft.priceUnit === 'KG' && weight == null) errors.push('Un prix au kg demande le poids des sujets sortis.');
  }

  if (errors.length > 0 || count == null || !ctx.reason) return { errors, payload: null };
  const payload: SortiePayload = { sortieDate: draft.sortieDate, count, reasonCode: ctx.reason.code };
  if (weight != null) payload.weightKg = weight;
  if (draft.recipientName.trim()) payload.recipientName = draft.recipientName.trim();
  if (draft.recipientPhone.trim()) payload.recipientPhone = draft.recipientPhone.trim();
  if (draft.operatorId) payload.operatorId = draft.operatorId;
  if (family === 'VENTE') {
    payload.unitPriceFcfa = price;
    payload.priceUnit = draft.priceUnit;
  }
  if (family === 'ABATTOIR') {
    payload.slaughterType = draft.slaughterType;
    payload.destination = draft.destination;
  }
  if (draft.notes.trim()) payload.notes = draft.notes.trim();
  return { errors, payload };
}

/** Status of what a sortie created, for its row (French). */
export function sortieOutcome(s: { reasonFamily: string; saleStatus: string | null; slaughterStatus: string | null; operatorId: string | null }): string {
  const parts: string[] = [];
  if (s.reasonFamily === 'VENTE') parts.push(`Vente ${SALE_STATUS_LABEL[s.saleStatus ?? ''] ?? (s.saleStatus ? s.saleStatus.toLowerCase() : 'enregistrée')}`);
  else if (s.reasonFamily === 'ABATTOIR') {
    parts.push(`Abattage ${SLAUGHTER_STATUS_LABEL[s.slaughterStatus ?? ''] ?? (s.slaughterStatus ? s.slaughterStatus.toLowerCase() : 'créé')}`);
  } else parts.push('Retrait de l’effectif');
  if (s.operatorId) parts.push('cession (sous-lot)');
  return parts.join(' · ');
}

const SALE_STATUS_LABEL: Record<string, string> = {
  SETTLED: 'réglée',
  OUTSTANDING: 'à encaisser',
  CANCELLED: 'annulée',
};

const SLAUGHTER_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'en brouillon',
  SENT: 'envoyé',
  PROCESSED: 'traité',
  CANCELLED: 'annulé',
};
