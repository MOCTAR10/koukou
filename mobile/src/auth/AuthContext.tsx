import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { apiFetch, ApiError } from '@/api/client';
import { clearSession, loadSession, saveSession, type StoredSession } from '@/api/token';
import { clearQueue } from '@/offline';
import type { Farm, PublicUser } from '@/api/types';

const EMPTY_USER: PublicUser = { id: '', fullName: '', phone: '', role: 'PROPRIETAIRE' };

export type AuthMode = 'live';
export type FarmMode = 'aviculture' | 'agriculture';

interface AuthContextValue {
  mode: AuthMode;
  /** Domaine d'exploitation actif (élevage / agriculture), persisté par session. */
  farmMode: FarmMode;
  signedIn: boolean;
  user: PublicUser;
  farms: Farm[];
  farmId: string;
  activeFarmId: string;
  busy: boolean;
  error: string | null;
  setActiveFarmId: (farmId: string) => void;
  setFarmMode: (farmMode: FarmMode) => void;
  signIn: (phone: string, code: string) => Promise<boolean>;
  signUp: (phone: string, fullName: string, code: string, farmName?: string) => Promise<boolean>;
  signOut: () => void;
  /** Recharge /farms et met à jour la session (après renommage / logo). */
  refreshFarms: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<StoredSession | null>(() => loadSession());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const signIn = useCallback(
    async (phone: string, code: string): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const res = await apiFetch<{ accessToken: string; user: PublicUser }>('/auth/login', {
          method: 'POST',
          body: { phone, code },
        });
        const next: StoredSession = { token: res.accessToken, user: res.user, farms: [] };
        saveSession(next);
        const farms = await apiFetch<Farm[]>('/farms');
        const full: StoredSession = { ...next, farms };
        saveSession(full);
        setSession(full);
        void queryClient.invalidateQueries();
        return true;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erreur inconnue lors de la connexion.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [queryClient],
  );

  const signUp = useCallback(
    async (phone: string, fullName: string, code: string, farmName?: string): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const res = await apiFetch<{ accessToken: string; user: PublicUser }>('/auth/register', {
          method: 'POST',
          body: { phone, fullName, code, farmName: farmName?.trim() || undefined },
        });
        const next: StoredSession = { token: res.accessToken, user: res.user, farms: [] };
        saveSession(next);
        const farms = await apiFetch<Farm[]>('/farms');
        const full: StoredSession = { ...next, farms };
        saveSession(full);
        setSession(full);
        void queryClient.invalidateQueries();
        return true;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erreur inconnue lors de l’inscription.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [queryClient],
  );

  const signOut = useCallback(() => {
    clearSession();
    clearQueue();
    setSession(null);
    setError(null);
    void queryClient.invalidateQueries();
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

  const setFarmMode = useCallback(
    (farmMode: FarmMode) => {
      setSession((prev) => {
        if (!prev?.token) return prev;
        const next: StoredSession = { ...prev, mode: farmMode };
        saveSession(next);
        return next;
      });
    },
    [],
  );

  const refreshFarms = useCallback(async () => {
    setSession((prev) => {
      if (!prev?.token) return prev;
      void apiFetch<Farm[]>('/farms')
        .then((farms) => {
          const next: StoredSession = { ...prev, farms };
          saveSession(next);
          setSession((cur) => (cur?.token === prev.token ? next : cur));
        })
        .catch(() => undefined);
      return prev;
    });
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const signedIn = Boolean(session?.token);
    const activeFarmId = session?.activeFarmId ?? session?.farms[0]?.id ?? '';
    return {
      mode: 'live',
      farmMode: session?.mode ?? 'aviculture',
      signedIn,
      user: session?.user ?? EMPTY_USER,
      farms: session?.farms ?? [],
      farmId: activeFarmId,
      activeFarmId,
      busy,
      error,
      signIn,
      signUp,
      signOut,
      setActiveFarmId,
      setFarmMode,
      refreshFarms,
    };
  }, [session, busy, error, signIn, signUp, signOut, setActiveFarmId, setFarmMode, refreshFarms]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return ctx;
}