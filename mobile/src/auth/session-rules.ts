import type { PublicUser } from '@/api/types';

/** Second login step of an institutional account (INSTITUTION_OTP=sms). */
export interface OtpChallenge {
  challengeId: string;
  /** Masked phone the SMS went to (« +241 •• •• 12 »), may be empty. */
  sentTo: string;
  /** ISO date after which the code is refused. */
  expiresAt: string | null;
}

/** Length of the code sent by SMS (backend `VerifyOtpDto`). */
export const OTP_LENGTH = 6;

export type LoginAnswer =
  | { kind: 'session'; accessToken: string; user: PublicUser }
  | { kind: 'otp'; challenge: OtpChallenge }
  | { kind: 'invalid' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads the answer of `POST /auth/login` (or `/auth/login/otp`,
 * `/auth/register-buyer`): either a session, or — for an institutional
 * account when SMS codes are on — a challenge to answer with the code
 * received. Anything else is refused, so no session is ever stored without
 * a token.
 */
export function readLoginAnswer(raw: unknown): LoginAnswer {
  if (!isRecord(raw)) return { kind: 'invalid' };
  if (raw.otpRequired === true) {
    if (typeof raw.challengeId !== 'string' || raw.challengeId.length === 0) return { kind: 'invalid' };
    return {
      kind: 'otp',
      challenge: {
        challengeId: raw.challengeId,
        sentTo: typeof raw.sentTo === 'string' ? raw.sentTo : '',
        expiresAt: typeof raw.expiresAt === 'string' ? raw.expiresAt : null,
      },
    };
  }
  const user = raw.user;
  if (typeof raw.accessToken !== 'string' || raw.accessToken.length === 0) return { kind: 'invalid' };
  if (!isRecord(user) || typeof user.id !== 'string' || typeof user.role !== 'string') return { kind: 'invalid' };
  return { kind: 'session', accessToken: raw.accessToken, user: user as unknown as PublicUser };
}

/** French message shown when the server answer can't open a session. */
export const INVALID_LOGIN_ANSWER = 'Réponse inattendue du serveur. Réessayez dans un instant.';
