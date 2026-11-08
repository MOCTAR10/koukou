import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { ProphylaxisEvent } from '../../api/types-flock';
import type { FarmTask } from '../../api/types-org';
import { useFarm } from '../../app/FarmContext';
import { CompleteCareModal } from '../flock/CompleteCareModal';
import { Modal } from '../form';
import { Loading } from '../ui';

/**
 * « Terminer » on a task generated from the care calendar: opens the care's
 * own completion form (same validation, same offline queue and idempotency
 * key), prefilled with the lot and the planned care. Saving closes the task
 * on the server.
 */
export function CareTaskCompletion({
  task,
  lot,
  onClose,
}: {
  task: FarmTask;
  lot: { id: string; liveCount: number; batchName: string | null; code: string | null };
  onClose: () => void;
}) {
  const { farmId } = useFarm();
  const events = useQuery({
    queryKey: ['prophylaxis', farmId, lot.id],
    queryFn: () => api.get<ProphylaxisEvent[]>(`/farms/${farmId}/batches/${lot.id}/prophylaxis`),
    enabled: !!farmId,
  });
  const event = events.data?.find((e) => e.id === task.stepId);
  if (event) return <CompleteCareModal lot={lot} event={event} onClose={onClose} />;
  return (
    <Modal title="Soin réalisé" onClose={onClose}>
      {events.isLoading ? (
        <Loading label="Chargement du soin…" />
      ) : (
        <p className="text-sm text-slate-600">Le soin de cette tâche est introuvable : il a peut-être été supprimé.</p>
      )}
    </Modal>
  );
}
