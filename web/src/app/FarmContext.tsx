import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Farm } from '../api/types';
import { useAuth } from '../auth/AuthContext';

interface FarmContextValue {
  farms: Farm[];
  farmId: string | null;
  farm: Farm | null;
  setFarm: (id: string) => void;
  /** The farm list hasn't answered yet: farmId may still be about to change. */
  farmsLoading: boolean;
  /** The farm list could not be read (offline before any load, server error). */
  farmsFailed: boolean;
  refetchFarms: () => void;
}

const FarmContext = createContext<FarmContextValue | null>(null);

const STORAGE_KEY = 'koukou.farmId';

export function FarmProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [farmId, setFarmId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );

  const {
    data: farms = [],
    isLoading: farmsLoading,
    isError: farmsFailed,
    refetch,
  } = useQuery({
    queryKey: ['farms'],
    queryFn: () => api.get<Farm[]>('/farms'),
    enabled: !!user,
  });

  useEffect(() => {
    if (farms.length > 0 && (!farmId || !farms.some((f) => f.id === farmId))) {
      const next = farms[0]?.id ?? null;
      setFarmId(next);
      localStorage.setItem(STORAGE_KEY, next ?? '');
    }
  }, [farms, farmId]);

  const value = useMemo<FarmContextValue>(
    () => ({
      farms,
      farmId,
      farm: farms.find((f) => f.id === farmId) ?? null,
      setFarm: (id: string) => {
        setFarmId(id);
        localStorage.setItem(STORAGE_KEY, id);
      },
      farmsLoading,
      farmsFailed,
      refetchFarms: () => void refetch(),
    }),
    [farms, farmId, farmsLoading, farmsFailed, refetch],
  );

  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>;
}

export function useFarm(): FarmContextValue {
  const ctx = useContext(FarmContext);
  if (!ctx) throw new Error('useFarm doit être utilisé dans <FarmProvider>.');
  return ctx;
}