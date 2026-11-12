import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, FARM_KEY } from '../api/client';
import type { Farm } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { defaultFarmId } from './default-farm';
import { scopeReachesFarms } from './menu-access';
import { useInstitutionAccess } from './useInstitutionAccess';

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

const STORAGE_KEY = FARM_KEY;

export function FarmProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [farmId, setFarmId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );

  // A sign-in or sign-out wiped the stored farm: drop the previous account's farm held in memory.
  const userId = user?.id ?? null;
  useEffect(() => {
    setFarmId(localStorage.getItem(STORAGE_KEY) || null);
  }, [userId]);

  // An institution whose scope reaches no farm (aggregate, audit, financed)
  // would only get a 403, journaled: it never asks for the list.
  const inst = useInstitutionAccess();
  const noFarmScope = !!inst.access && !scopeReachesFarms(inst.access.profile.scopeKind);
  const {
    data: farms = [],
    isLoading: listLoading,
    isError: farmsFailed,
    refetch,
  } = useQuery({
    queryKey: ['farms'],
    queryFn: () => api.get<Farm[]>('/farms'),
    enabled: !!user && !noFarmScope && !inst.pending && !inst.revoked,
  });
  const farmsLoading = listLoading || inst.pending;

  useEffect(() => {
    if (farms.length > 0 && (!farmId || !farms.some((f) => f.id === farmId))) {
      const next = defaultFarmId(farms);
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