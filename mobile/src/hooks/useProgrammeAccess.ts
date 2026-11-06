import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/auth/AuthContext';
import { fetchProgrammeAccessMe, type AccessMatrix } from '@/api/poufa';
import { cachedRead } from '@/offline/ref-cache';

/**
 * Access matrix of an institutional account (`GET /programme/access/me`,
 * kept for offline starts). Null for every other account: their rights are
 * the farm profile's codes (`useFarmProfile`).
 */
export function useProgrammeAccess(): { matrix: AccessMatrix | null; profileCode: string | null; isLoading: boolean } {
  const { user, signedIn } = useAuth();
  const institution = signedIn && user.role === 'INSTITUTION';
  const query = useQuery({
    queryKey: ['programme-access-me', user.id],
    queryFn: () => cachedRead('programme-access-me', fetchProgrammeAccessMe),
    enabled: institution,
    staleTime: 5 * 60_000,
  });
  return {
    matrix: institution ? (query.data?.profile.matrix ?? null) : null,
    profileCode: institution ? (query.data?.profile.code ?? null) : null,
    isLoading: institution && query.isLoading,
  };
}
