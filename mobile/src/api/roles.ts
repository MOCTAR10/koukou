/** Account roles that manage their farm outright. An institution, a buyer, staff
 *  or an unknown role never does by default: their rights come from the farm
 *  profile (`useFarmProfile`). */
export function canManageFarm(role: string | undefined): boolean {
  return role === 'PROPRIETAIRE' || role === 'PLATFORM_ADMIN';
}

/** Part of the app an account may reach: the Market customer area, the farm
 *  screens, or a « no farm » screen (owner not linked yet, institution whose
 *  scope holds no farm, reserved operator). A buyer never reaches farm screens. */
export type AccountArea = 'buyer' | 'farm' | 'no-farm';

export function accountArea(role: string | undefined, farmCount: number): AccountArea {
  if (role === 'ACHETEUR') return 'buyer';
  if (role === 'OPERATEUR') return 'no-farm';
  return farmCount > 0 ? 'farm' : 'no-farm';
}

/** Where an account lands once signed in: a buyer has no farm screens, an account without a farm gets the « no farm » screen. */
export function homeRouteFor(role: string | undefined, farmCount = 1): string {
  const area = accountArea(role, farmCount);
  if (area === 'buyer') return '/accueil';
  if (area === 'no-farm') return '/sans-ferme';
  return '/';
}

/** A screen to come back to after signing in. Only a path inside the app, never another site. */
export function safeReturnPath(from: string | string[] | undefined): string | null {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return null;
  return from;
}

export function roleLabel(role: string | undefined): string {
  if (role === 'ELEVEUR') return 'Éleveur';
  if (role === 'PLATFORM_ADMIN') return 'Administrateur';
  if (role === 'ACHETEUR') return 'Client du Marché';
  if (role === 'INSTITUTION') return 'Compte institutionnel';
  if (role === 'OPERATEUR') return 'Opérateur';
  return 'Propriétaire';
}

/** Libellé d'un rôle sur la ferme (PROPRIETAIRE / ADMIN / ELEVEUR / INSTITUTION), avec le nom de la ferme quand disponible. */
export function farmRoleLabel(role: string | null | undefined, farmName?: string): string {
  if (role === 'PROPRIETAIRE') return 'Propriétaire';
  if (role === 'INSTITUTION') return farmName ? `Accès institutionnel · ${farmName}` : 'Accès institutionnel';
  if (role === 'ADMIN') return farmName ? `Administrateur · ${farmName}` : 'Administrateur Fermia';
  if (role === 'ELEVEUR') return farmName ? `Éleveur · ${farmName}` : 'Éleveur Fermia';
  return 'Membre';
}

/** Vrai si le membre dispose de la permission donnée (ou de tous les droits). */
export function hasFarmPermission(
  permissions: string[] | undefined,
  code: string,
): boolean {
  if (!permissions) return false;
  if (permissions.includes('*')) return true;
  return permissions.includes(code);
}
/** French explanation shown to a signed-in account that has no farm to work on. */
export function noFarmMessage(role: string | undefined): { title: string; body: string } {
  if (role === 'INSTITUTION') {
    return {
      title: 'Aucune ferme dans votre périmètre',
      body: 'Votre accès institutionnel ne porte sur aucune ferme consultable dans l’application. Les tableaux de bord du programme sont disponibles sur le portail web.',
    };
  }
  if (role === 'PLATFORM_ADMIN') {
    return {
      title: 'Aucune ferme au registre',
      body: 'Aucune ferme n’est encore enregistrée au registre du programme. Les fermes sont créées depuis le portail web (registre des fermes).',
    };
  }
  if (role === 'OPERATEUR') {
    return {
      title: 'Compte opérateur',
      body: 'Les comptes opérateurs ne sont pas encore ouverts dans l’application.',
    };
  }
  return {
    title: 'Aucune ferme rattachée',
    body: 'Votre compte n’est rattaché à aucune ferme pour le moment. Les fermes sont enregistrées par le programme POUFA : contactez votre agent ou l’administration du programme.',
  };
}
