import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, clearSession, getStoredUser, setSession } from '../api/client';
import type { AuthUser } from '../api/client';
import { landingAfterLogin } from '../app/roles';
import { normalizeGabonPhone } from '../lib/phone';
import { clearReadCache } from '../offline/readCache';
import { clearOfflineOps, loadOps } from '../offline/store';
import { normalizeOtpCode, readLoginAnswer, type LoginSession, type OtpChallenge } from './login';

/** A signed-in session, or the SMS step an institutional account must pass first. */
export type LoginOutcome = { kind: 'signed-in' } | { kind: 'otp'; challenge: OtpChallenge };

export interface RegisterBuyerInput {
  fullName: string;
  phone: string;
  code: string;
  type: string;
  organizationName?: string;
  city?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAdmin: boolean;
  isOwnerOrAdmin: boolean;
  /**
   * `from`: the page that asked for the sign-in (see `landingAfterLogin`).
   * An institutional account may answer an SMS challenge: then call verifyOtp.
   */
  login: (phone: string, code: string, from?: string) => Promise<LoginOutcome>;
  /** Second step of an institutional sign-in: the 6-digit code received by SMS. */
  verifyOtp: (challengeId: string, code: string, from?: string) => Promise<void>;
  /** Market customer account (the only self sign-up: farm accounts come from the registry). */
  registerBuyer: (input: RegisterBuyerInput, from?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem('koukou.user');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  });

  const value = useMemo<AuthContextValue>(() => {
    const startSession = (res: LoginSession, from?: string) => {
      // Never show the previous account's cached data.
      queryClient.clear();
      if (getStoredUser()?.id !== res.user.id) void clearReadCache();
      setSession(res.accessToken, res.user);
      setUser(res.user);
      navigate(landingAfterLogin(res.user.role, from));
    };
    return {
      user,
      isAdmin: user?.role === 'PLATFORM_ADMIN',
      isOwnerOrAdmin:
        user?.role === 'PROPRIETAIRE' || user?.role === 'PLATFORM_ADMIN',
      login: async (phone: string, code: string, from?: string) => {
        // Mobile accounts are stored as 0XXXXXXXX; the seeded platform admin
        // may be stored as typed, in international form.
        const normalized = normalizeGabonPhone(phone);
        let raw: unknown;
        try {
          raw = await api.post<unknown>('/auth/login', { phone: normalized, code });
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 401 || !phone.startsWith('+')) throw err;
          raw = await api.post<unknown>('/auth/login', { phone, code });
        }
        const answer = readLoginAnswer(raw);
        if (answer.kind === 'otp') return answer;
        startSession(answer.session, from);
        return { kind: 'signed-in' };
      },
      verifyOtp: async (challengeId: string, code: string, from?: string) => {
        const answer = readLoginAnswer(
          await api.post<unknown>('/auth/login/otp', { challengeId, code: normalizeOtpCode(code) }),
        );
        if (answer.kind !== 'session') throw new Error('Réponse de connexion inattendue. Réessayez plus tard.');
        startSession(answer.session, from);
      },
      registerBuyer: async (input: RegisterBuyerInput, from?: string) => {
        const answer = readLoginAnswer(await api.post<unknown>('/auth/register-buyer', input));
        if (answer.kind !== 'session') throw new Error('Réponse d’inscription inattendue. Réessayez plus tard.');
        startSession(answer.session, from ?? '/marche');
      },
      logout: () => {
        const pending = loadOps().length;
        if (
          pending > 0 &&
          !window.confirm(
            `${pending} opération(s) (ventes, saisies…) n’ont pas encore été envoyées au serveur. Elles seront perdues si vous vous déconnectez maintenant.

Se déconnecter quand même ?`,
          )
        ) {
          return;
        }
        clearOfflineOps();
        void clearReadCache();
        clearSession();
        // The 401 path reloads the page; a manual logout must drop the cache
        // and the selected farm itself.
        localStorage.removeItem('koukou.farmId');
        queryClient.clear();
        setUser(null);
        navigate('/login');
      },
    };
  }, [navigate, user, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return ctx;
}