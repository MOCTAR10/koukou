import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { UiMode } from '../../api/types';
import { ErrorNote } from '../form';
import { Pill } from '../org/shared';
import { UiModePicker, UI_MODE_HINT, UI_MODE_LABEL } from '../org/UiModePicker';

/**
 * « Mode d’affichage » of a person of a farm, as the programme sees it: the mode, and the
 * choice when the caller may set it (`PATCH /farms/:farmId/members/:userId/ui-mode`,
 * TECHNIQUE:VALIDER or ADMINISTRATION:ADMINISTRER, farm in scope). The server stays the authority.
 */
export function UiModeField({ farmId, userId, value, canEdit }: { farmId: string; userId: string; value: UiMode | undefined; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (uiMode: UiMode) => api.patch(`/farms/${farmId}/members/${userId}/ui-mode`, { uiMode }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['programme-farm', farmId] });
      await queryClient.invalidateQueries({ queryKey: ['programme-farm-team', farmId] });
    },
  });
  if (!value) return null;
  if (!canEdit) {
    return (
      <Pill tone={value === 'SIMPLE' ? 'amber' : 'brand'}>
        Affichage {UI_MODE_LABEL[value]} ({UI_MODE_HINT[value]})
      </Pill>
    );
  }
  return (
    <div className="space-y-1">
      <ErrorNote error={change.error} />
      <UiModePicker value={value} onChange={(mode) => change.mutate(mode)} disabled={change.isPending} />
    </div>
  );
}
