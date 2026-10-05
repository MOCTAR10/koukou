import { SetMetadata } from '@nestjs/common';
import type { PermissionCode } from '../permissions/permission-catalog.js';

export const PERMISSIONS_KEY = 'permissions';
/**
 * Restreint une route de ferme à une permission du catalogue.
 * Le Propriétaire (ou l'administrateur plateforme) passe toujours sans
 * restriction ; un membre doit posséder l'une des permissions listées.
 */
export const Permissions = (...codes: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, codes);