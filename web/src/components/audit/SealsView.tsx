import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { api } from '../../api/client';
import type { AuditSeal, SealVerification } from '../../api/types-admin';
import { dateFr, dateTimeFr, num } from '../../lib/format';
import { Note } from '../flock/shared';
import { Button, ErrorNote, Field, inputCls, DateInput } from '../form';
import { Card, DataTable, EmptyState, Loading, Td, Th } from '../ui';
import { sealVerdict, shortHash, verifyBody } from './audit';

/**
 * Daily seals: each elapsed UTC day gets a SHA-256 over the previous seal and
 * every row of the day. « Vérifier » recomputes them and reports the first
 * mismatch (count, hash, chain, missing day) or that the journal is intact.
 */
export function SealsView() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [listRange, setListRange] = useState({ from: '', to: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const qs = new URLSearchParams({ ...(listRange.from ? { from: listRange.from } : {}), ...(listRange.to ? { to: listRange.to } : {}) }).toString();
  const seals = useQuery({
    queryKey: ['audit-seals', qs],
    queryFn: () => api.getFresh<AuditSeal[]>(`/audit/seals${qs ? `?${qs}` : ''}`),
  });
  const verify = useMutation({ mutationFn: (body: { from?: string; to?: string }) => api.post<SealVerification>('/audit/seals/verify', body) });

  const run = () => {
    const body = verifyBody(from, to);
    if ('error' in body) return setFormError(body.error);
    setFormError(null);
    setListRange({ from, to });
    verify.mutate(body);
  };
  const verdict = verify.data ? sealVerdict(verify.data) : null;

  return (
    <div className="space-y-4">
      <Note tone="slate" icon={<ShieldCheck />}>
        Chaque jour (UTC) est scellé 15 minutes après sa fin : une empreinte SHA-256 calculée sur le sceau de la veille et sur toutes les lignes du
        jour. Une ligne retirée, modifiée ou antidatée change l’empreinte recalculée. La méthode de calcul est documentée pour l’ANINF
        (docs/audit-deploiement.md).
      </Note>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Du">
            <DateInput className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Au (inclus)">
            <DateInput className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Button busy={verify.isPending} onClick={run}>
            <ShieldQuestion className="h-4 w-4" /> Vérifier
          </Button>
        </div>
        <p className="text-xs text-slate-500">Sans date : tous les sceaux, et les lignes antérieures au premier sceau.</p>
        <ErrorNote error={formError ?? verify.error} />
        {verdict ? (
          <div
            className={
              verdict.tone === 'emerald'
                ? 'flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200'
                : verdict.tone === 'red'
                  ? 'flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200'
                  : 'flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200'
            }
            role="status"
          >
            {verdict.tone === 'emerald' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}
            <div className="min-w-0 space-y-1">
              <p className="font-semibold">{verdict.title}</p>
              <p>{verdict.detail}</p>
              {verify.data?.mismatch && (verify.data.mismatch.expected !== undefined || verify.data.mismatch.actual !== undefined) ? (
                <p className="break-all font-mono text-xs">
                  attendu {JSON.stringify(verify.data.mismatch.expected)} · trouvé {JSON.stringify(verify.data.mismatch.actual)}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>

      <ErrorNote error={seals.error} />
      <Card className="overflow-hidden">
        {seals.isLoading ? (
          <div className="p-4">
            <Loading />
          </div>
        ) : !seals.data?.length ? (
          <div className="p-4">
            <EmptyState icon={<ShieldCheck />} message="Aucun sceau sur cette période." />
          </div>
        ) : (
          <DataTable>
            <thead className="bg-slate-50">
              <tr>
                <Th>Jour (UTC)</Th>
                <Th>Actions</Th>
                <Th>Lignes de données</Th>
                <Th>Empreinte</Th>
                <Th className="hidden lg:table-cell">Sceau précédent</Th>
                <Th className="hidden lg:table-cell">Scellé le</Th>
              </tr>
            </thead>
            <tbody>
              {seals.data.map((s) => (
                <tr key={s.day} className="border-t border-slate-100">
                  <Td>
                    <span className="font-medium text-slate-900">{dateFr(s.day)}</span>
                    <span className="block font-mono text-[11px] text-slate-400">{s.day}</span>
                  </Td>
                  <Td label="Actions">
                    <span className="tabular-nums">{num(s.eventsCount, 0)}</span>
                  </Td>
                  <Td label="Lignes de données">
                    <span className="tabular-nums">{num(s.rowChangesCount, 0)}</span>
                  </Td>
                  <Td label="Empreinte">
                    <span className="font-mono text-xs" title={s.hash}>
                      {shortHash(s.hash)}
                    </span>
                  </Td>
                  <Td label="Sceau précédent" className="md:max-lg:hidden">
                    <span className="font-mono text-xs text-slate-500" title={s.prevHash ?? ''}>
                      {s.prevHash ? shortHash(s.prevHash) : 'premier sceau'}
                    </span>
                  </Td>
                  <Td label="Scellé le" className="md:max-lg:hidden">
                    {s.sealedAt ? dateTimeFr(s.sealedAt) : '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </div>
  );
}
