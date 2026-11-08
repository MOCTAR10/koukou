import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import type { FarmWithLogo } from '../../api/types-org';
import { useFarmProfile } from '../../app/useFarmProfile';
import { parseOptionalCount } from '../../lib/credit';
import { Button, ErrorNote, Field, inputCls } from '../form';
import { Card } from '../ui';

/**
 * Farm-wide credit defaults, applied to every customer without a ceiling or a
 * payment term of their own. Blank = no ceiling / no term.
 */
export function FarmCreditCard({ farm }: { farm: FarmWithLogo }) {
  const canEdit = useFarmProfile().hasPermission('reglages:ferme');
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState(farm.defaultCreditLimitFcfa != null ? String(farm.defaultCreditLimitFcfa) : '');
  const [term, setTerm] = useState(farm.defaultPaymentTermDays != null ? String(farm.defaultPaymentTermDays) : '');
  const limitValue = parseOptionalCount(limit);
  const termValue = parseOptionalCount(term);
  const invalid = Number.isNaN(limitValue) || Number.isNaN(termValue);
  const dirty = limitValue !== (farm.defaultCreditLimitFcfa ?? null) || termValue !== (farm.defaultPaymentTermDays ?? null);

  const save = useMutation({
    mutationFn: () => api.patch<FarmWithLogo>(`/farms/${farm.id}`, { defaultCreditLimitFcfa: limitValue, defaultPaymentTermDays: termValue }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['farms'] }),
  });

  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm text-slate-500">
        Valeurs appliquées aux clients qui n’ont pas de plafond ni de délai propres. Une vente ou une commande à crédit qui ferait dépasser le plafond est refusée ; une facture non payée au-delà du délai est « en retard » et lève une alerte.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plafond de crédit par défaut (FCFA)" hint="Vide = pas de plafond.">
          <input className={inputCls} inputMode="numeric" disabled={!canEdit} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </Field>
        <Field label="Délai de paiement par défaut (jours)" hint="Vide = pas de délai (jamais en retard).">
          <input className={inputCls} inputMode="numeric" disabled={!canEdit} value={term} onChange={(e) => setTerm(e.target.value)} />
        </Field>
      </div>
      <ErrorNote error={save.error} />
      {canEdit ? (
        <div className="flex items-center justify-end gap-3">
          {save.isSuccess && !dirty ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
              <Check className="h-3.5 w-3.5" /> Enregistré
            </span>
          ) : null}
          <Button busy={save.isPending} disabled={!dirty || invalid} onClick={() => save.mutate()}>
            Enregistrer
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
