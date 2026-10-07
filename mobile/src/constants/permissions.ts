import type { PermissionCode } from '@/api/types';

/** Miroir d’affichage du catalogue serveur (GET /farms/:id/permissions est
 *  réservé à « equipe:gerer ») : étiquettes FR des permissions pour le profil. */
export const PERMISSION_GROUPS_LOCAL: { key: string; label: string; items: { code: PermissionCode; label: string }[] }[] = [
  {
    key: 'production',
    label: 'Production',
    items: [
      { code: 'saisie:creer', label: 'Saisie du jour' },
      { code: 'production:gerer', label: 'Lots & bâtiments' },
      { code: 'production:abattage', label: 'Ordres d’abattage' },
    ],
  },
  {
    key: 'équipe',
    label: 'Équipe',
    items: [
      { code: 'equipe:gerer', label: 'Gérer l’équipe' },
      { code: 'equipe:taches', label: 'Planifier les tâches' },
    ],
  },
  {
    key: 'caisse',
    label: 'Caisse',
    items: [
      { code: 'caisse:lire', label: 'Voir la caisse' },
      { code: 'caisse:ouvrir', label: 'Ouvrir la caisse' },
      { code: 'caisse:fermer', label: 'Clôturer la caisse' },
    ],
  },
  {
    key: 'ventes',
    label: 'Ventes',
    items: [
      { code: 'vente:creer', label: 'Vendre' },
      { code: 'vente:annuler', label: 'Annuler des ventes' },
      { code: 'vente:commande', label: 'Bons de commande' },
      { code: 'vente:promotion', label: 'Promotions' },
    ],
  },
  {
    key: 'compta',
    label: 'Comptabilité',
    items: [
      { code: 'compta:depense', label: 'Saisie des dépenses' },
      { code: 'compta:client', label: 'Fiches clients' },
      { code: 'compta:rapports', label: 'Rapports' },
      { code: 'compta:ecritures', label: 'Écritures comptables' },
    ],
  },
  {
    key: 'stock',
    label: 'Stock',
    items: [
      { code: 'stock:gerer', label: 'Gérer le stock' },
      { code: 'pdv:gerer', label: 'Points de vente & transferts' },
    ],
  },
  {
    key: 'sanitaire',
    label: 'Sanitaire',
    items: [
      { code: 'sanitaire:gerer', label: 'Protocoles & soins' },
      { code: 'sanitaire:lecture', label: 'Voir le sanitaire' },
    ],
  },
  {
    key: 'rh',
    label: 'Ressources humaines',
    items: [
      { code: 'rh:lire', label: 'Voir les dossiers employés' },
      { code: 'rh:gerer', label: 'Gérer les dossiers RH' },
    ],
  },
  {
    key: 'reglages',
    label: 'Réglages',
    items: [{ code: 'reglages:ferme', label: 'Paramètres de la ferme' }],
  },
];

/** Permissions de base d'un nouvel Administrateur KouKou (miroir serveur `ADMIN_DEFAULT_PERMISSIONS`). */
export const CREATE_ADMIN_DEFAULT_PERMISSIONS: string[] = [
  'saisie:creer',
  'caisse:lire',
  'sanitaire:lecture',
];

export function permissionLabel(code: PermissionCode | string): string {
  for (const group of PERMISSION_GROUPS_LOCAL) {
    const item = group.items.find((i) => i.code === code);
    if (item) return item.label;
  }
  return code;
}

export function groupPermissionCodes(codes: string[]) {
  return PERMISSION_GROUPS_LOCAL.map((group) => ({
    ...group,
    granted: group.items.filter((item) => codes.includes(item.code)),
  })).filter((group) => group.granted.length > 0);
}