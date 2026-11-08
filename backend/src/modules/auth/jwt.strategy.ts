import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RequestContext } from '../../common/context/request-context.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { UsersService } from '../users/users.service.js';
import { resolveJwtSecret } from './auth.secret.js';
import { institutionOtpMode } from './login-challenge.service.js';

export interface JwtPayload {
  sub: string;
  role: string;
  /** Set on institutional tokens: the SMS code step was passed. */
  mfa?: boolean;
  /** Issued at (seconds), set by jsonwebtoken. */
  iat?: number;
}

/** True when a token issued at `iat` (seconds) predates the code reset. */
export function isRevokedByReset(
  iat: number | undefined,
  changedAt: Date | null | undefined,
): boolean {
  if (!changedAt || iat == null) return false;
  return iat * 1000 < changedAt.getTime() - 1000;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable.');
    }
    // A suspended account loses access immediately, not at token expiry.
    if (user.active === false) {
      throw new UnauthorizedException('Compte suspendu.');
    }
    // A token issued before the last code reset is refused (1 s of slack:
    // `iat` is in whole seconds).
    if (isRevokedByReset(payload.iat, user.credentialsChangedAt)) {
      throw new UnauthorizedException(
        'Session expirée : le code a été changé, reconnectez-vous.',
      );
    }
    // With INSTITUTION_OTP=sms an institutional account only ever signs in
    // through the SMS step: a token without it (issued before the account
    // became institutional, or while the OTP was off) is refused.
    if (
      (user.role === UserRole.INSTITUTION ||
        user.role === UserRole.OPERATEUR) &&
      institutionOtpMode(this.config) === 'sms' &&
      payload.mfa !== true
    ) {
      throw new UnauthorizedException('Session invalide : reconnectez-vous.');
    }
    // The audit journal and the row triggers read the actor from here.
    RequestContext.setActor(user.id, user.role);
    return { id: user.id, role: user.role };
  }
}
