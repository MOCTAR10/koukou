import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import type {
  AccessAction,
  AccessMatrix,
  GrantableDomain,
} from './access-domains.js';
import { grants, type InstitutionAccess } from './access-rules.js';
import { ScopeResolver } from './scope-resolver.service.js';

export const SANITARY_DECLARATION_MESSAGE =
  'Accès refusé : les déclarations sanitaires sont réservées à la ferme et aux services vétérinaires (droit Sanitaire : Valider).';

/**
 * POUFA lot A2 vet: the veterinary authority is a matrix right, not a profile
 * code. An institutional profile granted SANITAIRE:VALIDER (seeded on the
 * VETERINAIRE system profile) is « les services vétérinaires » of the CDC:
 * it receives the declarations, validates them (« valident les événements »,
 * n° 26) and publishes the alerts. The administration decides who holds it
 * (matrix screen); a profile without it never reads a declaration, whatever
 * its other SANITAIRE rights (the DGE granted SANITAIRE:CONSULTER for the
 * care calendars sees no declaration). À valider vétérinaires.
 */
export const VETERINARY_AUTHORITY_RIGHT = {
  domain: 'SANITAIRE',
  action: 'VALIDER',
} as const satisfies { domain: GrantableDomain; action: AccessAction };

/** Whether an institutional matrix holds the veterinary authority. */
export function isVeterinaryAuthority(
  matrix: AccessMatrix | null | undefined,
): boolean {
  return (
    !!matrix &&
    grants(
      matrix,
      VETERINARY_AUTHORITY_RIGHT.domain,
      VETERINARY_AUTHORITY_RIGHT.action,
    )
  );
}

/**
 * Legal rule (CDC §8 « les déclarations sont transmises aux seuls services
 * vétérinaires », POUFA plan §5.3.5): sanitary declarations are read and
 * written by the farm itself and by the veterinary authority only
 * ({@link isVeterinaryAuthority}). The farm side keeps Fermia's rules
 * (`assertAccessible` and permissions).
 */
export function mayHandleSanitaryDeclarations(
  user: Pick<AuthUser, 'role'>,
  access: Pick<InstitutionAccess, 'matrix'> | null,
): boolean {
  if (user.role === UserRole.OPERATEUR) return false;
  if (user.role !== UserRole.INSTITUTION) return true;
  return isVeterinaryAuthority(access?.matrix);
}

/**
 * Recette ANINF A21: READING the declarations of a farm in one's perimeter
 * (CDC §3: the agent technique « vérifie les déclarations » de ses fermes).
 * Beyond the veterinary authority, ONLY the AGENT_TECHNIQUE profile (not any
 * other CONSULTER holder: DGE, custom) granted
 * SANITAIRE:CONSULTER in the matrix reads them (default grant of the
 * AGENT_TECHNIQUE profile, the admin can remove or give it). Writing,
 * validating, qualifying and publishing stay with {@link
 * mayHandleSanitaryDeclarations} (SANITAIRE:VALIDER). À arbitrer DGE.
 */
export function mayReadSanitaryDeclarations(
  user: Pick<AuthUser, 'role'>,
  access: Pick<InstitutionAccess, 'matrix' | 'profileCode'> | null,
): boolean {
  if (mayHandleSanitaryDeclarations(user, access)) return true;
  return (
    user.role === UserRole.INSTITUTION &&
    access?.profileCode === 'AGENT_TECHNIQUE' &&
    !!access?.matrix &&
    grants(access.matrix, 'SANITAIRE', 'CONSULTER')
  );
}

/**
 * Service-side enforcement of the sanitary declaration rule. Today's
 * declarations are the `HealthEvent`s (sanitary module); the official
 * surveillance module (L5) must call it too.
 */
@Injectable()
export class SanitaryDeclarationPolicy {
  constructor(private readonly scope: ScopeResolver) {}

  /** @throws ForbiddenException */
  async assert(user: AuthUser): Promise<void> {
    const access =
      user.role === UserRole.INSTITUTION
        ? await this.scope.accessOf(user.id)
        : null;
    if (!mayHandleSanitaryDeclarations(user, access)) {
      throw new ForbiddenException(SANITARY_DECLARATION_MESSAGE);
    }
  }

  /** Read-only variant ({@link mayReadSanitaryDeclarations}). @throws ForbiddenException */
  async assertRead(user: AuthUser): Promise<void> {
    const access =
      user.role === UserRole.INSTITUTION
        ? await this.scope.accessOf(user.id)
        : null;
    if (!mayReadSanitaryDeclarations(user, access)) {
      throw new ForbiddenException(SANITARY_DECLARATION_MESSAGE);
    }
  }
}
