import { UserCheck } from 'lucide-react';
import { useFarm } from '../../app/FarmContext';
import { useFarmProfile } from '../../app/useFarmProfile';

/** Fields the server adds to a row entered on behalf of a farm (jury lot 5). */
export interface DelegatedAuthor {
  enteredOnBehalf?: boolean;
  enteredByName?: string | null;
  enteredByProfile?: string | null;
}

/** « Saisi par X (profil) pour le compte de la ferme », nothing for the farm's own rows. */
export function delegatedLabel(row: DelegatedAuthor): string | null {
  if (!row.enteredOnBehalf) return null;
  const who = row.enteredByName ?? 'un agent du programme';
  return `Saisi par ${who}${row.enteredByProfile ? ` (${row.enteredByProfile})` : ''} pour le compte de la ferme`;
}

/** Small badge shown next to an entry or a declaration made by a technical agent for the farm. */
export function DelegatedBadge({ row, className = '' }: { row: DelegatedAuthor; className?: string }) {
  const label = delegatedLabel(row);
  if (!label) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ${className}`}
      title={label}
    >
      <UserCheck className="h-3 w-3 shrink-0" aria-hidden />
      {label}
    </span>
  );
}

/** Banner of the entry and declaration forms when an institutional account enters data for the farm. */
export function DelegatedBanner() {
  const { farm } = useFarm();
  const { isInstitution } = useFarmProfile();
  if (!isInstitution) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800" role="note">
      <UserCheck className="h-4 w-4 shrink-0" aria-hidden />
      <span>
        Vous saisissez pour le compte de <strong>{farm?.name ?? 'la ferme'}</strong>. La saisie sera marquée comme faite par vous
        (agent du programme) et journalisée.
      </span>
    </div>
  );
}
