import { AlertTriangle } from 'lucide-react';
import { ApiError } from '../../api/client';
import { ErrorNote } from '../form';

/**
 * A refused step: a 409 is the step order (`import-job-rules.ts`
 * `stepRefusal`, French) or a change made meanwhile; other errors as usual.
 */
export function StepError({ error }: { error: unknown }) {
  if (!error) return null;
  if (error instanceof ApiError && error.status === 409) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200" role="alert">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <b>Étape refusée dans cet ordre.</b> {error.message} La fiche est rechargée avec son état actuel.
        </span>
      </div>
    );
  }
  return <ErrorNote error={error} />;
}
