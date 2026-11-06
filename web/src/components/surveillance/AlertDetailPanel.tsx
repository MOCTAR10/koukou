import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Megaphone } from 'lucide-react';
import { api } from '../../api/client';
import type { RefItem } from '../../api/types-programme';
import type { SanitaryAlertDetail } from '../../api/types-surveillance';
import { Button, ErrorNote, Field, Modal, inputCls } from '../form';
import { Note } from '../flock/shared';
import { Loading } from '../ui';
import { AlertFacts, TransitionTimeline } from './AlertParts';
import {
  COMMENT_MIN_LENGTH,
  familyLabel,
  nextStatuses,
  publicationProblem,
  requiresComment,
  transitionBody,
  transitionProblem,
} from './alertRules';
import { SURVEILLANCE_KEYS, invalidateAlerts } from './queries';
import type { SurveillanceRights } from './surveillanceAccess';

/**
 * One official alert, programme side (`Modal side`): facts, history with its
 * authors, the next move of the circuit and the publication. Actions show
 * only to whom the matrix and the declarations rule open them; the server's
 * 400/403/409 message is shown as is.
 */
export function AlertDetailPanel({
  alertId,
  rights,
  statuses,
  signs,
  onClose,
}: {
  alertId: string;
  rights: SurveillanceRights;
  statuses: RefItem[];
  signs: RefItem[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: SURVEILLANCE_KEYS.alert(alertId),
    // Decisions are taken on the current state, never on a saved copy.
    queryFn: () => api.getFresh<SanitaryAlertDetail>(`/surveillance/alerts/${alertId}`),
  });
  const alert = detail.data;
  const [targetCode, setTargetCode] = useState('');
  const [comment, setComment] = useState('');
  const [publishComment, setPublishComment] = useState('');
  const [confirmPublish, setConfirmPublish] = useState(false);

  const store = (fresh: SanitaryAlertDetail) => {
    queryClient.setQueryData(SURVEILLANCE_KEYS.alert(alertId), fresh);
    invalidateAlerts(queryClient);
  };

  const options = alert ? nextStatuses(alert, statuses) : [];
  const target = options.find((s) => s.code === targetCode) ?? null;
  const problem = transitionProblem(target, comment);

  const move = useMutation({
    mutationFn: () => api.post<SanitaryAlertDetail>(`/surveillance/alerts/${alertId}/transitions`, transitionBody(target!, comment)),
    onSuccess: (fresh) => {
      store(fresh);
      setTargetCode('');
      setComment('');
    },
  });
  const publish = useMutation({
    mutationFn: () => {
      const text = publishComment.trim();
      return api.post<SanitaryAlertDetail>(`/surveillance/alerts/${alertId}/publish`, text ? { comment: text } : {});
    },
    onSuccess: (fresh) => {
      store(fresh);
      setConfirmPublish(false);
      setPublishComment('');
    },
  });

  const closed = alert?.statusFamily === 'CLOSE';
  const pubProblem = alert ? publicationProblem(alert) : null;

  return (
    <Modal side wide title={alert ? `Alerte ${alert.code}` : 'Alerte sanitaire'} onClose={onClose}>
      {detail.isLoading ? <Loading /> : null}
      <ErrorNote error={detail.error} />
      {alert ? (
        <div className="space-y-6">
          <AlertFacts alert={alert} statuses={statuses} signs={signs} />

          {/* POUFA lot A sante: CDC n° 25-26, the platform admin reads only. */}
          {!rights.qualify && !rights.publish && !closed ? (
            <Note tone="slate">
              Qualification et publication réservées à l’autorité vétérinaire (droits Sanitaire : Modifier et Valider).
            </Note>
          ) : null}

          {rights.qualify && !closed ? (
            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700">Qualifier l’alerte</h3>
              {options.length === 0 ? (
                <Note tone="amber">Aucun statut suivant actif dans la liste STATUT_ALERTE : ajoutez-en un dans les paramètres.</Note>
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!problem) move.mutate();
                  }}
                >
                  <Field label="Nouveau statut *">
                    <select className={inputCls} value={targetCode} onChange={(e) => setTargetCode(e.target.value)}>
                      <option value="">Choisir…</option>
                      {options.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.label} ({familyLabel(s.family ?? '')})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={requiresComment(target?.family) ? 'Commentaire *' : 'Commentaire'}
                    hint={requiresComment(target?.family) ? `Obligatoire pour confirmer ou infirmer (${COMMENT_MIN_LENGTH} caractères au moins).` : undefined}
                  >
                    <textarea className={inputCls} rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
                  </Field>
                  {target && problem ? <p className="text-xs text-amber-700">{problem}</p> : null}
                  <ErrorNote error={move.error} />
                  <div className="flex justify-end">
                    <Button type="submit" busy={move.isPending} disabled={!!problem}>
                      <ArrowRight className="h-4 w-4" /> Changer le statut
                    </Button>
                  </div>
                </form>
              )}
            </section>
          ) : null}

          {rights.publish && !alert.published ? (
            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700">Publication</h3>
              {pubProblem ? (
                <p className="text-sm text-slate-500">{pubProblem} Une alerte publiée devient visible des tableaux de bord du programme.</p>
              ) : confirmPublish ? (
                <div className="space-y-3">
                  <Note tone="amber">
                    Publier rend l’alerte visible de tous les profils du programme et des tableaux de bord. Une publication ne se retire pas.
                  </Note>
                  <Field label="Commentaire de publication">
                    <textarea className={inputCls} rows={2} maxLength={2000} value={publishComment} onChange={(e) => setPublishComment(e.target.value)} />
                  </Field>
                  <ErrorNote error={publish.error} />
                  <div className="flex justify-end gap-2">
                    <Button tone="secondary" onClick={() => setConfirmPublish(false)} disabled={publish.isPending}>
                      Retour
                    </Button>
                    <Button busy={publish.isPending} onClick={() => publish.mutate()}>
                      <Megaphone className="h-4 w-4" /> Publier
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => setConfirmPublish(true)}>
                  <Megaphone className="h-4 w-4" /> Publier l’alerte confirmée
                </Button>
              )}
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Historique</h3>
            <TransitionTimeline transitions={alert.transitions} statuses={statuses} />
          </section>
        </div>
      ) : null}
    </Modal>
  );
}
