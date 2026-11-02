import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CalendarDays, Check, Coins, Phone, ReceiptText, ShoppingCart, UserPlus, Wallet } from 'lucide-react';
import { api } from '../../api/client';
import type { Customer } from '../../api/types';
import type { CustomerFull, CustomerStats, SaleFull } from '../../api/types-sales';
import { Button, ErrorNote, Field, inputCls, Modal } from '../form';
import { IconTile, Loading } from '../ui';
import { classNames, dateFr, fcfa, num } from '../../lib/format';
import { CustomerPicker } from './Checkout';
import { CUSTOMER_TYPE_LABEL, CUSTOMER_TYPES, productTypeLabel, SEGMENT_LABEL } from './labels';
import { useIdempotencyKey } from '../../lib/idempotency';
import { ensureCashOpen, invalidateCash } from './pos';
import { salePaid } from './SaleDetail';

export function CreateCustomerModal({ farmId, onClose }: { farmId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [type, setType] = useState('PARTICULIER');

  const create = useMutation({
    mutationFn: () =>
      api.post<Customer>(`/farms/${farmId}/customers`, {
        fullName: name.trim(),
        type,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(city.trim() ? { city: city.trim() } : {}),
      }),
    onSuccess: () => {
      invalidateCash(queryClient, farmId);
      onClose();
    },
  });

  return (
    <Modal title="Nouveau client" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <Field label="Nom complet">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Restaurant, revendeur…" autoFocus required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Téléphone (facultatif)">
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 00 00 00" />
          </Field>
          <Field label="Ville (facultatif)">
            <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
        </div>
        <Field label="Type de client" hint="Le type est indicatif. Le crédit éventuel se décide au moment de l’encaissement.">
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
            {CUSTOMER_TYPES.map((t) => (
              <option key={t} value={t}>
                {CUSTOMER_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <ErrorNote error={create.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={create.isPending}>
            Annuler
          </Button>
          <Button type="submit" busy={create.isPending} disabled={!name.trim()}>
            {create.isPending ? null : <UserPlus className="h-4 w-4" />}
            Créer la fiche
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function CollectModal({
  farmId,
  customers,
  initial,
  onClose,
}: {
  farmId: string | null;
  customers: CustomerFull[];
  initial: CustomerFull | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [customer, setCustomer] = useState<CustomerFull | null>(initial);
  const [value, setValue] = useState(initial ? String(initial.balance?.outstandingFcfa ?? 0) : '');
  const [done, setDone] = useState<number | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);

  const due = customer?.balance?.outstandingFcfa ?? 0;
  const amount = Number(value) || 0;
  const remaining = due - amount;

  const paymentKey = useIdempotencyKey('customer-payment');
  const collect = useMutation({
    mutationFn: async () => {
      // Mobile opens a closed caisse (from the last closing) before collecting.
      await ensureCashOpen(farmId!);
      return api.post(`/farms/${farmId}/customers/${customer!.id}/payments`, {
        amountFcfa: amount,
        idempotencyKey: paymentKey.keyFor({ customerId: customer!.id, amount }),
      });
    },
    onSuccess: () => {
      paymentKey.settle();
      invalidateCash(queryClient, farmId);
      setDone(amount);
    },
    onError: () => invalidateCash(queryClient, farmId),
  });

  const submit = () => {
    if (amount <= 0) return setInvalid('Saisissez un montant supérieur à zéro.');
    if (amount > due) return setInvalid(`Le montant dépasse le solde dû (${fcfa(due)}).`);
    setInvalid(null);
    collect.mutate();
  };

  if (done != null) {
    return (
      <Modal title="Encaissement enregistré" onClose={onClose}>
        <div className="space-y-4">
          <p className="flex items-center gap-3 text-sm text-slate-600">
            <IconTile icon={<Check />} tone="green" />
            <span>
              {fcfa(done)} · {customer?.fullName}. Ajouté à la caisse journalière.
            </span>
          </p>
          <div className="flex justify-end">
            <Button onClick={onClose}>Fermer</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Encaisser une dette" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Client</p>
          <CustomerPicker
            customers={customers.filter((c) => (c.balance?.outstandingFcfa ?? 0) > 0)}
            selected={customer}
            creditMode
            onSelect={(c) => {
              setCustomer(c);
              setValue(c ? String(c.balance?.outstandingFcfa ?? 0) : '');
              setInvalid(null);
            }}
          />
        </div>
        <Field label="Espèces reçues (FCFA)" hint="Le montant est réparti sur les ventes impayées les plus anciennes.">
          <input className={inputCls} inputMode="numeric" disabled={!customer} value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} />
        </Field>
        {customer && due > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {[25, 50, 75].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setValue(String(Math.round((due * p) / 100)))}
                className="rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {p} %
              </button>
            ))}
            <button
              type="button"
              onClick={() => setValue(String(due))}
              className="rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Tout
            </button>
            {amount > 0 && amount <= due ? (
              <span className={classNames('ml-auto text-sm font-semibold', remaining === 0 ? 'text-emerald-600' : 'text-slate-500')}>
                {remaining === 0 ? 'Soldé' : `Restant ${fcfa(remaining)}`}
              </span>
            ) : null}
          </div>
        ) : null}
        <ErrorNote error={invalid ?? collect.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={collect.isPending}>
            Annuler
          </Button>
          <Button type="submit" busy={collect.isPending} disabled={!customer}>
            <Banknote className="h-4 w-4" /> Encaisser {fcfa(amount)}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Figure({ label, value, tone, icon }: { label: string; value: string; tone?: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="flex items-center gap-1.5 text-xs text-slate-500 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0">
        {icon}
        {label}
      </p>
      <p className={classNames('text-sm font-bold tabular-nums', tone ?? 'text-slate-800')}>{value}</p>
    </div>
  );
}

/** Customer file: balances, recovery rate, stats, favourites and purchase history. */
export function CustomerDetail({
  farmId,
  customer,
  onCollect,
  onClose,
}: {
  farmId: string | null;
  customer: CustomerFull;
  onCollect: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const stats = useQuery({
    queryKey: ['customer-stats', farmId, customer.id],
    queryFn: () => api.get<CustomerStats>(`/farms/${farmId}/customers/${customer.id}/stats`),
    enabled: !!farmId,
  });
  const history = useQuery({
    queryKey: ['customer-history', farmId, customer.id],
    queryFn: () => api.get<SaleFull[]>(`/farms/${farmId}/customers/${customer.id}/history`),
    enabled: !!farmId,
  });
  const setType = useMutation({
    mutationFn: (type: string) => api.patch<Customer>(`/farms/${farmId}/customers/${customer.id}`, { type }),
    onSuccess: () => invalidateCash(queryClient, farmId),
  });

  const due = customer.balance?.outstandingFcfa ?? 0;
  const invoiced = customer.balance?.totalInvoicedFcfa ?? 0;
  const paid = customer.balance?.paidFcfa ?? 0;
  const rate = invoiced > 0 ? Math.round(Math.min(1, paid / invoiced) * 100) : 0;

  return (
    <Modal title={customer.fullName} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {[customer.code, SEGMENT_LABEL[customer.segment], customer.phone, customer.city].filter(Boolean).join(' · ') || 'Aucun contact'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {customer.phone ? (
              <a
                href={`tel:${customer.phone}`}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Phone className="h-4 w-4" /> Appeler
              </a>
            ) : null}
            {due > 0 ? (
              <Button onClick={onCollect}>
                <Banknote className="h-4 w-4" /> Encaisser
              </Button>
            ) : null}
          </div>
        </div>

        <Field label="Type de client (indicatif)" className="max-w-xs">
          <select className={inputCls} value={customer.type} disabled={setType.isPending} onChange={(e) => setType.mutate(e.target.value)}>
            {CUSTOMER_TYPES.map((t) => (
              <option key={t} value={t}>
                {CUSTOMER_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <ErrorNote error={setType.error} />

        <div className="grid grid-cols-3 gap-3">
          <Figure label="Total facturé" value={fcfa(invoiced)} icon={<ReceiptText />} />
          <Figure label="Encaissé" value={fcfa(paid)} tone="text-emerald-600" icon={<Banknote />} />
          <Figure label="À recouvrer" value={fcfa(due)} tone={due > 0 ? 'text-red-600' : 'text-slate-800'} icon={<Wallet />} />
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>Recouvrement</span>
            <span className="font-semibold">{rate} %</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className={classNames('h-full rounded-full', rate >= 100 ? 'bg-emerald-500' : 'bg-amber-400')} style={{ width: `${rate}%` }} />
          </div>
        </div>

        <ErrorNote error={stats.error ?? history.error} />
        {stats.isLoading ? (
          <Loading label="Calcul des statistiques…" />
        ) : stats.data ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-3">
              <Figure label="Visites" value={num(stats.data.visits)} icon={<CalendarDays />} />
              <Figure label="Total dépensé" value={fcfa(stats.data.totalSpentFcfa)} icon={<Coins />} />
              <Figure label="Panier moyen" value={fcfa(stats.data.avgBasketFcfa)} icon={<ShoppingCart />} />
            </div>
            {stats.data.favorites.length > 0 ? (
              <p className="text-sm text-slate-500">
                Aime : {stats.data.favorites.map((f) => f.label || productTypeLabel(f.productType)).join(', ')}
              </p>
            ) : null}
            {stats.data.lastPurchaseDate ? (
              <p className="text-sm text-slate-500">Dernier achat : {dateFr(stats.data.lastPurchaseDate)}</p>
            ) : null}
          </div>
        ) : null}

        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <ReceiptText className="h-4 w-4 text-brand-600" /> Historique d’achats
          </h3>
          {history.isLoading ? (
            <Loading label="Lecture de l’historique…" />
          ) : !history.data?.length ? (
            <p className="text-sm text-slate-500">Aucun achat pour l’instant.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {history.data.map((s) => {
                const salePaidFcfa = salePaid(s);
                return (
                  <li key={s.id} className="flex items-start justify-between gap-4 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">{s.referenceNumber}</p>
                      <p className="text-xs text-slate-500">
                        {dateFr(s.saleDate)} · {s.items.map((i) => `${i.label || productTypeLabel(i.productType)} × ${num(i.quantity, 2)}`).join(', ')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <p className="font-semibold text-slate-800">{fcfa(s.totalAmountFcfa)}</p>
                      <p className={classNames('text-xs', salePaidFcfa >= s.totalAmountFcfa ? 'text-emerald-600' : 'text-amber-600')}>
                        payé {fcfa(salePaidFcfa)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

