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
