import type { LotView, RearingItem, RearingKind, ScanIndicators, TraceLotStatus } from '../../api/types-trace';

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
  INTRANT: 'Intrants reçus',
  ALIMENT: 'Aliment consommé',
};

const SOURCE_LABEL: Record<string, string> = {
  ETAT_SMAG: 'État / SMAG',
  AUTRE: 'Autre fournisseur',
};

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function fr(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

/**
 * The detail line of an INTRANT (delivery confirmed for the band) or ALIMENT
 * (feed lot eaten from day X to day Y; its kg are the item quantity) rearing
 * item; null for the other kinds.
 */
export function rearingDetail(r: Pick<RearingItem, 'kind' | 'details'>): string | null {
  const d = r.details ?? {};
  if (r.kind === 'INTRANT') {
    const code = str(d.code);
    const source = str(d.source);
    const head = [code ? `Livraison ${code}` : 'Livraison', source ? (SOURCE_LABEL[source] ?? source) : null].filter(Boolean).join(' · ');
    const lines = Array.isArray(d.lines) ? (d.lines as Array<Record<string, unknown>>) : [];
    const parts = lines.map((l) => {
      const name = str(l.intrantLabel) ?? str(l.intrantCode) ?? 'Intrant';
      const unit = str(l.unitCode);
      const qty = typeof l.receivedQuantity === 'number' ? ` : ${fr(l.receivedQuantity)}${unit ? ` ${unit.toLowerCase()}` : ''}` : '';
      return `${name}${qty}`;
    });
    return parts.length > 0 ? `${head} — ${parts.join(', ')}` : head;
  }
  if (r.kind === 'ALIMENT') {
    const out: string[] = [];
    const lot = str(d.supplierLotNumber);
    if (lot) out.push(`Lot fournisseur ${lot}`);
    if (typeof d.fromDay === 'number' && typeof d.toDay === 'number') {
      out.push(d.fromDay === d.toDay ? `jour ${d.fromDay}` : `jours ${d.fromDay} à ${d.toDay}`);
    }
    return out.length > 0 ? out.join(' · ') : null;
  }
  if (r.kind === 'SOIN' || r.kind === 'TRAITEMENT') {
    const out: string[] = [];
    const reason = str(d.reason);
    if (reason) out.push(`Motif : ${reason}`);
    const start = str(d.startDate);
    const end = str(d.endDate);
    if (start) out.push(end && end !== start ? `du ${start} au ${end}` : `le ${start}`);
    if (typeof d.animalCount === 'number') out.push(`${fr(d.animalCount)} animaux`);
    return out.length > 0 ? out.join(' · ') : null;
  }
  return null;
}

/** The quantity of a rearing item with its unit when known (ALIMENT: kg). */
export function rearingQuantityLabel(r: Pick<RearingItem, 'kind' | 'quantity'>): string | null {
  if (r.quantity == null) return null;
  return r.kind === 'ALIMENT' ? `${fr(r.quantity)} kg` : fr(r.quantity);
}

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
