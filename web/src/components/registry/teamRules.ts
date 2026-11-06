import type { TeamMemberRow } from '../../api/types-programme';

/** F13: wording of a team account in the registry (the server stays the authority). */
export function teamRoleLabel(role: TeamMemberRow['role']): string {
  return role === 'ADMIN' ? 'Administrateur de ferme' : 'Membre';
}

export function teamAccessState(m: Pick<TeamMemberRow, 'linkActive' | 'accountActive'>): { label: string; tone: 'emerald' | 'amber' | 'slate' } {
  if (!m.accountActive) return { label: 'Compte désactivé', tone: 'slate' };
  return m.linkActive ? { label: 'Accès actif', tone: 'emerald' } : { label: 'Accès suspendu', tone: 'amber' };
}

/** Body of `PUT …/team/:employmentId/active`: flips the current farm access. */
export function toggleActiveBody(m: Pick<TeamMemberRow, 'linkActive'>): { active: boolean } {
  return { active: !m.linkActive };
}
