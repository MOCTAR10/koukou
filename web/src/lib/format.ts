export function fcfa(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}

export function fcfaShort(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')} M FCFA`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)} k FCFA`;
  return `${n} FCFA`;
}

export function num(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function dateFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function dateTimeFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: digits })} %`;
}

export function bgClassForLevel(level: string): string {
  switch (level) {
    case 'ROUGE':
      return 'bg-red-50 text-red-700 ring-red-200';
    case 'JAUNE':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    case 'VERT':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    default:
      return 'bg-slate-100 text-slate-600 ring-slate-200';
  }
}

export function dotClassForLevel(level: string): string {
  switch (level) {
    case 'ROUGE':
      return 'bg-red-500';
    case 'JAUNE':
      return 'bg-amber-400';
    default:
      return 'bg-emerald-500';
  }
}

export const STATUS_LABEL: Record<string, string> = {
  ACTIF: 'Actif',
  EN_VENTE: 'En vente',
  CLOTURE: 'Clôturé',
  SETTLED: 'Soldée',
  OUTSTANDING: 'À recouvrer',
  CANCELLED: 'Annulée',
  ACTIVE: 'Active',
  RESOLUE: 'Résolue',
  ACQUITTEE: 'Acquittée',
  OPEN: 'Ouverte',
  CLOSED: 'Clôturée',
  DRAFT: 'Brouillon',
  SENT: 'Envoyé',
  PROCESSED: 'Traitée',
  CHAIR: 'Chair',
  PONDEUSE: 'Pondeuse',
  VIVANT: 'Vivant',
  ABATTU: 'Abattu',
  INTERNE: 'Interne',
  EXTERNE: 'Externe',
  PLANIFIE: 'Planifié',
  EN_RETARD: 'En retard',
  FAIT: 'Fait',
  ANNULE: 'Annulé',
  CONFIRMED: 'Confirmé',
  PENDING: 'En attente',
  REFUNDED: 'Remboursé',
  IN: 'Entrée',
  OUT: 'Sortie',
  EXPENSE: 'Dépense',
  CASH: 'Espèces',
  MOBILE_MONEY: 'Mobile Money',
  QR_CODE: 'QR Code',
  PROPRIETAIRE: 'Propriétaire',
  ELEVEUR: 'Éleveur',
  ACHETEUR: 'Client du Marché',
  INSTITUTION: 'Institution du programme',
  OPERATEUR: 'Opérateur',
  PLATFORM_ADMIN: 'Admin plateforme',
  active: 'Active',
  inactive: 'Inactive',
};

export function statusLabel(s: string | null | undefined): string {
  return s ? (STATUS_LABEL[s] ?? s) : '—';
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}