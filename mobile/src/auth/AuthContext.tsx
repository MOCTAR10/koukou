import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { apiFetch, ApiError } from '@/api/client';
import { clearSession, loadSession, saveSession, type StoredSession } from '@/api/token';
import { clearUserQueue, clearUserRejected, countUserOps } from '@/offline';
import { confirm } from '@/components/ui/Feedback';
import { unregisterForPush } from '@/notifications/push';
import type { CustomerType, Farm, PublicUser } from '@/api/types';
import { INVALID_LOGIN_ANSWER, readLoginAnswer, resolveActiveFarmId, type OtpChallenge } from './session-rules';

export interface RegisterBuyerInput {
  phone: string;
  fullName: string;
  code: string;
  type: CustomerType;
  organizationName?: string;
  city?: string;
}

export type SignInResult = 'signed-in' | 'otp' | 'failed';

const EMPTY_USER: PublicUser = { id: '', fullName: '', phone: '', role: 'PROPRIETAIRE' };

export type AuthMode = 'live';

interface AuthContextValue {
  mode: AuthMode;
  signedIn: boolean;
  user: PublicUser;
  farms: Farm[];
  farmId: string;
  activeFarmId: string;
  busy: boolean;
  error: string | null;
  setActiveFarmId: (farmId: string) => void;
  /** `otp`: an institutional account must now type the code received by SMS (`verifyOtp`). */
  signIn: (phone: string, code: string) => Promise<SignInResult>;
  /** Pending SMS step of an institutional login, null otherwise. */
  otpChallenge: OtpChallenge | null;
  verifyOtp: (code: string) => Promise<boolean>;
  cancelOtp: () => void;
  /** Market customer sign-up: the only self-service account (farms come from the programme registry). */
  registerBuyer: (input: RegisterBuyerInput) => Promise<boolean>;
  signOut: () => Promise<void>;
  /** Recharge /farms et met à jour la session (après renommage / logo). */
  refreshFarms: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<StoredSession | null>(() => loadSession());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpChallenge, setOtpChallenge] = useState<OtpChallenge | null>(null);

  useEffect(() => {
    if (!session?.token) return;
    apiFetch<Farm[]>('/farms')
      .then((farms) => {
        setSession((prev) => (prev?.token ? { ...prev, farms } : prev));
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) {
          clearSession();
          setSession(null);
        }
      });
  }, [session?.token]);

  /** Stores the token, loads the farms, then publishes the session. */
  const openSession = useCallback(
    async (accessToken: string, user: PublicUser): Promise<void> => {
      const next: StoredSession = { token: accessToken, user, farms: [] };
      saveSession(next);
      const farms = await apiFetch<Farm[]>('/farms');
      const full: StoredSession = { ...next, farms };
      saveSession(full);
      // Drop the previous account's cache (salaries, cash…): invalidating
      // would keep showing it until each query refetches.
      queryClient.clear();
      setSession(full);
    },
    [queryClient],
  );

  const signIn = useCallback(
    async (phone: string, code: string): Promise<SignInResult> => {
      setBusy(true);
      setError(null);
      try {
        const answer = readLoginAnswer(
          await apiFetch<unknown>('/auth/login', { method: 'POST', body: { phone, code } }),
        );
        if (answer.kind === 'otp') {
          setOtpChallenge(answer.challenge);
          return 'otp';
        }
        if (answer.kind !== 'session') throw new Error(INVALID_LOGIN_ANSWER);
        setOtpChallenge(null);
        await openSession(answer.accessToken, answer.user);
        return 'signed-in';
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erreur inconnue lors de la connexion.');
        return 'failed';
      } finally {
        setBusy(false);
      }
    },
    [openSession],
  );

  const verifyOtp = useCallback(
    async (code: string): Promise<boolean> => {
      if (!otpChallenge) return false;
      setBusy(true);
      setError(null);
      try {
        const answer = readLoginAnswer(
          await apiFetch<unknown>('/auth/login/otp', {
            method: 'POST',
            body: { challengeId: otpChallenge.challengeId, code },
          }),
        );
        if (answer.kind !== 'session') throw new Error(INVALID_LOGIN_ANSWER);
        await openSession(answer.accessToken, answer.user);
        setOtpChallenge(null);
        return true;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erreur inconnue lors de la vérification du code.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [openSession, otpChallenge],
  );

  const cancelOtp = useCallback(() => {
    setOtpChallenge(null);
    setError(null);
  }, []);

  const authenticate = useCallback(
    async (path: string, body: object, fallbackError: string): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const answer = readLoginAnswer(await apiFetch<unknown>(path, { method: 'POST', body }));
        if (answer.kind !== 'session') throw new Error(INVALID_LOGIN_ANSWER);
        await openSession(answer.accessToken, answer.user);
        return true;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : fallbackError);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [openSession],
  );

  const registerBuyer = useCallback(
    (input: RegisterBuyerInput) => authenticate('/auth/register-buyer', input, 'Erreur inconnue lors de l’inscription.'),
    [authenticate],
  );

  const signOut = useCallback(async () => {
    // The queue may hold unsynced cash sales: never wipe it silently.
    const userId = loadSession()?.user?.id;
    const pending = countUserOps(userId);
    if (pending > 0) {
      const ok = await confirm({
        title: 'Opérations non synchronisées',
        message: `${pending} opération(s) (ventes, saisies… y compris celles refusées par le serveur) n’ont pas encore été envoyées ou corrigées. Elles seront perdues si vous vous déconnectez maintenant.\n\nReconnectez-vous à Internet et attendez la synchronisation, ou confirmez la déconnexion.`,
        cancelLabel: 'Rester connecté',
        confirmLabel: 'Se déconnecter',
        destructive: true,
      });
      if (!ok) return;
    }
    // While the session token is still there: stop push for this account.
    await unregisterForPush();
    clearSession();
    clearUserQueue(userId);
    clearUserRejected(userId);
    setSession(null);
    setOtpChallenge(null);
    setError(null);
    queryClient.clear();
  }, [queryClient]);

  const setActiveFarmId = useCallback(
    (farmId: string) => {
      if (!session) return;
      const newSession: StoredSession = { ...session, activeFarmId: farmId };
      saveSession(newSession);
      setSession(newSession);
    },
    [session],
  );

  const refreshFarms = useCallback(async () => {
    const token = loadSession()?.token;
    if (!token) return;
    try {
      const farms = await apiFetch<Farm[]>('/farms');
      const current = loadSession();
      // Signed out or another account meanwhile: drop the answer.
      if (!current || current.token !== token) return;
      const next: StoredSession = { ...current, farms };
      saveSession(next);
      setSession(next);
    } catch {
      // Keep the farms already known (offline).
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const signedIn = Boolean(session?.token);
    const activeFarmId = resolveActiveFarmId(session?.farms ?? [], session?.activeFarmId, session?.user.role);
    return {
      mode: 'live',
      signedIn,
      user: session?.user ?? EMPTY_USER,
      farms: session?.farms ?? [],
      farmId: activeFarmId,
      activeFarmId,
      busy,
      error,
      signIn,
      otpChallenge,
      verifyOtp,
      cancelOtp,
      registerBuyer,
      signOut,
      setActiveFarmId,
      refreshFarms,
    };
  }, [session, busy, error, signIn, otpChallenge, verifyOtp, cancelOtp, registerBuyer, signOut, setActiveFarmId, refreshFarms]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return ctx;
}