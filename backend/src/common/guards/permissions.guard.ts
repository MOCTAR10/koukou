import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import { AuthUser } from '../decorators/current-user.decorator.js';
import type { PermissionCode } from '../permissions/permission-catalog.js';
import { FarmsService } from '../../modules/farms/farms.service.js';

/**
 * Garde de permissions (ferme-scope) : applique les @Permissions(...).
 * Le Propriétaire de la ferme et l'administrateur plateforme passent toujours ;
 * un membre (Administrateur KouKou / Éleveur Koukou) doit détenir une des
 * permissions requises à travers son rattachement (FarmEmployee) actif.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly farmsService: FarmsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionCode[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = request.user;
    if (!user) {
      throw new ForbiddenException('Accès refusé.');
    }
    const farmId: string | undefined =
      request.params?.farmId ??
      (Array.isArray(request.params) ? request.params[0]?.farmId : undefined);
    if (!farmId) {
      return true;
    }
    const resolution = await this.farmsService.resolveEffectivePermissions(
      user,
      farmId,
    );
    if (resolution === 'ALL') {
      return true;
    }
    if (resolution === null) {
      throw new ForbiddenException(
        'Accès refusé : membre inactif ou non rattaché à cette ferme.',
      );
    }
    const granted = required.some((code) => resolution.permissions.has(code));
    if (!granted) {
      throw new ForbiddenException(
        'Accès refusé : la permission requise pour cette action n’est pas accordée.',
      );
    }
    return true;
  }
}