import type { PermissionCode, PermissionGroup, StaffProfile } from '@/api/types';

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
    key: 'agriculture',
    label: 'Agriculture',
    items: [{ code: 'agri:gerer', label: 'Parcelles & cultures' }],
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

/** Repli hors-ligne : catalogue au format API, descriptions vides. */
export const LOCAL_PERMISSION_GROUPS: PermissionGroup[] = PERMISSION_GROUPS_LOCAL.map((g) => ({
  key: g.key,
  label: g.label,
  items: g.items.map((i) => ({ code: i.code, label: i.label, description: '' })),
}));

/** Repli hors-ligne des profils métier (miroir serveur `STAFF_PROFILES`).
 *  Les droits sont posés côté client puis envoyés explicitement à la création. */
export const STAFF_PROFILES_LOCAL: StaffProfile[] = [
  {
    key: 'gestionnaire',
    label: 'Gestionnaire',
    role: 'ADMIN',
    jobTitle: 'Gestionnaire',
    permissions: [
      'equipe:gerer',
      'equipe:taches',
      'rh:lire',
      'caisse:lire',
      'caisse:ouvrir',
      'caisse:fermer',
      'vente:creer',
      'vente:annuler',
      'vente:commande',
      'vente:promotion',
      'compta:depense',
      'compta:client',
      'compta:rapports',
      'compta:ecritures',
      'stock:gerer',
      'pdv:gerer',
      'saisie:creer',
      'production:gerer',
      'production:abattage',
      'sanitaire:lecture',
      'reglages:ferme',
    ],
  },
  {
    key: 'comptable',
    label: 'Comptable',
    role: 'ADMIN',
    jobTitle: 'Comptable',
    permissions: ['compta:depense', 'compta:client', 'compta:rapports', 'compta:ecritures', 'caisse:lire'],
  },
  {
    key: 'veterinaire',
    label: 'Vétérinaire',
    role: 'ADMIN',
    jobTitle: 'Vétérinaire',
    permissions: ['sanitaire:gerer', 'sanitaire:lecture', 'saisie:creer', 'stock:gerer'],
  },
  {
    key: 'rh',
    label: 'Ressources humaines',
    role: 'ADMIN',
    jobTitle: 'Responsable RH',
    permissions: ['equipe:gerer', 'equipe:taches', 'rh:lire', 'rh:gerer'],
  },
  {
    key: 'caissier',
    label: 'Caissier / Vendeur',
    role: 'ADMIN',
    jobTitle: 'Caissier',
    permissions: ['vente:creer', 'vente:annuler', 'caisse:lire', 'caisse:ouvrir', 'caisse:fermer', 'compta:client'],
  },
  {
    key: 'magasinier',
    label: 'Magasinier / Stock',
    role: 'ADMIN',
    jobTitle: 'Magasinier',
    permissions: ['stock:gerer', 'pdv:gerer', 'saisie:creer'],
  },
  {
    key: 'production',
    label: 'Responsable production',
    role: 'ADMIN',
    jobTitle: 'Responsable production',
    permissions: ['production:gerer', 'production:abattage', 'saisie:creer', 'stock:gerer', 'sanitaire:lecture'],
  },
  {
    key: 'eleveur',
    label: 'Éleveur terrain',
    role: 'ELEVEUR',
    jobTitle: 'Éleveur',
    permissions: ['saisie:creer', 'vente:creer', 'caisse:lire', 'sanitaire:lecture'],
  },
];

export function groupPermissionCodes(codes: string[]) {
  return PERMISSION_GROUPS_LOCAL.map((group) => ({
    ...group,
    granted: group.items.filter((item) => codes.includes(item.code)),
  })).filter((group) => group.granted.length > 0);
}