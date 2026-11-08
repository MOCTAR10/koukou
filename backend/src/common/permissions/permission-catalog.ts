import { FarmStaffRole } from '../enums/farm-staff-role.enum.js';

/**
 * Every permission group the code knows, dormant « Évolution » groups
 * included: `PermissionCode` derives from it so the dormant routes keep
 * compiling. What the apps are offered is {@link PERMISSION_GROUPS}.
 */
export const PERMISSION_CATALOG = [
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
      {
        code: 'vente:depasser-credit',
        label: 'Dépasser le plafond de crédit client',
        description:
          'Valider une vente à crédit ou une commande qui dépasse le plafond de crédit du client (opération tracée dans le journal).',
      },
    ],
  },
  {
    key: 'market',
    label: 'Market',
    items: [
      {
        code: 'market:publier',
        label: 'Publier sur le Market',
        description: 'Créer, publier, suspendre et clôturer les annonces de la ferme.',
      },
      // POUFA lot A droits: read code (institutions granted MARCHE:CONSULTER).
      {
        code: 'market:lire',
        label: 'Voir le Market de la ferme',
        description: 'Consulter les annonces et les commandes Market de la ferme, sans les modifier.',
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
      // POUFA lot A droits: read code (institutions granted COMPTABILITE:CONSULTER).
      {
        code: 'compta:lire',
        label: 'Voir la comptabilité',
        description: 'Consulter le journal, le grand livre, la balance et les états SYSCOHADA, sans écrire.',
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
      {
        code: 'sanitaire:signaler',
        label: 'Signaler un événement',
        description:
          'Déclarer un symptôme, un soin ou une vaccination observés sur le terrain (sans suppression).',
      },
    ],
  },
  // POUFA lot A droits (begin): programme field rights of the farm.
  {
    key: 'programme',
    label: 'Programme POUFA',
    items: [
      {
        code: 'registre:gps',
        label: 'Relever le GPS de la ferme',
        description: 'Enregistrer sur place le point GPS de la ferme (CDC n° 2) ; l’ancien point reste dans l’historique.',
      },
      {
        code: 'intrants:lire',
        label: 'Voir les livraisons de l’État',
        description: 'Consulter les livraisons d’intrants du programme et le stock déclaratif de la ferme.',
      },
    ],
  },
  // POUFA lot A droits (end)
  {
    key: 'agriculture',
    label: 'Agriculture',
    items: [
      {
        code: 'agri:gerer',
        label: 'Gérer les parcelles & cultures',
        description:
          'Créer, modifier et supprimer les parcelles et les cultures du référentiel.',
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

export type PermissionGroupKey = (typeof PERMISSION_CATALOG)[number]['key'];

export type PermissionCode = (typeof PERMISSION_CATALOG)[number]['items'][number]['code'];

/**
 * Switch for the groups whose module is hidden from the apps (« Évolution »,
 * outside the POUFA spec): they are left out of the served catalogue, a
 * payload naming one of their codes is refused like an unknown code, and a
 * code of theirs already stored on a member link stays in the database but
 * grants nothing. Remove a key to turn its group back on.
 */
export const EVOLUTION_PERMISSION_GROUPS: ReadonlySet<PermissionGroupKey> =
  new Set<PermissionGroupKey>(['agriculture']);

/**
 * Catalogue des permissions accordables par le Propriétaire à un
 * « Administrateur Fermia » : la source de vérité exposée via
 * GET /farms/:farmId/permissions (et utilisée par le PermissionsGuard),
 * sans les groupes « Évolution ».
 */
export const PERMISSION_GROUPS = PERMISSION_CATALOG.filter(
  (g) => !EVOLUTION_PERMISSION_GROUPS.has(g.key),
);

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

/** A code of the served catalogue (dormant « Évolution » codes excluded). */
export function isPermissionCode(value: unknown): value is PermissionCode {
  return typeof value === 'string' && ALL_PERMISSIONS.has(value as PermissionCode);
}

const DORMANT_PERMISSIONS: ReadonlySet<string> = new Set(
  PERMISSION_CATALOG.filter((g) => EVOLUTION_PERMISSION_GROUPS.has(g.key))
    .flatMap((g) => g.items.map((item) => item.code)),
);

/** A code of an « Évolution » group: known, kept when stored, never granted. */
export function isDormantPermissionCode(value: unknown): boolean {
  return typeof value === 'string' && DORMANT_PERMISSIONS.has(value);
}

/**
 * The list to store when a member's permissions are replaced: the new
 * (served) codes plus the dormant codes the link already held, so turning
 * an « Évolution » group back on gives them back.
 */
export function withDormantPermissions(
  next: readonly string[],
  previous: readonly string[] | null | undefined,
): string[] {
  const kept = (previous ?? []).filter(
    (c) => isDormantPermissionCode(c) && !next.includes(c),
  );
  return [...next, ...kept];
}

/** Droits FIXES de l'Éleveur Fermia (terrain) — jamais modifiables. */
export const ELEVEUR_DEFAULT_PERMISSIONS: ReadonlySet<PermissionCode> = new Set([
  'saisie:creer',
  'vente:creer',
  'caisse:lire',
  'sanitaire:lecture',
  'sanitaire:signaler',
  // POUFA lot A droits: GPS point on site and the State deliveries.
  'registre:gps',
  'intrants:lire',
]);

/** Droits de base accordés à un nouveau « Administrateur Fermia » (le Propriétaire affine). */
export const ADMIN_DEFAULT_PERMISSIONS: ReadonlySet<PermissionCode> = new Set([
  'saisie:creer',
  'caisse:lire',
  'sanitaire:lecture',
  'sanitaire:signaler',
  // POUFA lot A droits: GPS point on site and the State deliveries.
  'registre:gps',
  'intrants:lire',
]);

export function defaultPermissionsFor(role: FarmStaffRole): PermissionCode[] {
  const base =
    role === FarmStaffRole.ADMIN
      ? ADMIN_DEFAULT_PERMISSIONS
      : ELEVEUR_DEFAULT_PERMISSIONS;
  return PERMISSIONS.filter((p) => base.has(p.code)).map((p) => p.code);
}

export const FARM_STAFF_ROLE_LABELS: Record<FarmStaffRole, string> = {
  [FarmStaffRole.ADMIN]: 'Administrateur Fermia',
  [FarmStaffRole.ELEVEUR]: 'Éleveur Fermia',
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
      'market:publier',
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
    permissions: ['sanitaire:gerer', 'sanitaire:lecture', 'saisie:creer', 'stock:gerer'],
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
    permissions: ['production:gerer', 'production:abattage', 'saisie:creer', 'stock:gerer', 'sanitaire:lecture'],
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