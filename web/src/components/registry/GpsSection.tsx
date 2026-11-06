import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, History, LocateFixed } from 'lucide-react';
import { api } from '../../api/client';
import type { RegistryGps, RegistrySheet, SetGpsResult } from '../../api/types-programme';
import { dateFr, dateTimeFr } from '../../lib/format';
import { Button, ErrorNote, Field, inputCls, Modal, todayIso } from '../form';
import { Loading } from '../ui';
import { invalidateRegistry, useGpsHistory } from './queries';
import { buildGpsBody } from './sheetForm';

const SOURCE_LABEL: Record<string, string> = {
  APPAREIL: 'relevé sur place',
  MANUEL: 'saisie manuelle',
  IMPORT: 'import',
};

function coords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function mapUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
}

function ProvinceWarning({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

function PointLine({ gps }: { gps: RegistryGps }) {
  return (
    <div className="space-y-1 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-semibold text-slate-900">{coords(gps.latitude, gps.longitude)}</span>
        <a
          href={mapUrl(gps.latitude, gps.longitude)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
        >
          Carte <ExternalLink className="h-3 w-3" />
        </a>
      </p>
      <p className="text-xs text-slate-500">
        {gps.capturedAt ? `Relevé le ${dateFr(gps.capturedAt)}` : 'Date du relevé inconnue'}
        {gps.source ? ` · ${SOURCE_LABEL[gps.source] ?? gps.source}` : ''}
        {gps.accuracyM != null ? ` · précision ${Math.round(gps.accuracyM)} m` : ''}
      </p>
    </div>
  );
}

/** Current point, province check (warning only), new fix and history (a correction never erases the previous point). */
export function GpsSection({ sheet, canEdit }: { sheet: RegistrySheet; canEdit: boolean }) {
  const [entering, setEntering] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const history = useGpsHistory(sheet.id, showHistory);

  return (
    <div className="space-y-3">
      {sheet.gps ? <PointLine gps={sheet.gps} /> : <p className="text-sm text-slate-500">Aucune position enregistrée.</p>}
      {sheet.gps?.provinceWarning ? <ProvinceWarning text={sheet.gps.provinceWarning} /> : null}
      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <Button tone="secondary" onClick={() => setEntering(true)}>
            <LocateFixed className="h-4 w-4" /> {sheet.gps ? 'Corriger la position' : 'Saisir la position'}
          </Button>
        ) : null}
        <Button tone="secondary" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
          <History className="h-4 w-4" /> {showHistory ? 'Masquer l’historique' : 'Historique des relevés'}
        </Button>
      </div>
      {showHistory ? (
        history.isLoading ? (
          <Loading />
        ) : history.data?.length ? (
          <ol className="space-y-2 border-l-2 border-slate-200 pl-3">
            {history.data.map((h) => (
              <li key={h.id} className="text-sm">
                <p className="font-mono text-slate-900">{coords(h.latitude, h.longitude)}</p>
                <p className="text-xs text-slate-500">
                  {dateFr(h.capturedAt)} · {SOURCE_LABEL[h.source] ?? h.source}
                  {h.accuracyM != null ? ` · ${Math.round(h.accuracyM)} m` : ''}
                  {h.createdBy ? ` · saisi par ${h.createdBy.fullName}` : ''} · {dateTimeFr(h.createdAt)}
                </p>
                {h.reason ? <p className="text-xs text-slate-600">Motif : {h.reason}</p> : null}
                {h.provinceWarning ? <p className="text-xs text-amber-700">{h.provinceWarning}</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <ErrorNote error={history.error} />
        )
      ) : null}
      {entering ? <GpsFixModal sheet={sheet} onClose={() => setEntering(false)} /> : null}
    </div>
  );
}

function GpsFixModal({ sheet, onClose }: { sheet: RegistrySheet; onClose: () => void }) {
  const queryClient = useQueryClient();
  const today = todayIso();
  const [draft, setDraft] = useState({ latitude: '', longitude: '', accuracyM: '', capturedAt: '', reason: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: object) => api.put<SetGpsResult>(`/programme/farms/${sheet.id}/gps`, body),
    onSuccess: (result) => {
      queryClient.setQueryData<RegistrySheet>(['programme-farm', sheet.id], (prev) => (prev ? { ...prev, gps: result.gps } : prev));
      invalidateRegistry(queryClient, sheet.id);
      // Stored either way; a point outside the province stays on screen to be checked.
      if (!result.provinceWarning) onClose();
    },
  });
  const set = (key: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setDraft((d) => ({ ...d, [key]: e.target.value }));
    setFormError(null);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const built = buildGpsBody({ ...draft, today });
    if ('error' in built) return setFormError(built.error);
    save.mutate(built.body);
  };

  return (
    <Modal title={`Position GPS · ${sheet.code ?? sheet.name}`} onClose={onClose}>
      {save.data?.provinceWarning ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">Relevé enregistré. Vérifiez-le :</p>
          <ProvinceWarning text={save.data.provinceWarning} />
          <div className="flex justify-end">
            <Button onClick={onClose}>Fermer</Button>
          </div>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          {sheet.gps ? (
            <p className="text-sm text-slate-600">
              Position actuelle : <span className="font-mono">{coords(sheet.gps.latitude, sheet.gps.longitude)}</span>. Elle reste dans
              l’historique.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude">
              <input className={inputCls} inputMode="decimal" value={draft.latitude} onChange={set('latitude')} placeholder="0,3901" required />
            </Field>
            <Field label="Longitude">
              <input className={inputCls} inputMode="decimal" value={draft.longitude} onChange={set('longitude')} placeholder="9,4544" required />
            </Field>
            <Field label="Précision (m)">
              <input className={inputCls} inputMode="decimal" value={draft.accuracyM} onChange={set('accuracyM')} />
            </Field>
            <Field label="Date du relevé" hint="Vide : maintenant.">
              <input type="date" className={inputCls} max={today} value={draft.capturedAt} onChange={set('capturedAt')} />
            </Field>
          </div>
          <Field label="Motif" hint="Par exemple : erreur de saisie, nouveau relevé sur place.">
            <textarea className={inputCls} rows={2} maxLength={500} value={draft.reason} onChange={set('reason')} />
          </Field>
          <p className="text-xs text-slate-500">
            Degrés décimaux (WGS 84). Un point hors de la province de la ferme est signalé, jamais refusé.
          </p>
          <ErrorNote error={formError ?? save.error} />
          <div className="flex justify-end gap-2">
            <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
              Annuler
            </Button>
            <Button type="submit" busy={save.isPending}>
              Enregistrer la position
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
