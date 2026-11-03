export function canManageFarm(role: string | undefined): boolean {
  return role !== 'ELEVEUR' && role !== 'ACHETEUR';
}

/** Where an account lands once signed in: a buyer has no farm screens. */
export function homeRouteFor(role: string | undefined): string {
  return role === 'ACHETEUR' ? '/accueil' : '/';
}

/** A screen to come back to after signing in. Only a path inside the app, never another site. */
export function safeReturnPath(from: string | string[] | undefined): string | null {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return null;
  return from;
}

export function roleLabel(role: string | undefined): string {
  if (role === 'ELEVEUR') return 'Éleveur';
  if (role === 'PLATFORM_ADMIN') return 'Administrateur';
  if (role === 'ACHETEUR') return 'Acheteur';
  return 'Propriétaire';
}

/** Libellé d'un rôle de staff ferme (PROPRIETAIRE / ADMIN / ELEVEUR), avec le nom de la ferme quand disponible. */
export function farmRoleLabel(role: string | undefined, farmName?: string): string {
  if (role === 'PROPRIETAIRE') return 'Propriétaire';
  if (role === 'ADMIN') return farmName ? `Administrateur · ${farmName}` : 'Administrateur Fermia';
  if (role === 'ELEVEUR') return farmName ? `Éleveur · ${farmName}` : 'Éleveur Fermia';
  return 'Membre';
}

/** Vrai si le membre dispose de la permission donnée (ou de tous les droits). */
export function hasFarmPermission(
  permissions: string[] | undefined,
  code: string,
): boolean {
  if (!permissions) return true;
  if (permissions.includes('*')) return true;
  return permissions.includes(code);
}