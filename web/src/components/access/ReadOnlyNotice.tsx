import { Eye } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useFarm } from '../../app/FarmContext';

/**
 * POUFA lot A droits: banner of a Fermia module page an institution opens in
 * consultation (cash, sales, Market, accounting, HR of a farm in its scope).
 * The server gives it no write code on these domains, so the page shows no
 * write button; this says so, and that the read is journaled.
 */
export function ReadOnlyNotice({ what }: { what?: string }) {
  const { user } = useAuth();
  const { farm } = useFarm();
  if (user?.role !== 'INSTITUTION') return null;
  return (
    <p className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800 ring-1 ring-sky-200">
      <Eye className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        Consultation seule{what ? ` : ${what}` : ''}
        {farm ? ` de la ferme ${farm.name}` : ''}. Les saisies restent celles de la ferme ; votre consultation est inscrite au journal d’audit.
      </span>
    </p>
  );
}

/** Whether the signed-in account is an institutional one (read-only on the Fermia modules). */
export function useIsInstitution(): boolean {
  return useAuth().user?.role === 'INSTITUTION';
}
