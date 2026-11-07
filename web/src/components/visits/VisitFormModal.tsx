import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, X } from 'lucide-react';
import type { BiosecurityAnswer, CreateVisitBody, VisitType, VisitView } from '../../api/types-visits';
import { Note, Pill, lotName, useLots } from '../flock/shared';
import { Button, DateInput, ErrorNote, Field, FormColumns, inputCls, Modal, todayIso } from '../form';
import { dateFr } from '../../lib/format';
import { useIdempotencyKey } from '../../lib/idempotency';
import { sendOrQueue, showQueuedNotice, useOnline } from '../../offline';
import { PHOTO_ACCEPT, sizeFr } from '../surveillance/declaration';
import { VISIT_PHOTOS_MAX, splitVisitPhotos, uploadVisitPhotos } from './VisitPhotos';
import { invalidateVisits, useVisitGrid } from './queries';
import { ANSWER_LABEL, CLASS_LABEL, VISIT_TYPE_LABEL, classOf, classTone, groupByCategory, scoreLabel, scoreOf, visaError } from './visitRules';

const ANSWERS: BiosecurityAnswer[] = ['CONFORME', 'NON_CONFORME', 'NA'];

/**
 * Records a visit (CDC n° 45) with its biosecurity grid (n° 27) and the agent's
 * visa of a period of the band's records (§3.2). The score and class shown are
 * a preview with the weights and thresholds served by the grid: the server
 * recomputes and stores them. Offline-capable like the phone: the visit and its
 * grid answers go through the offline queue (keyed, the grid comes from the
 * read cache); photos need a connection (files are not queued on the web) and
 * are sent right after the visit, or from its detail later.
 */
export function VisitFormModal({ farmId, onClose, onSaved }: { farmId: string; onClose: () => void; onSaved: (v: VisitView) => void }) {
  const qc = useQueryClient();
  const grid = useVisitGrid(farmId);
  const lots = useLots();
  const key = useIdempotencyKey('visit');
  const [type, setType] = useState<VisitType>('TECHNIQUE');
  const [visitDate, setVisitDate] = useState(todayIso());
  const [batchId, setBatchId] = useState('');
  const [observations, setObservations] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [nextVisitDate, setNextVisitDate] = useState('');
  const [visaFrom, setVisaFrom] = useState('');
  const [visaTo, setVisaTo] = useState('');
  const [answers, setAnswers] = useState<Record<string, BiosecurityAnswer | undefined>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const online = useOnline();
  const picker = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoNotes, setPhotoNotes] = useState<string[]>([]);
  const [saved, setSaved] = useState<{ visit: VisitView; failed: string[] } | null>(null);

  const criteria = grid.data?.criteria ?? [];
  const thresholds = grid.data?.thresholds ?? { a: 80, b: 60 };
  const score = useMemo(() => scoreOf(criteria, answers), [criteria, answers]);
  const klass = classOf(score, thresholds);
  const band = (lots.data ?? []).find((l) => l.id === batchId) ?? null;

  const save = useMutation({
    mutationFn: (body: CreateVisitBody) =>
      sendOrQueue<VisitView>({
        kind: 'visit',
        farmId,
        path: `/farms/${farmId}/visits`,
        body,
        label: `Visite · ${VISIT_TYPE_LABEL[body.type]} · ${dateFr(body.visitDate)}`,
      }),
    onSuccess: async (res) => {
      key.settle();
      invalidateVisits(qc, farmId);
      if (res.status === 'queued') {
        showQueuedNotice(
          photos.length > 0
            ? 'Visite enregistrée hors ligne : elle sera envoyée au retour de la connexion. Ajoutez ses photos depuis son détail une fois envoyée.'
            : 'Visite enregistrée hors ligne : elle sera envoyée au retour de la connexion.',
        );
        onClose();
        return;
      }
      const failed = photos.length > 0 ? await uploadVisitPhotos(farmId, res.data.id, photos) : [];
      if (failed.length > 0) {
        // The visit exists: say which photos did not go, the detail lets the agent add them again.
        setSaved({ visit: res.data, failed });
        return;
      }
      onSaved(res.data);
    },
  });

  const pickPhotos = (files: File[]) => {
    const { accepted, refused } = splitVisitPhotos(files, photos.length);
    setPhotos((cur) => [...cur, ...accepted]);
    setPhotoNotes(refused);
    if (picker.current) picker.current.value = '';
  };

  const submit = () => {
    const refusal = visaError({ visitDate, batchId, visaFrom, visaTo, bandStart: band?.integrationDate });
    if (refusal) return setLocalError(refusal);
    if (nextVisitDate && nextVisitDate < visitDate) return setLocalError('La prochaine visite ne peut pas précéder la visite.');
    const graded = criteria.filter((c) => answers[c.code]);
    if (type === 'BIOSECURITE' && !graded.some((c) => answers[c.code] !== 'NA')) {
      return setLocalError('Un contrôle de biosécurité évalue au moins un critère de la grille.');
    }
    setLocalError(null);
    const body: CreateVisitBody = {
      visitDate,
      type,
      ...(batchId ? { batchId } : {}),
      ...(observations.trim() ? { observations: observations.trim() } : {}),
      ...(recommendations.trim() ? { recommendations: recommendations.trim() } : {}),
      ...(nextVisitDate ? { nextVisitDate } : {}),
      ...(visaFrom && visaTo ? { visaFrom, visaTo } : {}),
      answers: graded.map((c) => ({
        criterionCode: c.code,
        answer: answers[c.code] as BiosecurityAnswer,
        ...(comments[c.code]?.trim() ? { comment: comments[c.code].trim() } : {}),
      })),
      capturedAt: new Date().toISOString(),
    };
    // The capture time changes at every click: the key follows the content, not the clock.
    save.mutate({ ...body, idempotencyKey: key.keyFor({ ...body, capturedAt: undefined }) });
  };

  if (saved) {
    return (
      <Modal title="Visite enregistrée" onClose={() => onSaved(saved.visit)}>
        <div className="space-y-4">
          <Note tone="amber">
            <span className="block font-medium">La visite est enregistrée, mais certaines photos n’ont pas été envoyées :</span>
            {saved.failed.map((f) => (
              <span key={f} className="block">
                {f}
              </span>
            ))}
            <span className="block">Vous pouvez les ajouter depuis le détail de la visite.</span>
          </Note>
          <div className="flex justify-end">
            <Button onClick={() => onSaved(saved.visit)}>Ouvrir la visite</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Nouvelle visite" onClose={onClose} large>
      <div className="space-y-4">
        <FormColumns>
          <Field label="Type de visite">
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as VisitType)}>
              {(Object.keys(VISIT_TYPE_LABEL) as VisitType[]).map((t) => (
                <option key={t} value={t}>
                  {VISIT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Jour de la visite">
            <DateInput value={visitDate} max={todayIso()} onChange={(e) => setVisitDate(e.target.value)} />
          </Field>
          <Field label="Bande concernée (facultatif)">
            <select className={inputCls} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              <option value="">Toute la ferme</option>
              {(lots.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {lotName(l)} · {dateFr(l.integrationDate)}{l.status === 'CLOTURE' ? ' (clôturée)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prochaine visite (facultatif)">
            <DateInput value={nextVisitDate} min={visitDate} onChange={(e) => setNextVisitDate(e.target.value)} />
          </Field>
          <Field label="Observations" className="lg:col-span-2">
            <textarea className={inputCls} rows={3} maxLength={4000} value={observations} onChange={(e) => setObservations(e.target.value)} />
          </Field>
          <Field label="Recommandations" className="lg:col-span-2">
            <textarea className={inputCls} rows={3} maxLength={4000} value={recommendations} onChange={(e) => setRecommendations(e.target.value)} />
          </Field>
        </FormColumns>

        <section className="space-y-2 rounded-xl border border-slate-200 p-3">
          <h3 className="text-sm font-semibold text-slate-800">Visa des saisies de la bande</h3>
          <p className="text-xs text-slate-500">Si vous avez vérifié sur place les saisies quotidiennes de la bande, indiquez la période vérifiée (la bande est alors obligatoire).</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Du">
              <DateInput value={visaFrom} max={visitDate} onChange={(e) => setVisaFrom(e.target.value)} />
            </Field>
            <Field label="Au">
              <DateInput value={visaTo} max={visitDate} onChange={(e) => setVisaTo(e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Grille de biosécurité</h3>
            <div className="flex items-center gap-2 text-sm">
              <span className="tabular-nums font-semibold">{scoreLabel(score)}</span>
              {klass ? <Pill tone={classTone(klass)}>{CLASS_LABEL[klass]}</Pill> : null}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Classe A à partir de {thresholds.a} %, B à partir de {thresholds.b} % (seuils du programme). « Sans objet » sort le critère du calcul.
          </p>
          {grid.isLoading ? <p className="text-sm text-slate-500">Chargement de la grille…</p> : null}
          <ErrorNote error={grid.error} />
          {groupByCategory(criteria).map((g) => (
            <div key={g.category} className="space-y-1">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.category}</h4>
              <ul className="divide-y divide-slate-100">
                {g.items.map((c) => (
                  <li key={c.code} className="space-y-1 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-slate-800">
                        {c.label} <span className="text-xs text-slate-400">(poids {c.weight})</span>
                      </span>
                      <div className="flex gap-1" role="group" aria-label={c.label}>
                        {ANSWERS.map((a) => (
                          <button
                            key={a}
                            type="button"
                            aria-pressed={answers[c.code] === a}
                            onClick={() => setAnswers((prev) => ({ ...prev, [c.code]: prev[c.code] === a ? undefined : a }))}
                            className={
                              answers[c.code] === a
                                ? 'rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white'
                                : 'rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                            }
                          >
                            {ANSWER_LABEL[a]}
                          </button>
                        ))}
                      </div>
                    </div>
                    {answers[c.code] === 'NON_CONFORME' ? (
                      <input
                        className={inputCls}
                        placeholder="Constat (facultatif)"
                        maxLength={500}
                        value={comments[c.code] ?? ''}
                        onChange={(e) => setComments((prev) => ({ ...prev, [c.code]: e.target.value }))}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="space-y-2 rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">
              Photos ({photos.length}/{VISIT_PHOTOS_MAX})
            </h3>
            <input ref={picker} type="file" accept={PHOTO_ACCEPT} multiple className="hidden" onChange={(e) => pickPhotos(Array.from(e.target.files ?? []))} />
            <Button tone="secondary" disabled={!online || photos.length >= VISIT_PHOTOS_MAX} onClick={() => picker.current?.click()}>
              <Camera className="h-4 w-4" /> Ajouter des photos
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            {online
              ? 'PNG, JPEG ou WEBP, 5 Mo au plus par photo. Elles partent juste après la visite.'
              : 'Hors ligne : la visite et sa grille partiront au retour de la connexion ; les photos s’ajoutent ensuite depuis le détail de la visite.'}
          </p>
          {photoNotes.length > 0 ? (
            <Note tone="amber">
              {photoNotes.map((r) => (
                <span key={r} className="block">
                  {r}
                </span>
              ))}
            </Note>
          ) : null}
          {photos.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {photos.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                  {f.name} · {sizeFr(f.size)}
                  <button type="button" aria-label={`Retirer ${f.name}`} className="rounded p-0.5 text-slate-400 hover:text-red-600" onClick={() => setPhotos((cur) => cur.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {localError ? <Note tone="red">{localError}</Note> : null}
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} busy={save.isPending}>
            Enregistrer la visite
          </Button>
        </div>
      </div>
    </Modal>
  );
}
