import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';
import { DataSource, MoreThan, Repository } from 'typeorm';
import { isUuid } from '../../common/context/request-context.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { maskPhone } from '../audit/audit-sanitize.js';
import { User } from '../users/entities/user.entity.js';
import { LoginChallenge } from './entities/login-challenge.entity.js';
import { SMS_SENDER, type SmsSender } from './sms/sms-sender.js';

/**
 * `INSTITUTION_OTP`: `sms` = institutional accounts sign in with their code
 * plus a one-time SMS code; `off` (default while no SMS provider is live) =
 * code only. The 8 h session applies either way. Any other value counts as
 * `sms` (the safer reading).
 */
export type InstitutionOtpMode = 'off' | 'sms';

export function institutionOtpMode(config: ConfigService): InstitutionOtpMode {
  const raw = String(config.get('INSTITUTION_OTP', 'off')).trim().toLowerCase();
  return raw === 'off' || raw === '' ? 'off' : 'sms';
}

/** Lifetime of a one-time login code. */
export const OTP_TTL_MS = 5 * 60_000;
/** Wrong codes allowed on one challenge before it is burnt. */
export const OTP_MAX_ATTEMPTS = 5;
/** At most this many codes per account per window (lockout). */
export const OTP_MAX_PER_WINDOW = 5;
export const OTP_WINDOW_MS = 15 * 60_000;
/** Session of an institutional account (POUFA plan §5.4), in seconds. */
export const INSTITUTION_SESSION_SECONDS = 8 * 3600;

const INVALID_CHALLENGE =
  'Code expiré ou invalide : reconnectez-vous pour recevoir un nouveau code.';

export interface ChallengeStarted {
  otpRequired: true;
  challengeId: string;
  expiresAt: Date;
  /** Masked phone the code went to. */
  sentTo: string;
}

/** A fresh 6-digit code (uniform, leading zeros kept). */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * One-time SMS code, the second login step of institutional accounts
 * (POUFA plan §5.4). The code is stored hashed, expires after 5 minutes,
 * allows 5 attempts and is consumed once; an account gets at most 5 codes per
 * 15 minutes. Both steps are journaled as LOGIN / LOGIN_FAILED, and the
 * challenge rows by the row-level journal (hash redacted).
 */
@Injectable()
export class LoginChallengeService {
  constructor(
    @InjectRepository(LoginChallenge)
    private readonly challenges: Repository<LoginChallenge>,
    private readonly dataSource: DataSource,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  /** Sends a code to the account's phone. @throws HttpException 429 past the limit */
  async start(user: User): Promise<ChallengeStarted> {
    const recent = await this.challenges.count({
      where: {
        userId: user.id,
        createdAt: MoreThan(new Date(Date.now() - OTP_WINDOW_MS)),
      },
    });
    if (recent >= OTP_MAX_PER_WINDOW) {
      throw new HttpException(
        'Trop de codes demandés : réessayez dans 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const code = generateOtp();
    const challenge = await this.challenges.save(
      this.challenges.create({
        userId: user.id,
        codeHash: await bcrypt.hash(code, 10),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        attempts: 0,
        consumedAt: null,
      }),
    );
    try {
      await this.sms.send(
        user.phone,
        `Fermia : votre code de connexion est ${code}. Il expire dans 5 minutes. Ne le communiquez à personne.`,
      );
    } catch {
      await this.challenges.update(
        { id: challenge.id },
        { consumedAt: new Date() },
      );
      throw new ServiceUnavailableException(
        "Le code de connexion n'a pas pu être envoyé par SMS. Réessayez plus tard.",
      );
    }
    return {
      otpRequired: true,
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt,
      sentTo: maskPhone(user.phone) ?? '',
    };
  }

  /**
   * Checks a code. A wrong code counts an attempt (committed before the 401);
   * the last allowed attempt burns the challenge.
   * @returns the institutional account
   * @throws UnauthorizedException
   */
  async verify(challengeId: string, code: string): Promise<User> {
    if (!isUuid(challengeId))
      throw new UnauthorizedException(INVALID_CHALLENGE);
    const outcome = await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(LoginChallenge);
      const row = await repo.findOne({
        where: { id: challengeId },
        lock: { mode: 'pessimistic_write' },
      });
      const now = new Date();
      if (
        !row ||
        row.consumedAt !== null ||
        row.expiresAt.getTime() <= now.getTime() ||
        row.attempts >= OTP_MAX_ATTEMPTS
      ) {
        return { ok: false as const, left: 0 };
      }
      if (!(await bcrypt.compare(code, row.codeHash))) {
        const attempts = row.attempts + 1;
        await repo.update(
          { id: row.id },
          {
            attempts,
            consumedAt: attempts >= OTP_MAX_ATTEMPTS ? now : null,
          },
        );
        return { ok: false as const, left: OTP_MAX_ATTEMPTS - attempts };
      }
      await repo.update({ id: row.id }, { consumedAt: now });
      return { ok: true as const, userId: row.userId };
    });
    if (!outcome.ok) {
      throw new UnauthorizedException(
        outcome.left > 0
          ? `Code incorrect (${outcome.left} essai${outcome.left > 1 ? 's' : ''} restant${outcome.left > 1 ? 's' : ''}).`
          : INVALID_CHALLENGE,
      );
    }
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: outcome.userId } });
    if (!user || user.role !== UserRole.INSTITUTION) {
      throw new UnauthorizedException(INVALID_CHALLENGE);
    }
    if (user.active === false) {
      throw new UnauthorizedException(
        'Ce compte a été suspendu. Contactez l’administrateur.',
      );
    }
    return user;
  }
}
