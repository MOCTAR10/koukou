import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Tractor, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { BuyerProfile } from '../api/types-market';
import { useAuth } from '../auth/AuthContext';
import { Button, ErrorNote, Field, inputCls } from '../components/form';
import { BUYER_TYPES } from '../components/market/shared';
import { Card, Loading, PageHeader } from '../components/ui';

function BecomeFarmerCard() {
  const { becomeFarmer } = useAuth();
  const [farmName, setFarmName] = useState('');
  const [farmCity, setFarmCity] = useState('');
  const submit = useMutation({
    mutationFn: () => becomeFarmer({ farmName: farmName.trim() || undefined, farmCity: farmCity.trim() || undefined }),
  });
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-semibold text-slate-900">
        <Tractor className="h-4 w-4 text-brand-600" /> Vous avez une ferme ?
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Créez-la avec ce compte pour gérer vos lots et, une fois vérifiée, publier vos annonces. Vous gardez vos commandes.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <Field label="Nom de la ferme">
          <input className={inputCls} value={farmName} onChange={(e) => setFarmName(e.target.value)} required minLength={2} />
        </Field>
        <Field label="Ville">
          <input className={inputCls} value={farmCity} onChange={(e) => setFarmCity(e.target.value)} />
        </Field>
        <ErrorNote error={submit.error} />
        <Button type="submit" tone="secondary" busy={submit.isPending}>
          Créer ma ferme
        </Button>
      </form>
    </Card>
  );
}

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

  return (
    <div>
      <PageHeader title="Mon compte" subtitle={user?.fullName} icon={<UserRound className="h-5 w-5" />} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="font-semibold text-slate-900">Mon profil d’acheteur</h2>
        <p className="mt-1 text-sm text-slate-500">La ferme voit ces informations avec vos demandes.</p>
        {query.isLoading ? (
          <div className="mt-4">
            <Loading />
          </div>
        ) : (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setSaved(false);
              save.mutate();
            }}
          >
            <Field label="Je suis">
              <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
                {BUYER_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </Field>
            {type !== 'PARTICULIER' ? (
              <Field label="Nom de l’établissement">
                <input className={inputCls} maxLength={120} value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} />
              </Field>
            ) : null}
            <Field label="Ville">
              <input className={inputCls} maxLength={80} value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <ErrorNote error={query.error ?? save.error} />
            {saved ? <p className="text-sm font-medium text-emerald-700">Profil enregistré.</p> : null}
            <Button type="submit" busy={save.isPending}>
              Enregistrer
            </Button>
          </form>
        )}
      </Card>
      {user?.role === 'ACHETEUR' ? <BecomeFarmerCard /> : null}
      </div>
    </div>
  );
}
