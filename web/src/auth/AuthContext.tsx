import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, clearSession, setSession } from '../api/client';
import type { AuthUser } from '../api/client';
import { normalizeGabonPhone } from '../lib/phone';

interface LoginResult {
  accessToken: string;
  user: AuthUser;
}

export interface RegisterInput {
  fullName: string;
  farmName: string;
  phone: string;
  code: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAdmin: boolean;
  isOwnerOrAdmin: boolean;
  login: (phone: string, code: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
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
    const startSession = (res: LoginResult) => {
      // Never show the previous account's cached data.
      queryClient.clear();
      setSession(res.accessToken, res.user);
      setUser(res.user);
      navigate('/app');
    };
    return {
      user,
      isAdmin: user?.role === 'PLATFORM_ADMIN',
      isOwnerOrAdmin:
        user?.role === 'PROPRIETAIRE' || user?.role === 'PLATFORM_ADMIN',
      login: async (phone: string, code: string) => {
        // Mobile accounts are stored as 0XXXXXXXX; the seeded platform admin
        // may be stored as typed, in international form.
        const normalized = normalizeGabonPhone(phone);
        let res: LoginResult;
        try {
          res = await api.post<LoginResult>('/auth/login', { phone: normalized, code });
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 401 || !phone.startsWith('+')) throw err;
          res = await api.post<LoginResult>('/auth/login', { phone, code });
        }
        if (res.user.role === 'ELEVEUR') {
          clearSession();
          throw new ApiError(
            403,
            "Le site web est réservé aux propriétaires de ferme. Les éleveurs utilisent l'application mobile Fermia.",
          );
        }
        startSession(res);
      },
      register: async (input: RegisterInput) => {
        startSession(await api.post<LoginResult>('/auth/register', input));
      },
      logout: () => {
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