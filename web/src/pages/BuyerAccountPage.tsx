import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, ChevronRight, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { BuyerProfile } from '../api/types-market';
import { useAuth } from '../auth/AuthContext';
import { Button, ErrorNote, Field, inputCls } from '../components/form';
import { BUYER_TYPES, buyerTypeLabel, MARKET_PANEL, MarketTitle } from '../components/market/shared';
import { Skeleton } from '../components/ui';

const fieldCls = `${inputCls} !rounded-xl !py-2.5`;

const SHORTCUTS = [
  { to: '/marche/commandes', icon: ClipboardList, title: 'Mes commandes', text: 'Suivre vos demandes et précommandes.' },
  { to: '/marche', icon: Store, title: 'Les annonces', text: 'Parcourir les produits des fermes.' },
];

export function BuyerAccountPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['buyer-profile'],
    queryFn: () => api.get<BuyerProfile | null>('/auth/buyer-profile'),
  });
  const [type, setType] = useState('PARTICULIER');
  const [organizationName, setOrganizationName] = useState('');
  const [city, setCity] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!query.data) return;
    setType(query.data.type);
    setOrganizationName(query.data.organizationName ?? '');
    setCity(query.data.city ?? '');
  }, [query.data]);

  const save = useMutation({
    mutationFn: () =>
      api.put<BuyerProfile>('/auth/buyer-profile', {
        type,
        organizationName: organizationName.trim() || undefined,
        city: city.trim() || undefined,
      }),
    onSuccess: () => {
      setSaved(true);
      void client.invalidateQueries({ queryKey: ['buyer-profile'] });
    },
  });

  const name = user?.fullName?.trim() ?? '';
  return (
    <div className="mx-auto max-w-4xl">
      <MarketTitle eyebrow="Marché Fermia" title="Mon compte" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className={`${MARKET_PANEL} overflow-hidden`}>
          <header className="flex items-center gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">
            <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-950 text-xl font-bold uppercase text-emerald-300">
              {name.charAt(0) || 'A'}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold tracking-tight text-slate-900">{name || 'Mon profil'}</p>
              <p className="text-sm text-slate-500">{buyerTypeLabel(query.data?.type)}</p>
            </div>
          </header>
          <div className="p-5 sm:p-6">
            <h2 className="font-semibold text-slate-900">Mon profil d’acheteur</h2>
            <p className="mt-1 text-sm text-slate-500">La ferme voit ces informations avec vos demandes.</p>
            {query.isLoading ? (
              <div role="status" className="mt-5 space-y-4">
                <span className="sr-only">Chargement du profil…</span>
                <Skeleton className="h-11 rounded-xl" />
                <Skeleton className="h-11 rounded-xl" />
              </div>
            ) : (
              <form
                className="mt-5 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSaved(false);
                  save.mutate();
                }}
              >
                <Field label="Je suis">
                  <select className={fieldCls} value={type} onChange={(e) => setType(e.target.value)}>
                    {BUYER_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {type !== 'PARTICULIER' ? (
                  <Field label="Nom de l’établissement">
                    <input className={fieldCls} maxLength={120} value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} />
                  </Field>
                ) : null}
                <Field label="Ville">
                  <input className={fieldCls} maxLength={80} value={city} onChange={(e) => setCity(e.target.value)} />
                </Field>
                <ErrorNote error={query.error ?? save.error} />
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button type="submit" className="rounded-xl px-5 py-2.5" busy={save.isPending}>
                    Enregistrer
                  </Button>
                  {saved ? (
                    <p role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> Profil enregistré.
                    </p>
                  ) : null}
                </div>
              </form>
            )}
          </div>
        </section>

        <nav aria-label="Raccourcis" className="space-y-3">
          {SHORTCUTS.map(({ to, icon: Icon, title, text }) => (
            <Link key={to} to={to} className={`${MARKET_PANEL} group flex items-center gap-3 p-4 transition duration-300 hover:border-brand-200 hover:shadow-raised`}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">{title}</span>
                <span className="block text-sm text-slate-500">{text}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-colors group-hover:text-brand-600" />
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
