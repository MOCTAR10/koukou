import {
  isPermissionCode,
  type PermissionCode,
} from '../../common/permissions/permission-catalog.js';
import {
  isGrantableDomain,
  type AccessAction,
  type AccessDomain,
  type AccessMatrix,
} from './access-domains.js';
import { grants } from './access-rules.js';

/**
 * Where each farm permission code sits in the access matrix: an
 * institutional account holds a code on an in-scope farm when its profile
 * grants that domain and action (or an `also` grant). The Fermia bonus
 * domains are granted in consultation only, so only their read codes ever
 * reach an institution. A `Record` over `PermissionCode`:
 * adding a code to the catalogue without mapping it fails to compile.
 */
export const PERMISSION_DOMAINS: Readonly<
  Record<
    PermissionCode,
    {
      domain: AccessDomain;
      action: AccessAction;
      /** Other grants that also give the code (see `@AlsoGrantedBy`). */
      also?: ReadonlyArray<readonly [AccessDomain, AccessAction]>;
    }
  >
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
  // POUFA lot A droits: read codes of the Fermia bonus domains, the farm GPS
  // point (agent technique: TECHNIQUE:VALIDER, on site) and the deliveries.
  'compta:lire': { domain: 'COMPTABILITE', action: 'CONSULTER' },
  'market:lire': { domain: 'MARCHE', action: 'CONSULTER' },
  'intrants:lire': { domain: 'INTRANTS', action: 'CONSULTER' },
  'registre:gps': {
    domain: 'REGISTRE',
    action: 'MODIFIER',
    also: [['TECHNIQUE', 'VALIDER']],
  },
};

// POUFA lot A2 droits (begin): bonus write codes never reach an institution.
/**
 * Write codes of the Fermia bonus features stored under a programme domain
 * (expenses, FEFO stock and receptions, slaughter): an institution never
 * holds them, whatever its matrix grants on ECONOMIQUE, INTRANTS or
 * TRACABILITE (second rampart of `@InstitutionReadOnly`; the apps hide the
 * write buttons on these codes).
 */
export const INSTITUTION_EXCLUDED_CODES: ReadonlySet<PermissionCode> = new Set<PermissionCode>([
  'compta:depense',
  'stock:gerer',
  'production:abattage',
]);
// POUFA lot A2 droits (end)

/** Farm permission codes an institutional profile holds on an in-scope farm. */
export function institutionPermissions(
  matrix: AccessMatrix,
): Set<PermissionCode> {
  const codes = new Set<PermissionCode>();
  for (const [code, rule] of Object.entries(PERMISSION_DOMAINS)) {
    if (!isPermissionCode(code)) continue;
    if (INSTITUTION_EXCLUDED_CODES.has(code)) continue;
    const options = [[rule.domain, rule.action] as const, ...(rule.also ?? [])];
    if (
      options.some(
        ([domain, action]) =>
          isGrantableDomain(domain) && grants(matrix, domain, action),
      )
    ) {
      codes.add(code);
    }
  }
  return codes;
}
