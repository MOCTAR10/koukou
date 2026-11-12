import { useEffect, useState } from 'react';
import { safeHref } from '../../lib/safeUrl';
import {
  Activity,
  AlertTriangle,
  Bird,
  ClipboardCheck,
  Download,
  Flag,
  HeartPulse,
  LogOut,
  Package,
  QrCode,
  Scale,
  ScanLine,
  Skull,
  Stethoscope,
  Syringe,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../api/client';
import type { LotHistory, LotView, RearingKind } from '../../api/types-trace';
import { dateFr, dateTimeFr, num } from '../../lib/format';
import { Note, Pill, useAsyncAction } from '../flock/shared';
import { Button, ErrorNote, Modal } from '../form';
import { Loading } from '../ui';
import { useLotHistory } from './queries';
import {
  EVENT_TYPE_LABEL,
  LOT_KIND_LABEL,
  LOT_STATUS_LABEL,
  REARING_KIND_LABEL,
  lotStatusTone,
  rearingDetail,
  rearingQuantityLabel,
  scanWarnings,
} from './traceLabels';

const REARING_KIND_ICON: Record<RearingKind, LucideIcon> = {
  OUVERTURE: Bird,
  SOIN: Stethoscope,
  TRAITEMENT: Syringe,
  MORTALITE: Skull,
  PESEE: Scale,
  EVENEMENT_SANITAIRE: HeartPulse,
  SORTIE: LogOut,
  CLOTURE: Flag,
  INTRANT: Package,
  ALIMENT: Wheat,
  VISITE: ClipboardCheck,
};

/** QR of the lot shown on screen (fetched with the token, never in a URL); hidden if it cannot load. */
function LotQrImage({ farmId, lotId, code }: { farmId: string; lotId: string; code: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    setSrc(null);
    api
      .blob(`/farms/${farmId}/trace/lots/${lotId}/qr`)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [farmId, lotId]);
  if (!src) return null;
  return (
    <figure className="flex w-44 flex-col items-center gap-1 text-center">
      <img src={src} alt={`QR code du lot ${code}`} width={176} height={176} className="h-44 w-44 rounded-lg border border-slate-200 bg-white p-1" />
      <figcaption className="text-xs text-slate-500">Scannez pour ouvrir la page publique du lot</figcaption>
    </figure>
  );
}

export function LotStatusPill({ lot }: { lot: Pick<LotView, 'status'> }) {
  return <Pill tone={lotStatusTone(lot.status)}>{LOT_STATUS_LABEL[lot.status] ?? lot.status}</Pill>;
}

function SubLotRow({ lot, onOpen }: { lot: LotView; onOpen?: (id: string) => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        {onOpen ? (
          <button type="button" className="font-mono text-xs font-semibold text-brand-700 hover:underline" onClick={() => onOpen(lot.id)}>
            {lot.code}
          </button>
        ) : (
          <span className="font-mono text-xs font-semibold">{lot.code}</span>
        )}
        <p className="text-xs text-slate-500">
          {num(lot.quantity, 0)} sujets{lot.weightKg ? ` · ${num(lot.weightKg)} kg` : ''}
          {lot.operator ? ` · ${lot.operator.name} (${lot.operator.typeLabel ?? lot.operator.typeCode})` : ''}
          {lot.cededOn ? ` · cédé le ${dateFr(lot.cededOn)}` : ''}
        </p>
      </div>
      <LotStatusPill lot={lot} />
    </li>
  );
}

/**
 * A lot's history (CDC T1-T5): the lot and its band, the sub-lots ceded to
 * operators, the events, the rearing chronology and the QR scan indicators,
 * with the printable A6 label.
 */
export function LotHistoryView({
  history,
  onOpenLot,
  canValidate = false,
  onValidated,
}: {
  history: LotHistory;
  onOpenLot?: (id: string) => void;
  /** Shows « Valider le lot » (the server checks the right again). */
  canValidate?: boolean;
  onValidated?: () => void;
}) {
  const { lot, root, subLots, band, events, rearing, scans, farm } = history;
  const pdf = useAsyncAction();
  const warnings = scanWarnings(scans);
  const validated = lot.validationStatus === 'VALIDE';
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-slate-900">{lot.code}</p>
          <p className="text-xs text-slate-500">
            {LOT_KIND_LABEL[lot.kind] ?? lot.kind} · {farm.code ? `${farm.code} · ` : ''}
            {farm.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={validated ? 'emerald' : 'slate'}>{validated ? 'Validé' : 'Brouillon'}</Pill>
          <LotStatusPill lot={lot} />
        </div>
      </div>
      {validated ? (
        <p className="text-xs text-slate-500">
          Validé{lot.validatedAt ? ` le ${dateTimeFr(lot.validatedAt)}` : ''}
          {lot.validatedBy ? ` par ${lot.validatedBy}` : ''}
        </p>
      ) : null}

      <div className="grid gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2">
        <p>
          <span className="text-slate-500">Bande : </span>
          {band.batchName ?? band.code ?? '—'} {band.code && band.batchName ? <span className="font-mono text-xs text-slate-500">({band.code})</span> : null}
        </p>
        <p>
          <span className="text-slate-500">Ouverte le : </span>
          {dateFr(band.integrationDate)}
          {band.initialAgeDays ? ` à J${band.initialAgeDays}` : ''}
        </p>
        <p>
          <span className="text-slate-500">Effectif : </span>
          {num(band.quantityAlive, 0)} présents sur {num(band.quantityAtStart, 0)}
        </p>
        <p>
          <span className="text-slate-500">Clôture : </span>
          {band.closedAt ? dateFr(band.closedAt) : 'en cours'}
        </p>
        <p>
          <span className="text-slate-500">Quantité du lot : </span>
          {num(lot.quantity, 0)} sujets{lot.weightKg ? ` · ${num(lot.weightKg)} kg` : ''}
        </p>
        {lot.operator ? (
          <p>
            <span className="text-slate-500">Cédé à : </span>
            {lot.operator.name} ({lot.operator.typeLabel ?? lot.operator.typeCode}){lot.cededOn ? ` le ${dateFr(lot.cededOn)}` : ''}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <LotQrImage farmId={farm.id} lotId={lot.id} code={lot.code} />
        <Button
          tone="secondary"
          busy={pdf.busy === 'label'}
          onClick={() => void pdf.run('label', () => api.download(`/farms/${farm.id}/trace/lots/${lot.id}/label`, `lot-${lot.code}.pdf`))}
        >
          <Download className="h-4 w-4" /> Étiquette QR (PDF A6)
        </Button>
        {canValidate && !validated ? (
          <Button
            busy={pdf.busy === 'validate'}
            onClick={() =>
              void pdf.run('validate', async () => {
                await api.post(`/farms/${farm.id}/trace/lots/${lot.id}/validate`, {});
                onValidated?.();
              })
            }
          >
            Valider le lot
          </Button>
        ) : null}
        <a href={safeHref(lot.qrUrl) ?? undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
          <QrCode className="h-3.5 w-3.5" /> Page publique du QR code
        </a>
      </div>
      <ErrorNote error={pdf.error} />

      {root ? (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-slate-700">Lot d’origine</h3>
          <ul className="divide-y divide-slate-100">
            <SubLotRow lot={root} onOpen={onOpenLot} />
          </ul>
        </div>
      ) : null}
      {subLots.length > 0 ? (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-slate-700">Sous-lots cédés ({subLots.length})</h3>
          <ul className="divide-y divide-slate-100">
            {subLots.map((s) => (
              <SubLotRow key={s.id} lot={s} onOpen={onOpenLot} />
            ))}
          </ul>
        </div>
      ) : null}

      {events.length > 0 ? (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-slate-700">Événements</h3>
          <ul className="space-y-1 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-2">
                <span className="text-slate-500">{dateTimeFr(e.occurredAt)}</span>
                <span className="font-medium">{EVENT_TYPE_LABEL[e.type] ?? e.type}</span>
                <span className="font-mono text-xs text-slate-500">{e.lotCode}</span>
                {e.operator ? <span>→ {e.operator.name}</span> : null}
                {e.actor?.fullName ? <span className="text-slate-500">par {e.actor.fullName}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="mb-1 text-sm font-semibold text-slate-700">Historique d’élevage</h3>
        {rearing.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun enregistrement.</p>
        ) : (
          <ol className="relative space-y-2 border-l border-slate-200 pl-4">
            {rearing.map((r, i) => {
              const KindIcon = REARING_KIND_ICON[r.kind] ?? Activity;
              const qty = rearingQuantityLabel(r);
              const detail = rearingDetail(r);
              return (
                <li key={`${r.date}-${r.kind}-${i}`} className="text-sm">
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-500" aria-hidden="true" />
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <KindIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {dateFr(r.date)} · {REARING_KIND_LABEL[r.kind] ?? r.kind}
                  </span>
                  <p className="text-slate-800">
                    {r.label}
                    {qty ? <span className="text-slate-500"> · {qty}</span> : null}
                  </p>
                  {detail ? <p className="text-xs text-slate-500">{detail}</p> : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <ScanLine className="h-4 w-4 text-brand-600" /> Scans du QR code
        </h3>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg bg-slate-50 p-2">
            <p className="text-xs text-slate-500">Scans</p>
            <p className="font-semibold tabular-nums">{num(scans.scans, 0)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <p className="text-xs text-slate-500">Appareils</p>
            <p className="font-semibold tabular-nums">{num(scans.distinctDevices, 0)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <p className="text-xs text-slate-500">Zones</p>
            <p className="font-semibold tabular-nums">{num(scans.distinctAreas, 0)}</p>
          </div>
        </div>
        {scans.lastAt ? <p className="text-xs text-slate-500">Dernier scan : {dateTimeFr(scans.lastAt)}</p> : null}
        {warnings.length > 0 ? (
          <Note tone="red" icon={<AlertTriangle />}>
            {warnings.join(' ')}
          </Note>
        ) : null}
      </div>
    </div>
  );
}

/** A farm lot's history in a side panel; a sub-lot or the root lot opens in place. */
export function LotHistoryPanel({
  farmId,
  lotId,
  onOpenLot,
  onClose,
}: {
  farmId: string;
  lotId: string;
  onOpenLot: (id: string) => void;
  onClose: () => void;
}) {
  const history = useLotHistory(farmId, lotId);
  return (
    <Modal title={history.data ? `Lot ${history.data.lot.code}` : 'Lot de traçabilité'} onClose={onClose} side wide>
      {history.isLoading ? <Loading /> : null}
      <ErrorNote error={history.error} />
      {history.data ? <LotHistoryView history={history.data} onOpenLot={onOpenLot} /> : null}
    </Modal>
  );
}
