import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Customer } from '../../api/types';
import { useFarmProfile } from '../../app/useFarmProfile';
import { ErrorNote, Field, inputCls } from '../form';
import { useOperators } from './queries';

/**
 * Links a farm customer to a programme operator (POUFA traceability,
 * `PATCH /farms/:farmId/customers/:id { operatorId }`, null unlinks). The
 * server accepts an active operator of the farm's programme only.
 */
export function CustomerOperatorField({ farmId, customer }: { farmId: string | null; customer: Pick<Customer, 'id' | 'operatorId'> }) {
  const qc = useQueryClient();
  const { hasPermission } = useFarmProfile();
  const operators = useOperators();
  const link = useMutation({
    mutationFn: (operatorId: string | null) => api.patch<Customer>(`/farms/${farmId}/customers/${customer.id}`, { operatorId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers', farmId] });
      void qc.invalidateQueries({ queryKey: ['customers-summary', farmId] });
    },
  });
  const rows = operators.data ?? [];
  // Nothing to offer on a farm outside the programme registry, unless a link already exists.
  if (!farmId || (rows.length === 0 && !customer.operatorId)) return null;
  const current = link.isPending ? (link.variables ?? '') : (link.data ? (link.data.operatorId ?? '') : (customer.operatorId ?? ''));

  return (
    <div className="space-y-2">
      <Field label="Opérateur du programme (traçabilité)" hint="Abattoir, acheteur, distributeur… du registre national." className="max-w-md">
        <select
          className={inputCls}
          value={current}
          disabled={link.isPending || !hasPermission('compta:client')}
          onChange={(e) => link.mutate(e.target.value || null)}
        >
          <option value="">Aucun</option>
          {customer.operatorId && !rows.some((o) => o.id === customer.operatorId) ? <option value={customer.operatorId}>Opérateur désactivé</option> : null}
          {rows.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · {o.typeLabel ?? o.typeCode}
            </option>
          ))}
        </select>
      </Field>
      <ErrorNote error={link.error ?? operators.error} />
    </div>
  );
}
