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
import { LoginFailure } from './entities/login-failure.entity.js';
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

/** Neutral wording: does not say whether the number already has an account. */
const REGISTER_REFUSED =
  'Inscription impossible avec ce numéro. Si vous avez déjà un compte, connectez-vous.';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(BuyerProfile)
    private readonly buyerProfileRepo: Repository<BuyerProfile>,
    @InjectRepository(LoginFailure)
    private readonly failuresRepo: Repository<LoginFailure>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly challenges: LoginChallengeService,
    private readonly scope: ScopeResolver,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /** A buyer has an account and a profile, but no farm. */
  async registerBuyer(dto: RegisterBuyerDto) {
    // Every spelling of the number: a buyer signs up as "0XXXXXXXX" while the
    // programme accounts are "+241XXXXXXXX", and both sign in with either.
    const taken = await this.usersRepo.exists({
      where: phoneLoginCandidates(dto.phone).map((phone) => ({ phone })),
    });
    if (taken) throw new ConflictException(REGISTER_REFUSED);
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
        throw new ConflictException(REGISTER_REFUSED);
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

  async login(dto: LoginDto, clientIp?: string) {
    const ip = (clientIp || 'unknown').slice(0, 64);
    // Accounts created before phone normalization may still hold spaces.
    const raw = dto.phone.trim();
    const user = await this.usersRepo.findOne({
      where: phoneLoginCandidates(raw).map((phone) => ({ phone })),
    });
    const ok = await bcrypt.compare(
      dto.code,
      user ? user.passwordHash : DUMMY_PASSWORD_HASH,
    );
    // Lock = account-wide ceiling (users.locked_until) or this account seen
    // from this IP (login_failures). A stranger failing from his own address
    // therefore never locks the owner out from another one.
    const ipRow = user ? await this.currentFailureRow(user, ip) : null;
    const lockedUntil = [user?.lockedUntil, ipRow?.lockedUntil]
      .filter((d): d is Date => !!d && d.getTime() > Date.now())
      .sort((a, b) => b.getTime() - a.getTime())[0];
    // The lock message only answers the right code: a wrong code on a locked
    // account reads like any wrong code (no account enumeration).
    if (ok && lockedUntil) {
      const minutes = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Compte temporairement verrouillé après trop d’échecs de connexion. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''} ou contactez l’administrateur.`,
      );
    }
    // A failure while locked is not counted: otherwise a script failing every
    // few minutes would renew the lock for ever. The lock simply runs out.
    if (user && !ok && !lockedUntil) await this.registerFailure(user, ip);
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
    if (ipRow) await this.failuresRepo.delete({ userId: user.id, ip });
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

  /** The (account, ip) counter, ignored when older than the last code reset. */
  private async currentFailureRow(
    user: User,
    ip: string,
  ): Promise<LoginFailure | null> {
    const row = await this.failuresRepo.findOne({
      where: { userId: user.id, ip },
    });
    if (!row) return null;
    if (
      user.credentialsChangedAt &&
      row.updatedAt.getTime() < user.credentialsChangedAt.getTime()
    ) {
      return null;
    }
    return row;
  }

  /**
   * Counts a failed password (atomic increments). From one IP, at
   * LOGIN_MAX_FAILURES (default 5) that account+IP pair is locked for
   * LOGIN_LOCK_MINUTES (default 15). Across all IPs the account itself only
   * locks at LOGIN_GLOBAL_MAX_FAILURES (default 50), a backstop against
   * distributed guessing. Lockouts are written to the audit journal; an admin
   * code reset unlocks everything.
   */
  private async registerFailure(user: User, ip: string): Promise<void> {
    const max = positiveInt(this.config.get('LOGIN_MAX_FAILURES'), 5);
    const globalMax = Math.max(
      max,
      positiveInt(this.config.get('LOGIN_GLOBAL_MAX_FAILURES'), 50),
    );
    const minutes = positiveInt(this.config.get('LOGIN_LOCK_MINUTES'), 15);
    const count = await this.firstCount(
      this.usersRepo.query(
        `UPDATE "users" SET "failed_logins" = "failed_logins" + 1 WHERE "id" = $1 RETURNING "failed_logins" AS n`,
        [user.id],
      ),
    );
    if (count >= globalMax) {
      const until = new Date(Date.now() + minutes * 60000);
      await this.usersRepo.update(user.id, {
        failedLogins: 0,
        lockedUntil: until,
      });
      await this.audit.recordSystem('AUTH_ACCOUNT_LOCKED', {
        userId: user.id,
        failures: count,
        scope: 'account',
        lockedUntil: until.toISOString(),
      });
    }
    const ipCount = await this.firstCount(
      this.failuresRepo.query(
        `INSERT INTO "login_failures" ("user_id", "ip", "failures", "updated_at")
         VALUES ($1, $2, 1, now())
         ON CONFLICT ("user_id", "ip") DO UPDATE SET
           "failures" = CASE WHEN "login_failures"."updated_at" <
             COALESCE((SELECT "credentials_changed_at" FROM "users" WHERE "id" = $1), '-infinity'::timestamptz)
             THEN 1 ELSE "login_failures"."failures" + 1 END,
           "updated_at" = now()
         RETURNING "failures" AS n`,
        [user.id, ip],
      ),
    );
    if (ipCount >= max) {
      const until = new Date(Date.now() + minutes * 60000);
      await this.failuresRepo.update(
        { userId: user.id, ip },
        { failures: 0, lockedUntil: until },
      );
      await this.audit.recordSystem('AUTH_ACCOUNT_LOCKED', {
        userId: user.id,
        failures: ipCount,
        scope: 'ip',
        ip,
        lockedUntil: until.toISOString(),
      });
    }
  }

  private async firstCount(query: Promise<unknown>): Promise<number> {
    const raw = await query;
    // pg driver: [rows, affected] for UPDATE ... RETURNING.
    const rows = (Array.isArray(raw) && Array.isArray(raw[0])
      ? raw[0]
      : raw) as Array<{ n: number }>;
    return Number(rows[0]?.n ?? 0);
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
