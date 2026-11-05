import type { PermissionCode } from '../../common/permissions/permission-catalog.js';
import {
  isProgrammeDomain,
  type AccessAction,
  type AccessDomain,
  type AccessMatrix,
} from './access-domains.js';
import { grants } from './access-rules.js';

/**
 * Where each farm permission code sits in the access matrix: an
 * institutional account holds a code on an in-scope farm when its profile
 * grants that domain and action. Fermia-only domains are never granted, so
 * their codes never reach an institution. A `Record` over `PermissionCode`:
 * adding a code to the catalogue without mapping it fails to compile.
 */
export const PERMISSION_DOMAINS: Readonly<
  Record<PermissionCode, { domain: AccessDomain; action: AccessAction }>
> = {
  'equipe:gerer': { domain: 'EQUIPE', action: 'MODIFIER' },
  'equipe:taches': { domain: 'EQUIPE', action: 'MODIFIER' },
  'rh:lire': { domain: 'EQUIPE', action: 'CONSULTER' },
  'rh:gerer': { domain: 'EQUIPE', action: 'MODIFIER' },
  'caisse:lire': { domain: 'VENTES', action: 'CONSULTER' },
  'caisse:ouvrir': { domain: 'VENTES', action: 'MODIFIER' },
  'caisse:fermer': { domain: 'VENTES', action: 'MODIFIER' },
  'vente:creer': { domain: 'VENTES', action: 'CREER' },
  'vente:annuler': { domain: 'VENTES', action: 'MODIFIER' },
  'vente:commande': { domain: 'VENTES', action: 'CREER' },
  'vente:promotion': { domain: 'VENTES', action: 'MODIFIER' },
  'market:publier': { domain: 'MARCHE', action: 'CREER' },
  'compta:depense': { domain: 'ECONOMIQUE', action: 'CREER' },
  'compta:client': { domain: 'VENTES', action: 'MODIFIER' },
  'compta:rapports': { domain: 'ECONOMIQUE', action: 'CONSULTER' },
  'compta:ecritures': { domain: 'COMPTABILITE', action: 'MODIFIER' },
  'stock:gerer': { domain: 'INTRANTS', action: 'MODIFIER' },
  'pdv:gerer': { domain: 'VENTES', action: 'MODIFIER' },
  'saisie:creer': { domain: 'TECHNIQUE', action: 'CREER' },
  'production:gerer': { domain: 'TECHNIQUE', action: 'MODIFIER' },
  'production:abattage': { domain: 'TRACABILITE', action: 'MODIFIER' },
  'sanitaire:gerer': { domain: 'SANITAIRE', action: 'MODIFIER' },
  'sanitaire:lecture': { domain: 'SANITAIRE', action: 'CONSULTER' },
  'sanitaire:signaler': { domain: 'SANITAIRE', action: 'CREER' },
  'agri:gerer': { domain: 'CULTURES', action: 'MODIFIER' },
  'reglages:ferme': { domain: 'COMPTE', action: 'MODIFIER' },
};

/** Farm permission codes an institutional profile holds on an in-scope farm. */
export function institutionPermissions(
  matrix: AccessMatrix,
): Set<PermissionCode> {
  const codes = new Set<PermissionCode>();
  for (const [code, { domain, action }] of Object.entries(PERMISSION_DOMAINS)) {
    if (isProgrammeDomain(domain) && grants(matrix, domain, action)) {
      codes.add(code as PermissionCode);
    }
  }
  return codes;
}
