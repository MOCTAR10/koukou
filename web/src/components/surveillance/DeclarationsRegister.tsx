import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ClipboardCheck } from 'lucide-react';
import { api } from '../../api/client';
import type { DeclarationReviewDecision, SanitaryDeclaration, SanitaryDeclarationPage } from '../../api/types-surveillance';
import { dateFr, dateTimeFr } from '../../lib/format';
import { Button, ErrorNote, Field, inputCls, Modal } from '../form';
import { LEVEL_LABEL, Note, Pill, levelTone } from '../flock/shared';
import { Card, DataTable, EmptyState, Loading, Td, Th } from '../ui';
import { DeclarationPhotos } from './DeclarationPhotos';
import { REVIEW_STATE_LABELS, REVIEW_STATE_TONES, declarationQuery, reviewFormProblem, type DeclarationFilters } from './declarationReview';
import { invalidateAlerts } from './queries';

const KEY = ['surveillance-declarations'] as const;

/**
 * POUFA lot A2 vet, CDC n° 26 « valident les événements »: the vets' register
 * of sanitary declarations. One without alert is validated, ruled out
 * (comment required) or converted into an alert, once; the farm is notified.
 * The server is the authority (SANITAIRE:VALIDER); its message shows as is.
 */
export function DeclarationsRegister({ canReview }: { canReview: boolean }) {
  const [filters, setFilters] = useState<DeclarationFilters>({ state: 'A_EXAMINER', from: '', to: '' });
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<SanitaryDeclaration | null>(null);
  const list = useQuery({
    queryKey: [...KEY, filters, offset],
    queryFn: () => api.get<SanitaryDeclarationPage>(`/surveillance/declarations?${declarationQuery(filters, offset)}`),
    placeholderData: keepPreviousData,
  });
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const set = (key: keyof DeclarationFilters, value: string) => {
    setFilters({ ...filters, [key]: value });
    setOffset(0);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 @container">
        <div className="grid gap-3 @md:grid-cols-3">
          <Field label="État">
            <select className={inputCls} value={filters.state} onChange={(e) => set('state', e.target.value)}>
              <option value="">Tous</option>
              {Object.entries(REVIEW_STATE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Déclarée du">
            <input className={inputCls} type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} />
          </Field>
          <Field label="au">
            <input className={inputCls} type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} />
          </Field>
        </div>
      </Card>
      <ErrorNote error={list.error} />
      {list.isLoading ? (
        <Loading label="Chargement des déclarations…" />
      ) : items.length === 0 ? (
        <EmptyState message="Aucune déclaration pour ces filtres." icon={<ClipboardCheck />} />
      ) : (
        <Card className="overflow-hidden">
          <DataTable>
            <thead className="bg-slate-50">
              <tr>
                <Th>Déclaration</Th>
                <Th>Ferme</Th>
                <Th className="hidden lg:table-cell">Bande</Th>
                <Th>Gravité</Th>
                <Th>État</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50" onClick={() => setOpen(d)}>
                  <Td>
                    <span className="font-semibold">{d.title}</span>
                    <span className="block text-xs text-slate-500">{dateFr(d.occurredAt)}</span>
                  </Td>
                  <Td label="Ferme">
                    {d.farmCode ? <span className="font-mono text-xs">{d.farmCode}</span> : null}
                    <span className="block">{d.farmName ?? '—'}</span>
                  </Td>
                  <Td label="Bande" className="md:max-lg:hidden">
                    {d.batchCode ? <span className="font-mono text-xs">{d.batchCode}</span> : '—'}
                  </Td>
                  <Td label="Gravité">
                    <Pill tone={levelTone(d.severity)}>{LEVEL_LABEL[d.severity] ?? d.severity}</Pill>
                  </Td>
                  <Td label="État">
                    <Pill tone={REVIEW_STATE_TONES[d.reviewState]}>{REVIEW_STATE_LABELS[d.reviewState]}</Pill>
                    {d.alertCode ? <span className="block font-mono text-xs text-slate-500">{d.alertCode}</span> : null}
                  </Td>
                  <Td className="row-chevron text-right">
                    <ChevronRight className="inline h-4 w-4 text-slate-400" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-sm text-slate-500">
            <span>
              {offset + 1}–{offset + items.length} sur {total}
            </span>
            <div className="flex gap-2">
              <Button tone="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>
                Précédentes
              </Button>
              <Button tone="secondary" disabled={offset + items.length >= total} onClick={() => setOffset(offset + 50)}>
                Suivantes
              </Button>
            </div>
          </div>
        </Card>
      )}
      {open ? <DeclarationPanel declaration={open} canReview={canReview} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function DeclarationPanel({ declaration, canReview, onClose }: { declaration: SanitaryDeclaration; canReview: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [d, setD] = useState(declaration);
  const [decision, setDecision] = useState<DeclarationReviewDecision>('VALIDEE');
  const [comment, setComment] = useState('');
  const problem = reviewFormProblem(decision, comment);
  const review = useMutation({
    mutationFn: () =>
      api.post<SanitaryDeclaration>(`/surveillance/declarations/${d.id}/review`, comment.trim() ? { decision, comment: comment.trim() } : { decision }),
    onSuccess: (fresh) => {
      setD(fresh);
      void queryClient.invalidateQueries({ queryKey: KEY });
      invalidateAlerts(queryClient);
    },
  });
  const open = d.reviewState === 'A_EXAMINER';
  return (
    <Modal side title={`Déclaration du ${dateFr(d.occurredAt)}`} onClose={onClose}>
      <div className="space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-500">Ferme</dt>
          <dd>
            {d.farmCode} {d.farmName}
          </dd>
          <dt className="text-slate-500">Bande</dt>
          <dd>{d.batchCode ?? '—'}</dd>
          <dt className="text-slate-500">Objet</dt>
          <dd className="font-semibold">{d.title}</dd>
          <dt className="text-slate-500">Animaux touchés</dt>
          <dd>{d.quantity}</dd>
          {d.symptoms ? (
            <>
              <dt className="text-slate-500">Symptômes</dt>
              <dd>{d.symptoms}</dd>
            </>
          ) : null}
          {d.description ? (
            <>
              <dt className="text-slate-500">Description</dt>
              <dd>{d.description}</dd>
            </>
          ) : null}
          {d.clinicalSigns.length > 0 ? (
            <>
              <dt className="text-slate-500">Signes cliniques</dt>
              <dd>{d.clinicalSigns.join(', ')}</dd>
            </>
          ) : null}
          <dt className="text-slate-500">Déclarée par</dt>
          <dd>{d.createdByName ?? '—'}</dd>
        </dl>
        {d.photos.length > 0 ? <DeclarationPhotos farmId={d.farmId} batchId={d.batchId} eventId={d.id} photos={d.photos} canAdd={false} canDelete={false} /> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={REVIEW_STATE_TONES[d.reviewState]}>{REVIEW_STATE_LABELS[d.reviewState]}</Pill>
          {d.alertCode ? <span className="font-mono text-sm">{d.alertCode}</span> : null}
        </div>
        {d.reviewStatus ? (
          <Note tone="slate">
            Examinée par {d.reviewedByName ?? '—'}
            {d.reviewedAt ? ` le ${dateTimeFr(d.reviewedAt)}` : ''}
            {d.reviewComment ? ` : « ${d.reviewComment} »` : '.'}
          </Note>
        ) : d.alertId ? (
          <Note tone="amber">Cette déclaration a ouvert une alerte : qualifiez-la dans l’onglet Alertes.</Note>
        ) : null}
        {open && canReview ? (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <Field label="Décision">
              <select className={inputCls} value={decision} onChange={(e) => setDecision(e.target.value as DeclarationReviewDecision)}>
                <option value="VALIDEE">Valider la déclaration</option>
                <option value="INFIRMEE">Infirmer la déclaration</option>
                <option value="ALERTE">Convertir en alerte sanitaire</option>
              </select>
            </Field>
            <Field label={decision === 'INFIRMEE' ? 'Commentaire (obligatoire)' : 'Commentaire'}>
              <textarea className={inputCls} rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
            </Field>
            {problem ? <p className="text-sm text-amber-700">{problem}</p> : null}
            <ErrorNote error={review.error} />
            <Button disabled={!!problem || review.isPending} onClick={() => review.mutate()}>
              <ClipboardCheck className="h-4 w-4" /> Enregistrer la décision
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
