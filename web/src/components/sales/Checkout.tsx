import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, Banknote, Check, CloudOff, Coins, ReceiptText, UserRound, Wallet, X } from 'lucide-react';
import { api } from '../../api/client';
import type { CustomerFull, PromotionFull, SaleCreated } from '../../api/types-sales';
import { Button, ErrorNote, Field, inputCls, Modal, todayIso } from '../form';
import { localYmd } from '../flock/shared';
import { Card } from '../ui';
import { readFcfaInput, WHOLE_FCFA_MESSAGE } from '../../lib/amount';
import { classNames, fcfa, num } from '../../lib/format';
import { customerTypeLabel } from './labels';
import { useIdempotencyKey } from '../../lib/idempotency';
import { QUEUED_MESSAGE, sendOrQueue } from '../../offline';
import { buildSaleItem, discountFor, findPromotion, invalidateCash, subtotalOf, type PosLine } from './pos';
import { saleCessionNotices } from './cession';
import { ReceiptButton } from './shared';

const QUICK_CASH = [1000, 2000, 5000, 10000, 20000, 50000];

/** Registered customer search, shared by the register and the debt collection. */
export function CustomerPicker({
  customers,
  selected,
  creditMode,
  onSelect,
}: {
  customers: CustomerFull[];
  selected: CustomerFull | null;
  creditMode: boolean;
  onSelect: (c: CustomerFull | null) => void;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const rows = useMemo(
    () =>
      customers
        .filter(
          (c) =>
            !needle ||
            c.fullName.toLowerCase().includes(needle) ||
            (c.phone ?? '').toLowerCase().includes(needle) ||
            (c.code ?? '').toLowerCase().includes(needle),
        )
        .slice(0, 6),
    [customers, needle],
  );

  if (selected) {
    const due = selected.balance?.outstandingFcfa ?? 0;
    return (
      <div className="flex items-start justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2 ring-1 ring-brand-100">
        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate font-semibold text-slate-900">{selected.fullName}</p>
          <p className="truncate text-xs text-slate-500">
            {[selected.code, customerTypeLabel(selected.type), selected.phone].filter(Boolean).join(' · ')}
          </p>
          {creditMode ? (
            <p className={classNames('text-xs', due > 0 ? 'text-red-600' : 'text-slate-500')}>
              {due > 0 ? `Déjà dû : ${fcfa(due)}` : 'Aucune dette en cours'}
            </p>
          ) : null}
        </div>
        <button type="button" aria-label="Retirer le client" onClick={() => onSelect(null)} className="rounded p-1 text-slate-400 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <input aria-label="Rechercher : nom, code ou téléphone" className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher : nom, code ou téléphone" />
      {needle ? (
        <ul className="max-h-44 overflow-y-auto rounded-lg border border-slate-200">
          {rows.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(c);
                  setQ('');
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
              >
                <span className="truncate">{c.fullName}</span>
                <span className="shrink-0 text-xs text-slate-500">{c.code ?? c.phone ?? ''}</span>
              </button>
            </li>
          ))}
          {rows.length === 0 ? <li className="px-3 py-2 text-xs text-slate-500">Aucun client ne correspond.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

/** Register panel: cash or credit, promo code, customer, change due. */
export function Checkout({
  farmId,
  lines,
  pointOfSaleId,
  posName,
  caisseOpen,
  lastClosing,
  onSold,
}: {
  farmId: string | null;
  lines: PosLine[];
  pointOfSaleId: string;
  posName: string;
  caisseOpen: boolean;
  lastClosing: number | null;
  onSold: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'CASH' | 'CREDIT'>('CASH');
  const [promoCode, setPromoCode] = useState('');
  const [tendered, setTendered] = useState('');
  const [tenderedNote, setTenderedNote] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerFull | null>(null);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [sold, setSold] = useState<(SaleCreated & { credit: boolean; customerName: string | null }) | null>(null);
  const [queuedSale, setQueuedSale] = useState<{ totalFcfa: number; credit: boolean; customerName: string | null } | null>(null);

  const customers = useQuery({
    queryKey: ['customers', farmId],
    queryFn: () => api.get<CustomerFull[]>(`/farms/${farmId}/customers`),
    enabled: !!farmId,
  });
  const promotions = useQuery({
    queryKey: ['promotions', farmId],
    queryFn: () => api.get<PromotionFull[]>(`/farms/${farmId}/promotions`),
    enabled: !!farmId,
  });

  const isCredit = mode === 'CREDIT';
  const subtotal = subtotalOf(lines);
  const promo = findPromotion(promotions.data ?? [], promoCode, subtotal, customer?.id ?? null, todayIso());
  const discount = promo ? discountFor(promo, subtotal) : 0;
  const total = subtotal - discount;
  const received = Number(tendered) || 0;
  const change = received - total;
  const creditDue = customer?.balance?.outstandingFcfa ?? 0;
  const notices = saleCessionNotices(customer, lines);
  // CDC : toute sortie de volailles vivantes nomme son destinataire (client ou téléphone).
  const liveBirds = lines.some((l) => (l.product ?? '') === 'PIECE' || (l.product ?? '') === 'KG');
  const needsRecipient = liveBirds && customer === null && !phone.trim();
  const canSell = total > 0 && !needsRecipient && (isCredit ? customer !== null : received >= total);

  const saleKey = useIdempotencyKey('sale');
  const sell = useMutation({
    mutationFn: async () => {
      const body = {
        // Explicit: a sale queued offline must keep its real day when it's replayed.
        saleDate: localYmd(),
        items: lines.map(buildSaleItem),
        pointOfSaleId,
        ...(customer ? { customerId: customer.id } : {}),
        ...(!customer && !isCredit && phone.trim() ? { customerPhone: phone.trim() } : {}),
        ...(!customer && !isCredit && name.trim() && phone.trim() ? { customerName: name.trim() } : {}),
        ...(promo ? { promoCode: promo.code } : {}),
      };
      const idempotencyKey = saleKey.keyFor({ body, isCredit, total });
      return sendOrQueue<SaleCreated>({
        kind: 'sale',
        farmId: farmId!,
        path: `/farms/${farmId}/sales`,
        body: {
          ...body,
          idempotencyKey,
          payments: isCredit ? [] : [{ method: 'CASH', amountFcfa: total, idempotencyKey: `${idempotencyKey}-pay` }],
        },
        label: `${isCredit ? 'Vente à crédit' : 'Vente'} · ${fcfa(total)}`,
        // A credit sale moves no cash, so it doesn't open the caisse.
        cashFcfa: isCredit ? 0 : total,
      });
    },
    onSuccess: (res) => {
      saleKey.settle();
      const customerName = customer?.fullName ?? (name.trim() || null);
      if (res.status === 'sent') {
        invalidateCash(queryClient, farmId);
        setSold({ ...res.data, credit: isCredit, customerName });
      } else {
        setQueuedSale({ totalFcfa: total, credit: isCredit, customerName });
      }
      setPromoCode('');
      setTendered('');
      setCustomer(null);
      setPhone('');
      setName('');
      setMode('CASH');
      onSold();
    },
    onError: () => {
      // The caisse may have been opened before the sale was refused.
      invalidateCash(queryClient, farmId);
    },
  });

  return (
    <Card className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            { key: 'CASH', label: 'Espèces', icon: Banknote },
            { key: 'CREDIT', label: 'Crédit', icon: Wallet },
          ] as const
        ).map((m) => (
          <button
            key={m.key}
            type="button"
            aria-pressed={mode === m.key}
            onClick={() => {
              setMode(m.key);
              sell.reset();
            }}
            className={classNames(
              'flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold',
              mode === m.key ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50',
            )}
          >
            <m.icon className="h-4 w-4" /> {m.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-slate-50 p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          {isCredit ? <Wallet className="h-3.5 w-3.5 text-brand-600" /> : <Banknote className="h-3.5 w-3.5 text-emerald-600" />}
          Total à encaisser
        </p>
        <p className="text-2xl font-bold text-slate-900 tabular-nums">{fcfa(total)}</p>
        <div className="mt-2 flex justify-between text-sm text-slate-500">
          <span>Sous-total</span>
          <span className="tabular-nums">{fcfa(subtotal)}</span>
        </div>
        {discount > 0 ? (
          <div className="flex justify-between text-sm text-emerald-700">
            <span>Remise ({promo?.label ?? promo?.code})</span>
            <span className="tabular-nums">− {fcfa(discount)}</span>
          </div>
        ) : null}
      </div>

      <Field label="Code promo (facultatif)">
        <input
          className={classNames(inputCls, 'uppercase')}
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
          placeholder="Ex. BIENVENUE10"
        />
        {promo ? (
          <span className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
            <BadgePercent className="h-3.5 w-3.5 shrink-0" />
            {promo.label} appliquée · remise {promo.type === 'PCT' ? `${promo.value} %` : fcfa(promo.value)}
          </span>
        ) : promoCode.trim() ? (
          <span className="mt-1 block text-xs text-red-600">Code invalide ou minimum non atteint : aucune remise appliquée.</span>
        ) : null}
      </Field>

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <UserRound className="h-3.5 w-3.5 text-slate-400" />
          {isCredit ? 'Client (requis pour une vente à crédit)' : 'Client (facultatif)'}
        </p>
        <CustomerPicker customers={customers.data ?? []} selected={customer} creditMode={isCredit} onSelect={setCustomer} />
        {notices.cession ? (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800 ring-1 ring-brand-200">{notices.cession}</p>
        ) : null}
        {notices.noDoubleEntry ? <p className="text-xs text-slate-500">{notices.noDoubleEntry}</p> : null}
        {needsRecipient ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            Destinataire obligatoire pour une vente de volailles vivantes : choisissez un client (un opérateur du registre crée le
            sous-lot tracé avec son QR) ou saisissez son téléphone.
          </p>
        ) : null}
        {!isCredit && !customer ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Téléphone (trouvé ou créé)">
              <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 00 00 00" />
            </Field>
            <Field label="Nom sur la facture">
              <input className={inputCls} value={name} disabled={!phone.trim()} onChange={(e) => setName(e.target.value)} placeholder="Client" />
            </Field>
          </div>
        ) : null}
      </div>

      {isCredit ? (
        <div className="space-y-1 rounded-xl bg-brand-50 p-3 text-sm ring-1 ring-brand-100">
          <div className="flex justify-between text-slate-600">
            <span>Montant de la vente</span>
            <span className="tabular-nums">{fcfa(total)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Déjà dû</span>
            <span className={classNames('tabular-nums', creditDue > 0 && 'text-red-600')}>{fcfa(creditDue)}</span>
          </div>
          <div className="flex justify-between font-semibold text-brand-800">
            <span className="flex items-center gap-1.5">
              <Wallet className="h-4 w-4" /> Nouveau solde dû
            </span>
            <span className="tabular-nums">{fcfa(creditDue + total)}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <Field label="Espèces reçues (FCFA)" className="flex-1">
              <input
                className={inputCls}
                inputMode="numeric"
                value={tendered}
                onChange={(e) => {
                  const read = readFcfaInput(e.target.value);
                  if (read.ok) {
                    setTendered(read.digits);
                    setTenderedNote(null);
                  } else setTenderedNote(WHOLE_FCFA_MESSAGE);
                }}
              />
              {tenderedNote ? <span className="mt-1 block text-xs text-red-600">{tenderedNote}</span> : null}
            </Field>
            <Button tone="secondary" disabled={total <= 0} onClick={() => setTendered(String(total))}>
              <Banknote className="h-4 w-4" /> Exact
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_CASH.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTendered(String(n))}
                className="rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {num(n)}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-500">{received > 0 && change < 0 ? 'Il manque' : 'Monnaie à rendre'}</span>
            <span className={classNames('font-bold tabular-nums', received === 0 ? 'text-slate-400' : change >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {received > 0 ? fcfa(Math.abs(change)) : '—'}
            </span>
          </div>
          {!caisseOpen ? (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              <Coins className="mt-px h-3.5 w-3.5 shrink-0" />
              Caisse fermée : elle sera ouverte à l’encaissement avec la dernière clôture ({fcfa(lastClosing ?? 0)}).
            </p>
          ) : null}
        </div>
      )}

      <ErrorNote error={sell.error} />

      <Button className="w-full" busy={sell.isPending} disabled={!canSell} onClick={() => sell.mutate()}>
        {isCredit ? <Wallet className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        {isCredit ? `Vendre à crédit ${fcfa(total)}` : `Encaisser ${fcfa(total)}`}
      </Button>
      <p className="text-center text-xs text-slate-500">{posName} · Espèces ou crédit client</p>

      {sold ? (
        <Modal title={sold.credit ? 'Vente à crédit enregistrée' : 'Vente encaissée'} onClose={() => setSold(null)}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <ReceiptText className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-slate-900">{sold.sale.referenceNumber}</p>
                <p className="text-sm text-slate-500">
                  {fcfa(sold.sale.totalAmountFcfa)} · {posName}
                  {sold.credit ? ` · à crédit, ${sold.customerName ?? 'client'}` : ' · espèces, caisse journalière'}
                </p>
              </div>
            </div>
            {sold.warnings.length ? (
              <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
                {sold.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
            <div className="flex items-start justify-end gap-2">
              <ReceiptButton farmId={farmId} saleId={sold.sale.id} reference={sold.sale.referenceNumber} />
              <Button onClick={() => setSold(null)}>Fermer</Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {queuedSale ? (
        <Modal title="Vente enregistrée hors ligne" onClose={() => setQueuedSale(null)}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <CloudOff className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-slate-900">
                  {fcfa(queuedSale.totalFcfa)} · {posName}
                  {queuedSale.credit ? ` · à crédit, ${queuedSale.customerName ?? 'client'}` : ''}
                </p>
                <p className="text-sm text-slate-500">{QUEUED_MESSAGE} Le reçu sera disponible après l’envoi.</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setQueuedSale(null)}>Fermer</Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}
