import { FarmStaffRole } from '../enums/farm-staff-role.enum.js';

/**
 * Catalogue des permissions accordables par le Propriétaire à un
 * « Administrateur KouKou ». C'est la source de vérité exposée via
 * GET /farms/:farmId/permissions (et utilisée par le PermissionsGuard).
 */
export const PERMISSION_GROUPS = [
  {
    key: 'team',
    label: 'Équipe & profils',
    items: [
      {
        code: 'equipe:gerer',
        label: 'Gérer l’équipe',
        description: 'Créer / éditer les comptes, rôles, postes, permissions et suspensions.',
      },
      {
        code: 'equipe:taches',
        label: 'Planifier les tâches',
        description: 'Créer, assigner, modifier et supprimer les tâches de l’équipe.',
      },
    ],
  },
  {
    key: 'rh',
    label: 'Ressources humaines',
    items: [
      {
        code: 'rh:lire',
        label: 'Voir les dossiers RH',
        description: 'Consulter les fiches employés (poste, contrat, ancienneté, salaire).',
      },
      {
        code: 'rh:gerer',
        label: 'Gérer les dossiers RH',
        description: 'Éditer les fiches employés : contrat, dates, salaire, département.',
      },
    ],
  },
  {
    key: 'caisse',
    label: 'Caisse',
    items: [
      {
        code: 'caisse:lire',
        label: 'Voir la caisse',
        description: 'Consulter le solde et l’historique des mouvements.',
      },
      {
        code: 'caisse:ouvrir',
        label: 'Ouvrir la caisse',
        description: 'Démarrer une session de caisse (CASH).',
      },
      {
        code: 'caisse:fermer',
        label: 'Clôturer la caisse',
        description: 'Fermer une session, décompter et référencer l’espèces.',
      },
    ],
  },
  {
    key: 'ventes',
    label: 'Ventes',
    items: [
      {
        code: 'vente:creer',
        label: 'Encaisser au POS',
        description: 'Vendre poulets, œufs et provende et encaisser.',
      },
      {
        code: 'vente:annuler',
        label: 'Annuler une vente',
        description: 'Annuler une vente et en restaurer le stock.',
      },
      {
        code: 'vente:commande',
        label: 'Précommandes & bons',
        description: 'Créer / livrer / annuler les bons de commande.',
      },
      {
        code: 'vente:promotion',
        label: 'Gérer les promotions',
        description: 'Créer et administrer les codes promotion.',
      },
    ],
  },
  {
    key: 'compta',
    label: 'Comptabilité',
    items: [
      {
        code: 'compta:depense',
        label: 'Saisir des dépenses',
        description: 'Créer, modifier et annuler des dépenses.',
      },
      {
        code: 'compta:client',
        label: 'Fiches clients',
        description: 'Gérer les clients et leurs encaissements.',
      },
      {
        code: 'compta:rapports',
        label: 'Rapports & rentabilité',
        description: 'P&L, rentabilité, exports.',
      },
      {
        code: 'compta:ecritures',
        label: 'Écritures comptables',
        description: 'Voir et initier les écritures régularisées (COM journal).',
      },
    ],
  },
  {
    key: 'stock',
    label: 'Stock & points de vente',
    items: [
      {
        code: 'stock:gerer',
        label: 'Provende & stock',
        description: 'Entrées HACCP, produits, FEFO, consommations.',
      },
      {
        code: 'pdv:gerer',
        label: 'Points de vente & transferts',
        description: 'Gérer les boutiques, transferts ferme → boutique.',
      },
    ],
  },
  {
    key: 'production',
    label: 'Production',
    items: [
      {
        code: 'saisie:creer',
        label: 'Saisie du jour',
        description: 'Renseigner les entrées quotidiennes (mortalité, poids, ponte).',
      },
      {
        code: 'production:gerer',
        label: 'Lots & bâtiments',
        description: 'Créer / éditer lots, bâtiments, intégration.',
      },
      {
        code: 'production:abattage',
        label: 'Ordres d’abattage',
        description: 'Créer et traiter les ordres d’abattage.',
      },
    ],
  },
  {
    key: 'sanitaire',
    label: 'Sanitaire',
    items: [
      {
        code: 'sanitaire:gerer',
        label: 'Protocoles & soins',
        description: 'Programmes de vaccination, soins, traitements, santé.',
      },
      {
        code: 'sanitaire:lecture',
        label: 'Voir le sanitaire',
        description: 'Alertes, passeports sanitaires et historique santé.',
      },
    ],
  },
  {
    key: 'reglages',
    label: 'Réglages',
    items: [
      {
        code: 'reglages:ferme',
        label: 'Paramètres de la ferme',
        description: 'Informations, capacités, points de vente par défaut.',
      },
    ],
  },
] as const;

export type PermissionCode = (typeof PERMISSION_GROUPS)[number]['items'][number]['code'];

export interface PermissionDefinition {
  code: PermissionCode;
  label: string;
  description: string;
}

export const PERMISSIONS: PermissionDefinition[] = PERMISSION_GROUPS.flatMap(
  (g) => g.items.map((item) => ({ ...item })),
);

export const ALL_PERMISSIONS: ReadonlySet<PermissionCode> = new Set(
  PERMISSIONS.map((p) => p.code),
);

export function isPermissionCode(value: unknown): value is PermissionCode {
  return typeof value === 'string' && ALL_PERMISSIONS.has(value as PermissionCode);
}

/** Droits FIXES de l'Éleveur Koukou (terrain) — jamais modifiables. */
export const ELEVEUR_DEFAULT_PERMISSIONS: ReadonlySet<PermissionCode> = new Set([
  'saisie:creer',
  'vente:creer',
  'caisse:lire',
  'sanitaire:lecture',
]);

/** Droits de base accordés à un nouveau « Administrateur KouKou » (le Propriétaire affine). */
export const ADMIN_DEFAULT_PERMISSIONS: ReadonlySet<PermissionCode> = new Set([
  'saisie:creer',
  'caisse:lire',
  'sanitaire:lecture',
]);

export function defaultPermissionsFor(role: FarmStaffRole): PermissionCode[] {
  const base =
    role === FarmStaffRole.ADMIN
      ? ADMIN_DEFAULT_PERMISSIONS
      : ELEVEUR_DEFAULT_PERMISSIONS;
  return PERMISSIONS.filter((p) => base.has(p.code)).map((p) => p.code);
}

export const FARM_STAFF_ROLE_LABELS: Record<FarmStaffRole, string> = {
  [FarmStaffRole.ADMIN]: 'Administrateur KouKou',
  [FarmStaffRole.ELEVEUR]: 'Éleveur Koukou',
};

/** Modèle de profil métier : remplit rôle + permissions d'un coup à l'embauche. */
export interface StaffProfile {
  key: string;
  label: string;
  role: FarmStaffRole;
  /** Poste suggéré (pré-rempli), librement modifiable. */
  jobTitle: string;
  permissions: PermissionCode[];
}

const eleveurPermissions = PERMISSIONS.filter((p) =>
  ELEVEUR_DEFAULT_PERMISSIONS.has(p.code),
).map((p) => p.code);

/**
 * Profils prêts à l'emploi proposés à l'embauche. Le Propriétaire (ou un
 * gestionnaire RH) choisit un profil → rôle + permissions sont pré-remplis,
 * puis affinables. Source de vérité partagée (mobile, web).
 */
export const STAFF_PROFILES: StaffProfile[] = [
  {
    key: 'gestionnaire',
    label: 'Gestionnaire',
    role: FarmStaffRole.ADMIN,
    jobTitle: 'Gestionnaire',
    permissions: [
      'equipe:taches',
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
    role: FarmStaffRole.ADMIN,
    jobTitle: 'Comptable',
    permissions: ['compta:depense', 'compta:client', 'compta:rapports', 'compta:ecritures', 'caisse:lire'],
  },
  {
    key: 'veterinaire',
    label: 'Vétérinaire',
    role: FarmStaffRole.ADMIN,
    jobTitle: 'Vétérinaire',
    permissions: ['sanitaire:gerer', 'sanitaire:lecture', 'saisie:creer'],
  },
  {
    key: 'rh',
    label: 'Ressources humaines',
    role: FarmStaffRole.ADMIN,
    jobTitle: 'Responsable RH',
    permissions: ['equipe:gerer', 'equipe:taches', 'rh:lire', 'rh:gerer'],
  },
  {
    key: 'caissier',
    label: 'Caissier / Vendeur',
    role: FarmStaffRole.ADMIN,
    jobTitle: 'Caissier',
    permissions: ['vente:creer', 'vente:annuler', 'caisse:lire', 'caisse:ouvrir', 'caisse:fermer', 'compta:client'],
  },
  {
    key: 'magasinier',
    label: 'Magasinier / Stock',
    role: FarmStaffRole.ADMIN,
    jobTitle: 'Magasinier',
    permissions: ['stock:gerer', 'pdv:gerer', 'saisie:creer'],
  },
  {
    key: 'production',
    label: 'Responsable production',
    role: FarmStaffRole.ADMIN,
    jobTitle: 'Responsable production',
    permissions: ['production:gerer', 'production:abattage', 'saisie:creer', 'stock:gerer'],
  },
  {
    key: 'eleveur',
    label: 'Éleveur terrain',
    role: FarmStaffRole.ELEVEUR,
    jobTitle: 'Éleveur',
    permissions: eleveurPermissions,
  },
];

export function findStaffProfile(key: string | undefined | null): StaffProfile | undefined {
  if (!key) return undefined;
  return STAFF_PROFILES.find((p) => p.key === key);
}