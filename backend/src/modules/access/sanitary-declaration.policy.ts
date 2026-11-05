import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import type { InstitutionAccess } from './access-rules.js';
import { PROFILE_CODES } from './data/default-profiles.js';
import { ScopeResolver } from './scope-resolver.service.js';

export const SANITARY_DECLARATION_MESSAGE =
  'Accès refusé : les déclarations sanitaires sont réservées à la ferme et aux services vétérinaires.';

/**
 * Legal rule (CDC §8, POUFA plan §5.3.5), not a matrix setting: sanitary
 * declarations are read and written by the farm itself and by the veterinary
 * services only. No other institutional profile reaches them, whatever its
 * matrix says. The farm side keeps Fermia's rules (`assertAccessible` and
 * permissions).
 */
export function mayHandleSanitaryDeclarations(
  user: Pick<AuthUser, 'role'>,
  access: Pick<InstitutionAccess, 'profileCode'> | null,
): boolean {
  if (user.role === UserRole.OPERATEUR) return false;
  if (user.role !== UserRole.INSTITUTION) return true;
  return access?.profileCode === PROFILE_CODES.VETERINAIRE;
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
}
