// Band exits (CDC 9). Pure rules mirroring backend bandes/sorties.service.ts.
import type { RefItem, SortiePayload } from '@/api/poufa';

/** Extra permission a MOTIF_SORTIE family needs on top of `saisie:creer`. */
export const SORTIE_FAMILY_PERMISSION: Partial<Record<string, string>> = {
  VENTE: 'vente:creer',
  ABATTOIR: 'production:abattage',
};

/** Reasons the account may use: active, with a family, and its family's right. */
export function allowedSortieReasons(items: readonly RefItem[], has: (code: string) => boolean): RefItem[] {
  return items
    .filter((i) => i.active && i.family)
    .filter((i) => {
      const needed = SORTIE_FAMILY_PERMISSION[i.family ?? ''];
      return !needed || has(needed);
    })
    .slice()
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'fr'));
}

export interface SortieDraft {
  sortieDate: string;
  count: string;
  weightKg: string;
  reasonCode: string;
  recipientName: string;
  recipientPhone: string;
  operatorId: string | null;
  unitPriceFcfa: string;
  priceUnit: 'TETE' | 'KG';
  notes: string;
}

export function emptySortieDraft(today: string): SortieDraft {
  return {
    sortieDate: today,
    count: '',
    weightKg: '',
    reasonCode: '',
    recipientName: '',
    recipientPhone: '',
    operatorId: null,
    unitPriceFcfa: '',
    priceUnit: 'TETE',
    notes: '',
  };
}

function parseDecimal(text: string): number | null {
  const t = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  return Number(t);
}

function parseInteger(text: string): number | null {
  const t = text.trim().replace(/\s/g, '');
  if (!t) return null;
  if (!/^\d+$/.test(t)) return NaN;
  return Number(t);
}

function addDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** Same wording as the server (CDC 9: every sortie names its recipient). */
export const SORTIE_RECIPIENT_REQUIRED = 'Le destinataire est obligatoire : un nom ou un opérateur du registre.';

/** Shown for a VENTE motif (F4: the same birds are never counted twice). */
export const SORTIE_SALE_WARNING = 'Cette sortie crée la vente : ne la ressaisissez pas en caisse.';

/** First French refusal of a sortie, or null (same checks as the server). */
export function sortieRefusal(
  draft: SortieDraft,
  ctx: { family: string | null; alive: number; integrationDate: string; today: string; closed: boolean },
): string | null {
  if (ctx.closed) return 'Bande clôturée : lecture seule, aucune sortie possible.';
  if (!draft.reasonCode || !ctx.family) return 'Choisissez le motif de la sortie.';
  const count = parseInteger(draft.count);
  if (count == null || Number.isNaN(count) || count < 1) return 'Le nombre de sujets doit être un entier, au moins 1.';
  if (count > ctx.alive) return `Sortie impossible : ${count} sujet(s) pour ${ctx.alive} présent(s).`;
  const day = draft.sortieDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'Date de sortie invalide.';
  if (day > addDay(ctx.today)) return 'La date de la sortie ne peut pas être dans le futur.';
  if (day < ctx.integrationDate.slice(0, 10)) {
    return `La sortie ne peut pas précéder l'ouverture de la bande (${ctx.integrationDate.slice(0, 10)}).`;
  }
  const weight = parseDecimal(draft.weightKg);
  if (weight != null && (Number.isNaN(weight) || weight <= 0)) return 'Le poids doit être un nombre positif (kg).';
  if (!draft.recipientName.trim() && !draft.operatorId) return SORTIE_RECIPIENT_REQUIRED;
  if (ctx.family === 'VENTE') {
    const price = parseInteger(draft.unitPriceFcfa);
    if (price == null || Number.isNaN(price)) return 'Une sortie pour vente demande un prix unitaire (FCFA, entier).';
    if (draft.priceUnit === 'KG' && weight == null) return 'Un prix au kg demande le poids des sujets sortis.';
  }
  return null;
}

/** POST body; call only once `sortieRefusal` is null. The engine adds the key. */
export function buildSortiePayload(draft: SortieDraft, family: string): SortiePayload {
  const weight = parseDecimal(draft.weightKg);
  const payload: SortiePayload = {
    sortieDate: draft.sortieDate.slice(0, 10),
    count: Number(draft.count.trim()),
    reasonCode: draft.reasonCode,
  };
  if (weight != null && !Number.isNaN(weight)) payload.weightKg = weight;
  if (draft.recipientName.trim()) payload.recipientName = draft.recipientName.trim();
  if (draft.recipientPhone.trim()) payload.recipientPhone = draft.recipientPhone.trim();
  if (draft.operatorId) payload.operatorId = draft.operatorId;
  if (draft.notes.trim()) payload.notes = draft.notes.trim();
  if (family === 'VENTE') {
    payload.unitPriceFcfa = Number(draft.unitPriceFcfa.trim());
    payload.priceUnit = draft.priceUnit;
  }
  return payload;
}

/** What a reason's family does, shown under the picker. */
export function sortieFamilyHint(family: string | null): string {
  switch (family) {
    case 'VENTE':
      return 'Une vente est enregistrée avec la sortie, au prix indiqué.';
    case 'ABATTOIR':
      return 'Un ordre d’abattage (brouillon) est créé et les sujets quittent la bande dès la sortie.';
    case 'REFORME':
    case 'AUTRE':
      return 'Les sujets sont retirés de la bande immédiatement.';
    default:
      return '';
  }
}
