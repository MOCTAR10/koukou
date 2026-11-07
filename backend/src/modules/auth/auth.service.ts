import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { CustomerType } from '../../common/enums/customer-type.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { BuyerProfile } from '../users/entities/buyer-profile.entity.js';
import { User } from '../users/entities/user.entity.js';
import { BuyerProfileDto, RegisterBuyerDto } from './dto/buyer.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import {
  INSTITUTION_SESSION_SECONDS,
  LoginChallengeService,
  institutionOtpMode,
} from './login-challenge.service.js';
import { NO_MEMBERSHIP_MESSAGE } from '../access/access-rules.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import { isUniqueViolation } from '../../common/utils/idempotency.js';
import { phoneLoginCandidates } from '../../common/utils/phone.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(BuyerProfile)
    private readonly buyerProfileRepo: Repository<BuyerProfile>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly challenges: LoginChallengeService,
    private readonly scope: ScopeResolver,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /** A buyer has an account and a profile, but no farm. */
  async registerBuyer(dto: RegisterBuyerDto) {
    const taken = await this.usersRepo.exists({ where: { phone: dto.phone } });
    if (taken) {
      throw new ConflictException(
        'Un compte existe déjà avec ce numéro de téléphone.',
      );
    }
    const passwordHash = await bcrypt.hash(dto.code, 10);
    try {
      const user = await this.dataSource.transaction(async (em) => {
        const created = await em.getRepository(User).save(
          em.getRepository(User).create({
            phone: dto.phone,
            fullName: dto.fullName,
            passwordHash,
            role: UserRole.ACHETEUR,
          }),
        );
        await em.getRepository(BuyerProfile).save(
          em.getRepository(BuyerProfile).create({
            userId: created.id,
            type: dto.type ?? CustomerType.PARTICULIER,
            organizationName: dto.organizationName ?? null,
            city: dto.city ?? null,
          }),
        );
        return created;
      });
      return this.buildAuthResponse(user);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'Un compte existe déjà avec ce numéro de téléphone.',
        );
      }
      throw err;
    }
  }

  getBuyerProfile(user: AuthUser) {
    return this.buyerProfileRepo.findOne({ where: { userId: user.id } });
  }

  async saveBuyerProfile(user: AuthUser, dto: BuyerProfileDto) {
    await this.buyerProfileRepo.upsert(
      {
        userId: user.id,
        type: dto.type,
        organizationName: dto.organizationName ?? null,
        city: dto.city ?? null,
      },
      ['userId'],
    );
    return this.getBuyerProfile(user);
  }

  async login(dto: LoginDto) {
    // Accounts created before phone normalization may still hold spaces.
    const raw = dto.phone.trim();
    const user = await this.usersRepo.findOne({
      where: phoneLoginCandidates(raw).map((phone) => ({ phone })),
    });
    const ok = await bcrypt.compare(
      dto.code,
      user ? user.passwordHash : DUMMY_PASSWORD_HASH,
    );
    if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new UnauthorizedException(
        `Compte temporairement verrouillé après trop d’échecs de connexion. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''} ou contactez l’administrateur.`,
      );
    }
    if (user && !ok) await this.registerFailure(user);
    if (!user || !ok) {
      throw new UnauthorizedException(
        'Identifiants invalides. Vérifiez le numéro de téléphone et le code.',
      );
    }
    if (user.failedLogins > 0 || user.lockedUntil) {
      await this.usersRepo.update(user.id, {
        failedLogins: 0,
        lockedUntil: null,
      });
    }
    if (user.active === false) {
      throw new UnauthorizedException(
        'Ce compte a été suspendu. Contactez l’administrateur.',
      );
    }
    if (user.role === UserRole.OPERATEUR) {
      throw new UnauthorizedException(
        'Les comptes opérateurs ne sont pas encore ouverts.',
      );
    }
    if (user.role === UserRole.INSTITUTION) {
      await this.assertMembership(user);
      // Strengthened login (INSTITUTION_OTP=sms): the token comes with the
      // SMS code (POST /auth/login/otp), never with the phone + code alone.
      if (institutionOtpMode(this.config) === 'sms') {
        return this.challenges.start(user);
      }
      return this.buildAuthResponse(user, false);
    }
    return this.buildAuthResponse(user);
  }

  /**
   * Counts a failed password (atomic increment). At LOGIN_MAX_FAILURES
   * (default 5) the account is locked for LOGIN_LOCK_MINUTES (default 15) and
   * the lockout is written to the audit journal. An admin code reset unlocks.
   */
  private async registerFailure(user: User): Promise<void> {
    const max = positiveInt(this.config.get('LOGIN_MAX_FAILURES'), 5);
    const minutes = positiveInt(this.config.get('LOGIN_LOCK_MINUTES'), 15);
    const raw: unknown = await this.usersRepo.query(
      `UPDATE "users" SET "failed_logins" = "failed_logins" + 1 WHERE "id" = $1 RETURNING "failed_logins" AS n`,
      [user.id],
    );
    // pg driver: [rows, affected] for UPDATE ... RETURNING.
    const rows = (Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw) as Array<{
      n: number;
    }>;
    const count = Number(rows[0]?.n ?? 0);
    if (count >= max) {
      const until = new Date(Date.now() + minutes * 60000);
      await this.usersRepo.update(user.id, {
        failedLogins: 0,
        lockedUntil: until,
      });
      await this.audit.recordSystem('AUTH_ACCOUNT_LOCKED', {
        userId: user.id,
        failures: count,
        lockedUntil: until.toISOString(),
      });
    }
  }

  /** Second step of an institutional login: the SMS code opens an 8 h session. */
  async verifyOtp(dto: VerifyOtpDto) {
    if (institutionOtpMode(this.config) !== 'sms') {
      throw new BadRequestException(
        'La connexion par code SMS n’est pas activée sur cette instance.',
      );
    }
    const user = await this.challenges.verify(dto.challengeId, dto.code);
    await this.assertMembership(user);
    return this.buildAuthResponse(user, true);
  }

  private async assertMembership(user: User): Promise<void> {
    if (!(await this.scope.accessOf(user.id))) {
      throw new UnauthorizedException(NO_MEMBERSHIP_MESSAGE);
    }
  }

  /** `mfa`: the SMS code step was passed (checked by JwtStrategy when on). */
  private buildAuthResponse(user: User, mfa = false) {
    const institution = user.role === UserRole.INSTITUTION;
    // An institutional session lasts 8 h instead of the default one.
    const accessToken = institution
      ? this.jwtService.sign(
          { sub: user.id, role: user.role, ...(mfa ? { mfa: true } : {}) },
          { expiresIn: INSTITUTION_SESSION_SECONDS },
        )
      : this.jwtService.sign({ sub: user.id, role: user.role });
    return {
      accessToken,
      ...(institution ? { expiresIn: INSTITUTION_SESSION_SECONDS } : {}),
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email ?? null,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }
}

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('kudummy-identity-check', 10);

function positiveInt(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
