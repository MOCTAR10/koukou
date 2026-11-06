import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { UserRole } from '../enums/role.enum.js';
import { AuthUser } from '../decorators/current-user.decorator.js';

const INSTITUTION_PASSES: ReadonlySet<UserRole> = new Set([
  UserRole.PLATFORM_ADMIN,
  UserRole.PROPRIETAIRE,
  UserRole.ELEVEUR,
]);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = request.user;
    if (!user) {
      throw new ForbiddenException('Accès refusé.');
    }
    const role = user.role as UserRole;
    if (requiredRoles.includes(role)) return true;
    // POUFA lot A2 divers (F8): the platform admin inherits the owner's
    // routes for reading only. Its writes are the routes that name it
    // explicitly (registry, accounts, journaled corrections…).
    if (
      role === UserRole.PLATFORM_ADMIN &&
      requiredRoles.includes(UserRole.PROPRIETAIRE)
    ) {
      const method = String(request.method ?? 'GET').toUpperCase();
      if (method === 'GET' || method === 'HEAD') return true;
      throw new ForbiddenException(
        'Administrateur plateforme : consultation seule des données des fermes. Les écritures reviennent à la ferme ou au profil habilité de la matrice.',
      );
    }
    // An institutional account passes like a farm member or the platform
    // admin: ProgramAccessGuard, which ran before, already checked its domain,
    // action and farm scope; services narrow it further (assertAccessible,
    // resolveEffectivePermissions, ScopeResolver). Buyer-only routes stay
    // closed to it.
    if (
      role === UserRole.INSTITUTION &&
      requiredRoles.some((r) => INSTITUTION_PASSES.has(r))
    ) {
      return true;
    }
    throw new ForbiddenException(
      'Accès refusé : vous n’avez pas le rôle requis pour cette action.',
    );
  }
}
