import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RequestContext } from '../../common/context/request-context.js';
import { UsersService } from '../users/users.service.js';
import { resolveJwtSecret } from './auth.secret.js';

export interface JwtPayload {
  sub: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
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
    // The audit journal and the row triggers read the actor from here.
    RequestContext.setActor(user.id, user.role);
    return { id: user.id, role: user.role };
  }
}
