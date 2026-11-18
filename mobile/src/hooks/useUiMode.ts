import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/auth/AuthContext';
import { updateOwnUiMode } from '@/api/mutations';
import type { FarmMemberProfile, UiMode } from '@/api/types';
import { useFarmProfile } from './useFarmProfile';
import { resolveUiMode } from './ui-mode';

/**
 * The experience of the signed-in account. Read from the (cached, so offline
 * too) farm profile; `setOwnMode` needs the network (PATCH /auth/me/ui-mode)
 * and rejects when the server refuses (staff: 403) or is out of reach.
 */
export function useUiMode() {
  const { farmId, user } = useAuth();
  const { profile } = useFarmProfile();
  const queryClient = useQueryClient();
  const state = resolveUiMode({ profile, userRole: user.role });

  const setOwnMode = useCallback(
    async (uiMode: UiMode): Promise<void> => {
      const res = await updateOwnUiMode(uiMode);
      queryClient.setQueryData<FarmMemberProfile | null | undefined>(['farm-profile', farmId], (prev) =>
        prev ? { ...prev, uiMode: res.uiMode } : prev,
      );
      void queryClient.invalidateQueries({ queryKey: ['farm-profile', farmId] });
    },
    [queryClient, farmId],
  );

  return { simple: state.simple, mode: state.mode, canChangeOwn: state.canChangeOwn, setOwnMode };
}
