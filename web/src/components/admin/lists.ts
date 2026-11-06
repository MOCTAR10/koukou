import type { CreateListItemBody, ListItem, ProgramListType, UpdateListItemBody } from '../../api/types-admin';

/**
 * Programme lists screen, pure rules. Families mirror the backend
 * `programme/ref-list-families.ts` (they are code, not data: the server
 * refuses any other one); `code` and `family` never change after creation.
 */

export const LIST_TYPES: ReadonlyArray<{ type: ProgramListType; label: string; help: string }> = [
  { type: 'STATUT_FERME', label: 'Statuts des fermes', help: 'Statuts du registre ; la famille dit si la ferme est active ou suspendue.' },
  { type: 'COHORTE', label: 'Cohortes', help: 'Vagues d’entrée des fermes dans le programme.' },
  { type: 'INFRASTRUCTURE', label: 'Infrastructures', help: 'Types de bâtiments et d’équipements des fiches.' },
  { type: 'INTRANT', label: 'Intrants', help: 'Intrants livrés par le programme ; la famille règle le stock créé.' },
  { type: 'UNITE', label: 'Unités', help: 'Unités des livraisons et des stocks.' },
  { type: 'MOTIF_SORTIE', label: 'Motifs de sortie', help: 'Motifs des sorties de bande ; la famille déclenche vente, abattage ou retrait.' },
  { type: 'POSTE_CHARGE', label: 'Postes de charges', help: 'Postes des charges d’une bande.' },
  { type: 'TYPE_OPERATEUR', label: 'Types d’opérateurs', help: 'Types des opérateurs de la traçabilité.' },
  { type: 'SIGNE_CLINIQUE', label: 'Signes cliniques', help: 'Signes d’une déclaration sanitaire.' },
  { type: 'PRODUIT_TRAITEMENT', label: 'Produits de traitement', help: 'Produits vétérinaires des traitements.' },
  { type: 'STATUT_ALERTE', label: 'Statuts des alertes sanitaires', help: 'Circuit des alertes officielles.' },
];

export function listLabel(type: ProgramListType): string {
  return LIST_TYPES.find((l) => l.type === type)?.label ?? type;
}

/** `ref-list-families.ts` `PROGRAM_LIST_FAMILIES`: a family is required on each item of these lists. */
export const LIST_FAMILIES: Readonly<Partial<Record<ProgramListType, readonly string[]>>> = {
  STATUT_FERME: ['PREPARATION', 'OPERATIONNELLE', 'SUSPENDUE'],
  INTRANT: ['POUSSIN', 'ALIMENT', 'VACCIN', 'MEDICAMENT', 'AUTRE'],
  MOTIF_SORTIE: ['VENTE', 'ABATTOIR', 'REFORME', 'AUTRE'],
  TYPE_OPERATEUR: ['ABATTOIR', 'ACHETEUR', 'DISTRIBUTEUR', 'TRANSPORTEUR', 'AUTRE'],
  STATUT_ALERTE: ['NOUVELLE', 'EN_ANALYSE', 'CONFIRMEE', 'INFIRMEE', 'CLOSE'],
};

export const FAMILY_LABELS: Readonly<Record<string, string>> = {
  PREPARATION: 'En préparation',
  OPERATIONNELLE: 'Opérationnelle',
  SUSPENDUE: 'Suspendue (ferme désactivée)',
  POUSSIN: 'Poussins',
  ALIMENT: 'Aliment',
  VACCIN: 'Vaccin',
  MEDICAMENT: 'Médicament',
  AUTRE: 'Autre',
  VENTE: 'Vente (enregistre une vente)',
  ABATTOIR: 'Abattoir',
  REFORME: 'Réforme (retrait)',
  ACHETEUR: 'Acheteur',
  DISTRIBUTEUR: 'Distributeur',
  TRANSPORTEUR: 'Transporteur',
  NOUVELLE: 'Nouvelle',
  EN_ANALYSE: 'En analyse',
  CONFIRMEE: 'Confirmée',
  INFIRMEE: 'Infirmée',
  CLOSE: 'Close',
};

export function familiesOf(type: ProgramListType): readonly string[] | null {
  return LIST_FAMILIES[type] ?? null;
}

/**
 * Lists the veterinary services maintain from their surveillance screens
 * (`POST/PATCH /surveillance/lists/:listType`, SANITAIRE rights, with the
 * « last active status of a family » rule): read-only here.
 */
export const VET_LISTS: readonly ProgramListType[] = ['SIGNE_CLINIQUE', 'PRODUIT_TRAITEMENT', 'STATUT_ALERTE'];

export function isVetList(type: ProgramListType): boolean {
  return VET_LISTS.includes(type);
}

/** Same pattern as the DTO: 1 to 40 capitals, digits or `_`. */
export const CODE_PATTERN = /^[A-Z0-9_]{1,40}$/;

/** A code proposed from the label: accents dropped, capitals, `_` between words. */
export function codeFromLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/, '');
}

export interface NewItemDraft {
  code: string;
  label: string;
  family: string;
}

/** French errors of a new item, by field (empty: valid). */
export function newItemErrors(type: ProgramListType, draft: NewItemDraft, existing: readonly Pick<ListItem, 'code'>[]): Partial<Record<keyof NewItemDraft, string>> {
  const errors: Partial<Record<keyof NewItemDraft, string>> = {};
  const code = draft.code.trim();
  if (!CODE_PATTERN.test(code)) errors.code = 'Le code doit contenir de 1 à 40 caractères : majuscules, chiffres ou _.';
  else if (existing.some((i) => i.code === code)) errors.code = `Le code « ${code} » existe déjà dans cette liste.`;
  const label = draft.label.trim();
  if (!label) errors.label = 'Le libellé est obligatoire.';
  else if (label.length > 200) errors.label = 'Le libellé ne doit pas dépasser 200 caractères.';
  const families = familiesOf(type);
  if (families) {
    if (!draft.family) errors.family = `Famille obligatoire pour cette liste (${families.join(', ')}).`;
    else if (!families.includes(draft.family)) errors.family = `Famille « ${draft.family} » inconnue pour cette liste.`;
  }
  return errors;
}

export function createItemBody(type: ProgramListType, draft: NewItemDraft): CreateListItemBody {
  return {
    code: draft.code.trim(),
    label: draft.label.trim(),
    ...(familiesOf(type) && draft.family ? { family: draft.family } : {}),
  };
}

/** PATCH body of a relabel / reorder (null: nothing changed); code and family are never sent. */
export function updateItemBody(item: Pick<ListItem, 'label' | 'sort'>, draft: { label: string; sort: string }): UpdateListItemBody | { error: string } | null {
  const body: UpdateListItemBody = {};
  const label = draft.label.trim();
  if (!label) return { error: 'Le libellé ne peut pas être vide.' };
  if (label.length > 200) return { error: 'Le libellé ne doit pas dépasser 200 caractères.' };
  if (label !== item.label) body.label = label;
  const sortText = draft.sort.trim();
  if (sortText) {
    if (!/^\d+$/.test(sortText)) return { error: "L'ordre doit être un entier positif." };
    const sort = Number(sortText);
    if (sort !== item.sort) body.sort = sort;
  }
  return Object.keys(body).length ? body : null;
}

/** Active items first, then by `sort`, then label (the server's order for each group). */
export function sortItems<T extends Pick<ListItem, 'active' | 'sort' | 'label'>>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => Number(b.active) - Number(a.active) || a.sort - b.sort || a.label.localeCompare(b.label, 'fr'));
}
