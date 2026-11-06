import type { LotView, RearingKind, ScanIndicators, TraceLotStatus } from '../../api/types-trace';

/** French labels and small pure helpers of the traceability screens. */

export const LOT_STATUS_LABEL: Record<TraceLotStatus, string> = {
  OUVERT: 'À la ferme',
  CEDE: 'Cédé',
  RECU: 'Reçu',
  CLOS: 'Clos',
};

export const LOT_KIND_LABEL: Record<string, string> = {
  LOT: 'Lot de la bande',
  SOUS_LOT: 'Sous-lot cédé',
  DERIVE: 'Produit dérivé',
};

export const EVENT_TYPE_LABEL: Record<string, string> = {
  CESSION: 'Cession',
  RECEPTION: 'Réception',
  TRANSFORMATION: 'Transformation',
  TRANSPORT: 'Transport',
  CONTROLE_DISTRIBUTEUR: 'Contrôle distributeur',
};

export const REARING_KIND_LABEL: Record<RearingKind, string> = {
  OUVERTURE: 'Ouverture',
  SOIN: 'Soin',
  TRAITEMENT: 'Traitement',
  MORTALITE: 'Mortalité',
  PESEE: 'Pesée',
  EVENEMENT_SANITAIRE: 'Événement sanitaire',
  SORTIE: 'Sortie',
  CLOTURE: 'Clôture',
};

export function lotStatusTone(status: TraceLotStatus): 'emerald' | 'brand' | 'slate' {
  if (status === 'OUVERT') return 'emerald';
  if (status === 'CEDE' || status === 'RECU') return 'brand';
  return 'slate';
}

/** Root lots first (newest band first, as served), each followed by its sub-lots. */
export function lotsTree(lots: readonly LotView[]): Array<{ lot: LotView; depth: 0 | 1 }> {
  const children = new Map<string, LotView[]>();
  for (const l of lots) {
    if (l.parentId) children.set(l.parentId, [...(children.get(l.parentId) ?? []), l]);
  }
  const ids = new Set(lots.map((l) => l.id));
  const out: Array<{ lot: LotView; depth: 0 | 1 }> = [];
  for (const l of lots) {
    if (l.parentId && ids.has(l.parentId)) continue;
    out.push({ lot: l, depth: 0 });
    for (const c of (children.get(l.id) ?? []).slice().sort((a, b) => a.code.localeCompare(b.code))) out.push({ lot: c, depth: 1 });
  }
  return out;
}

/** Scan warnings worth showing (French): forged codes, scans after closure. */
export function scanWarnings(s: ScanIndicators): string[] {
  const out: string[] = [];
  if (s.badSignature > 0) out.push(`${s.badSignature} scan${s.badSignature > 1 ? 's' : ''} avec une signature invalide (QR code altéré ou copié).`);
  if (s.afterClosure > 0) out.push(`${s.afterClosure} scan${s.afterClosure > 1 ? 's' : ''} après la clôture du lot.`);
  return out;
}

/** A lot code typed or read on a label: trimmed and upper-cased, like the server. */
export function normalizeLotCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** The lot code of a pasted QR address (`…/l/<code>?s=…`), or the text itself. */
export function codeFromInput(raw: string): string {
  const t = raw.trim();
  const m = /\/l\/([^/?#\s]+)/.exec(t);
  return normalizeLotCode(m ? decodeURIComponent(m[1] ?? '') : t);
}
