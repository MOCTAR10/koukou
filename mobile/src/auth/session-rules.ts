import type { Farm, PublicUser, UserRole } from '@/api/types';

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

/**
 * The server no longer accepts our token (expired, or revoked by a code
 * reset): the session must end cleanly. Only an explicit 401 counts, a
 * network failure or a 5xx keeps the session (offline use).
 */
export function isSessionRevoked(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 401;
}

/** French message shown when the server answer can't open a session. */
export const INVALID_LOGIN_ANSWER = 'Réponse inattendue du serveur. Réessayez dans un instant.';

/**
 * Farm the screens work on: the one picked if it is still one of the
 * account's farms, else the first. A buyer never has one, so no farm route
 * (`/farms//…`) is ever called for him.
 */
export function resolveActiveFarmId(
  farms: readonly Pick<Farm, 'id'>[],
  picked: string | undefined,
  role: UserRole | undefined,
): string {
  if (role === 'ACHETEUR') return '';
  if (picked && farms.some((f) => f.id === picked)) return picked;
  return farms[0]?.id ?? '';
}
