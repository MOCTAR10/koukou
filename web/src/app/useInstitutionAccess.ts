import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import type { MyAccess } from '../api/types-access';
import { useAuth } from '../auth/AuthContext';

export const MY_ACCESS_KEY = ['access-me'] as const;

/**
 * The INSTITUTION account's own access (`GET /programme/access/me`): profile,
 * matrix, scope. Nothing is fetched for other roles.
 *
 * - `access`: the answer (also the saved one, offline).
 * - `revoked`: the server refuses it (403: no active membership, suspended or
 *   past its validity), so the account reaches nothing.
 * - `pending`: an institution whose access hasn't answered yet.
 */
export function useInstitutionAccess() {
  const { user } = useAuth();
  const isInstitution = user?.role === 'INSTITUTION';
  const query = useQuery({
    queryKey: [...MY_ACCESS_KEY, user?.id],
    queryFn: () => api.get<MyAccess>('/programme/access/me'),
    enabled: isInstitution,
    staleTime: 5 * 60_000,
    // A refusal is the answer, not a hiccup: don't retry it.
    retry: (count, err) => !(err instanceof ApiError && err.status === 403) && count < 2,
  });
  const revoked = query.error instanceof ApiError && query.error.status === 403;
  return {
    isInstitution,
    access: isInstitution ? (query.data ?? null) : null,
    pending: isInstitution && query.isLoading,
    revoked: isInstitution && revoked,
    failed: isInstitution && query.isError && !revoked,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
