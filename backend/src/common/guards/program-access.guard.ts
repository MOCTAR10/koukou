import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  SESSION_DOMAIN,
  actionForMethod,
  type AccessAction,
  type AccessDomain,
} from '../../modules/access/access-domains.js';
import { decideRoute } from '../../modules/access/access-rules.js';
import { ScopeResolver } from '../../modules/access/scope-resolver.service.js';
import { AuthUser } from '../decorators/current-user.decorator.js';
import { ACTION_KEY, DOMAIN_KEY } from '../decorators/domain.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { UserRole } from '../enums/role.enum.js';

/**
 * Institutional access (POUFA plan §5.3), after the JWT guard and before the
 * roles guard. Other accounts are untouched (their RolesGuard and
 * PermissionsGuard rules apply as before). An INSTITUTION account needs:
 * a `@Domain` on the route or its controller (default deny), an effective
 * membership whose profile grants the route's action on that domain, and,
 * on a `:farmId` route, that farm in its scope. OPERATEUR accounts are
 * reserved and refused everywhere for now.
 */
@Injectable()
export class ProgramAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly scope: ScopeResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = request.user;
    if (!user) return true;
    if (user.role === UserRole.OPERATEUR) {
      throw new ForbiddenException(
        'Accès refusé : les comptes opérateurs ne sont pas encore ouverts.',
      );
    }
    if (user.role !== UserRole.INSTITUTION) return true;

    const domain = this.reflector.getAllAndOverride<AccessDomain | undefined>(
      DOMAIN_KEY,
      targets,
    );
    const action =
      this.reflector.getAllAndOverride<AccessAction | undefined>(
        ACTION_KEY,
        targets,
      ) ?? actionForMethod(String(request.method ?? 'GET'));
    const access = domain ? await this.scope.accessOf(user.id) : null;
    const decision = decideRoute(access, domain, action);
    if (!decision.allowed) throw new ForbiddenException(decision.reason);

    const farmId: unknown = request.params?.farmId;
    if (access && domain !== SESSION_DOMAIN && typeof farmId === 'string') {
      await this.scope.assertFarmId(access, farmId);
    }
    return true;
  }
}
