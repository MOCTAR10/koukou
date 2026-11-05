import { SetMetadata } from '@nestjs/common';
import type {
  AccessAction,
  AccessDomain,
} from '../../modules/access/access-domains.js';

export const DOMAIN_KEY = 'accessDomain';
export const ACTION_KEY = 'accessAction';

/**
 * Access domain of a controller (class level, mandatory on every controller:
 * a unit test enforces it), or of one route when it differs from its
 * controller's. An institutional account is refused on any route without a
 * domain (default deny, `ProgramAccessGuard`).
 */
export const Domain = (domain: AccessDomain) => SetMetadata(DOMAIN_KEY, domain);

/**
 * Action of a route when its HTTP method does not say it (default: GET =
 * CONSULTER, POST = CREER, PATCH/PUT/DELETE = MODIFIER), e.g. a POST that only
 * checks something (`CONSULTER`) or validates (`VALIDER`).
 */
export const Action = (action: AccessAction) => SetMetadata(ACTION_KEY, action);
