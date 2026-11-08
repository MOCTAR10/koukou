import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, ExternalLink, Info, Loader2, Lock, WifiOff } from 'lucide-react';
import { API_BASE } from '../api/client';
import { Logo } from '../components/Logo';
import { fetchPublicLot, PUBLIC_LOT_NOTICE, producerLine, type PublicLotState } from '../components/trace/publicLot';
import { dateFr, num } from '../lib/format';
import { safeHref } from '../lib/safeUrl';

/**
 * The page a consumer opens by scanning a lot's QR code (`/l/:code?s=…`).
 * No account, mobile first; a plain fetch every time (each scan is journaled
 * by the server), never the offline store.
 */
export function PublicLotPage() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const signature = params.get('s');
  const [state, setState] = useState<PublicLotState | null>(null);

  useEffect(() => {
    let alive = true;
    setState(null);
    void fetchPublicLot(API_BASE, code, signature).then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, [code, signature]);

  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
        <header className="flex items-center justify-between">
          <Logo className="h-8 w-auto" />
          <span className="text-xs font-medium text-slate-500">Origine du produit</span>
        </header>
        {state === null ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-8 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            <Loader2 className="h-4 w-4 animate-spin" /> Vérification du code…
          </div>
        ) : state.kind === 'ok' ? (
          <LotCard state={state} />
        ) : (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              {state.kind === 'closed' ? <Lock className="h-6 w-6" /> : state.kind === 'offline' ? <WifiOff className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6 text-amber-600" />}
            </div>
            <h1 className="text-lg font-semibold text-slate-900">{state.title}</h1>
            <p className="mt-1 text-sm text-slate-600">{state.message}</p>
            {code ? <p className="mt-3 font-mono text-xs text-slate-400">{code}</p> : null}
          </div>
        )}
        <p className="flex items-start gap-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>{state?.kind === 'ok' ? state.view.notice : PUBLIC_LOT_NOTICE}</span>
        </p>
      </div>
    </div>
  );
}

function LotCard({ state }: { state: Extract<PublicLotState, { kind: 'ok' }> }) {
  const v = state.view;
  const place = producerLine(v);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        {v.status === 'CLOS' ? (
          <>
            <div className="flex items-center gap-2 text-slate-700">
              <Lock className="h-5 w-5" />
              <span className="text-sm font-semibold">Lot terminé</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              L’élevage de ce lot est terminé ; les volailles peuvent encore être en vente. Voici leur origine.
            </p>
          </>
        ) : (
          <div className="flex items-center gap-2 text-emerald-700">
            <BadgeCheck className="h-5 w-5" />
            <span className="text-sm font-semibold">Lot du programme reconnu</span>
          </div>
        )}
        <h1 className="mt-2 text-xl font-bold text-slate-900">
          {v.product.speciesLabel} · {v.product.typeLabel}
        </h1>
        <p className="font-mono text-xs text-slate-500">{v.code}</p>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Producteur</dt>
            <dd className="font-medium text-slate-900">{v.producer.farmName}</dd>
            {place ? <dd className="text-slate-600">{place}</dd> : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-slate-500">Mise en place</dt>
              <dd className="text-slate-900">{dateFr(v.band.openedOn)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Fin d’élevage</dt>
              <dd className="text-slate-900">{v.band.closedOn ? dateFr(v.band.closedOn) : 'en cours'}</dd>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-slate-500">Quantité du lot</dt>
              <dd className="text-slate-900">{num(v.quantity, 0)} sujets</dd>
            </div>
            {v.operatorType ? (
              <div>
                <dt className="text-xs text-slate-500">Remis à</dt>
                <dd className="text-slate-900">
                  {v.operatorType}
                  {v.cededOn ? <span className="block text-xs text-slate-500">le {dateFr(v.cededOn)}</span> : null}
                </dd>
              </div>
            ) : null}
          </div>
        </dl>
      </div>
      <a
        href={safeHref(v.consommonsGabonais.url) ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-between rounded-2xl bg-brand-600 px-5 py-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
      >
        {v.consommonsGabonais.label}
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}
