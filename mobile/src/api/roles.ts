export function canManageFarm(role: string | undefined): boolean {
  return role !== 'ELEVEUR';
}

export function roleLabel(role: string | undefined): string {
  if (role === 'ELEVEUR') return 'Éleveur';
  if (role === 'PLATFORM_ADMIN') return 'Administrateur';
  return 'Propriétaire';
}

/** Libellé d'un rôle de staff ferme (PROPRIETAIRE / ADMIN / ELEVEUR), avec le nom de la ferme quand disponible. */
export function farmRoleLabel(role: string | undefined, farmName?: string): string {
  if (role === 'PROPRIETAIRE') return 'Propriétaire';
  if (role === 'ADMIN') return farmName ? `Administrateur · ${farmName}` : 'Administrateur KouKou';
  if (role === 'ELEVEUR') return farmName ? `Éleveur · ${farmName}` : 'Éleveur Koukou';
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