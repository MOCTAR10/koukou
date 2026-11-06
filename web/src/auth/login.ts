import type { AuthUser } from '../api/client';

/** `POST /auth/login` and `POST /auth/login/otp` with a session. */
export interface LoginSession {
  accessToken: string;
  /** Seconds, sent for institutional sessions (8 h). */
  expiresIn?: number;
  user: AuthUser;
}

/** `POST /auth/login` of an institution when the instance asks for an SMS code. */
export interface OtpChallenge {
  otpRequired: true;
  challengeId: string;
  expiresAt?: string;
  /** Masked phone the code went to. */
  sentTo?: string;
}

export type LoginAnswer = { kind: 'session'; session: LoginSession } | { kind: 'otp'; challenge: OtpChallenge };

/**
 * Reads the login answer. An institutional login may answer a challenge
 * instead of a session: the token comes with the SMS code.
 */
export function readLoginAnswer(raw: unknown): LoginAnswer {
  const data = (raw ?? {}) as Partial<LoginSession & OtpChallenge>;
  if (data.otpRequired === true && typeof data.challengeId === 'string' && data.challengeId) {
    return {
      kind: 'otp',
      challenge: { otpRequired: true, challengeId: data.challengeId, expiresAt: data.expiresAt, sentTo: data.sentTo },
    };
  }
  if (typeof data.accessToken === 'string' && data.accessToken && data.user && typeof data.user.role === 'string') {
    return { kind: 'session', session: data as LoginSession };
  }
  throw new Error('Réponse de connexion inattendue. Réessayez plus tard.');
}

/** The SMS code as the server expects it: 6 digits, spaces typed by the user dropped. */
export function normalizeOtpCode(input: string): string {
  return input.replace(/[\s.-]/g, '');
}

export function otpCodeError(input: string): string | null {
  const code = normalizeOtpCode(input);
  if (!code) return 'Entrez le code reçu par SMS.';
  if (!/^\d{6}$/.test(code)) return 'Le code reçu par SMS compte 6 chiffres.';
  return null;
}
