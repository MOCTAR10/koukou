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