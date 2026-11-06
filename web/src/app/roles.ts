import type { Role } from '../api/client';

/**
 * Who goes where (POUFA-only instance). Pure: the guards, the sign-in and the
 * farm shell read these rules, the tests pin them.
 *
 * - ACHETEUR is a Market customer only: the buyer area, never a farm screen.
 * - Farm accounts (owner, staff, platform admin) and INSTITUTION use the farm
 *   space; INSTITUTION only sees the farms of its scope (the server filters).
 */

export const BUYER_HOME = '/marche';
export const FARM_HOME = '/app';

export function isBuyer(role: Role | null | undefined): boolean {
  return role === 'ACHETEUR';
}

export function homePathFor(role: Role | null | undefined): string {
  return isBuyer(role) ? BUYER_HOME : FARM_HOME;
}

/**
 * The buyer's own pages (requests, account). The server opens them to
 * buyers and farm accounts (who may also buy); an institution is refused
 * (Fermia-only domain), so it never gets the links.
 */
export function canUseBuyerArea(role: Role | null | undefined): boolean {
  return role === 'ACHETEUR' || role === 'PROPRIETAIRE' || role === 'ELEVEUR' || role === 'PLATFORM_ADMIN';
}

function isUnder(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}?`);
}

/**
 * Where a signed-in account goes, `from` being the page that asked for the
 * sign-in. A buyer stays in the Market. Anyone else goes back to a farm page,
 * or to a precise Market page he opened himself (a listing, his requests),
 * but never to the Market's front page by default.
 */
export function landingAfterLogin(role: Role, from?: string | null): string {
  const target = from?.trim() || '';
  if (isBuyer(role)) return isUnder(target, BUYER_HOME) ? target : BUYER_HOME;
  if (isUnder(target, FARM_HOME)) return target;
  if (target !== BUYER_HOME && isUnder(target, BUYER_HOME) && canUseBuyerArea(role)) return target;
  return FARM_HOME;
}

export type FarmSpaceState = 'loading' | 'error' | 'no-farm' | 'ready';

/**
 * The farm space needs a farm. A farm account may have none yet (owner whose
 * farm is not activated, staff removed from every farm), and an institution
 * with an aggregate or audit scope never has one: they get a screen saying so
 * instead of pages waiting for a farm forever.
 */
export function farmSpaceState(input: { farmsLoading: boolean; farmsFailed: boolean; farmCount: number }): FarmSpaceState {
  if (input.farmCount > 0) return 'ready';
  if (input.farmsLoading) return 'loading';
  if (input.farmsFailed) return 'error';
  return 'no-farm';
}

/**
 * Pages that make sense without a farm (the rest show the no-farm screen): the
 * platform console, the help, the institutional access screens, the registry
 * (where the first farm gets created) and the programme administration.
 */
export function worksWithoutFarm(pathname: string): boolean {
  return [
    '/app/platform',
    '/app/help',
    '/app/acces',
    '/app/mon-acces',
    '/app/registre',
    // Programme administration: parameters and lists, audit journal, data recovery.
    '/app/parametres',
    '/app/audit',
    '/app/reprise',
  ].some((root) => isUnder(pathname, root));
}

/** French text of the no-farm screen, per kind of account. */
export function noFarmMessage(role: Role | null | undefined): { title: string; body: string } {
  switch (role) {
    case 'PROPRIETAIRE':
      return {
        title: 'Aucune ferme rattachée à votre compte',
        body:
          'Les fermes du programme POUFA sont enregistrées par le registre du programme, puis remises à leur exploitant. ' +
          'Si votre ferme n’apparaît pas, contactez votre agent technique ou l’administration du programme.',
      };
    case 'ELEVEUR':
      return {
        title: 'Vous n’êtes membre d’aucune ferme',
        body: 'Demandez au propriétaire de la ferme de vous ajouter à son équipe, puis reconnectez-vous.',
      };
    case 'INSTITUTION':
      return {
        title: 'Aucune ferme dans votre périmètre',
        body:
          'Votre accès institutionnel ne porte sur aucune ferme en particulier (données agrégées ou journal d’audit), ' +
          'ou les fermes de votre périmètre ne sont pas encore enregistrées. Les écrans de pilotage du programme arrivent bientôt.',
      };
    case 'PLATFORM_ADMIN':
      return {
        title: 'Aucune ferme dans le registre',
        body: 'Les fermes du programme s’enregistrent au registre. Elles apparaîtront ici dès la première inscrite.',
      };
    default:
      return {
        title: 'Aucune ferme',
        body: 'Ce compte n’a accès à aucune ferme.',
      };
  }
}
