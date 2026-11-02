import { useQuery } from '@tanstack/react-query';
import {
  Building,
  Crosshair,
  Crown,
  Info,
  LogOut,
  MapPin,
  Phone,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { api } from '../api/client';
import type { FarmMemberProfile, FarmWithLogo } from '../api/types-org';
import { useFarm } from '../app/FarmContext';
import { useAuth } from '../auth/AuthContext';
import { Button, ErrorNote } from '../components/form';
import { SectionTitle } from '../components/finance/shared';
import { FarmIdentityCard } from '../components/org/FarmIdentityCard';
import { FarmLogo } from '../components/org/FarmLogo';
import { ReferenceConstants } from '../components/org/ReferenceConstants';
import { STAFF_ROLE_LABEL } from '../components/org/shared';
import { Card, IconTile, Loading, PageHeader } from '../components/ui';
import { statusLabel } from '../lib/format';

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 text-sm">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50">
        <Icon className="h-4 w-4 text-brand-600" />
      </span>
      <span className="flex-1 text-slate-500">{label}</span>
      <span className="truncate font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function Section({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <SectionTitle title={title} subtitle={subtitle} icon={icon} />
      {children}
    </section>
  );
}

export function SettingsPage() {
  const { farmId, farm: currentFarm } = useFarm();
  const { user, logout } = useAuth();
  const farm: FarmWithLogo | null = currentFarm;

  const profile = useQuery({
    queryKey: ['farm-profile', farmId],
    queryFn: () => api.get<FarmMemberProfile>(`/farms/${farmId}/me`),
    enabled: !!farmId,
    staleTime: 30_000,
  });

  const me = profile.data;
  const roleLabel = !me ? statusLabel(user?.role) : me.role === 'PROPRIETAIRE' ? 'Propriétaire' : STAFF_ROLE_LABEL[me.role];
  // The stored session carries the phone although AuthUser doesn't declare it.
  const phone = (user as { phone?: string } | null)?.phone ?? farm?.owner?.phone ?? '—';
  const hasAllRights = me?.permissions.includes('*') === true;

  return (
    <div className="space-y-6">
      <PageHeader title="Réglages de ferme" subtitle={farm?.name} icon={<Settings className="h-6 w-6" />} />

      <ErrorNote error={profile.error} />

      <div className="flex items-center gap-4 rounded-2xl bg-brand-800 p-5">
        <FarmLogo farm={farm} size="h-16 w-16" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-white">{user?.fullName || 'Compte Fermia'}</p>
          <p className="text-sm text-brand-200">{roleLabel}</p>
        </div>
        <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/20">
          {me?.active === false ? 'Compte inactif' : 'Compte actif'}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Compte" subtitle="Identité et rattachement" icon={<User className="h-4 w-4" />}>
          <Card className="divide-y divide-slate-100">
            <InfoRow icon={Phone} label="Téléphone" value={phone} />
            <InfoRow icon={ShieldCheck} label="Rôle" value={roleLabel} />
            {farm ? (
              <>
                <InfoRow icon={Building} label="Ferme" value={farm.name} />
                <InfoRow icon={MapPin} label="Commune" value={farm.administrativeCity || 'Non renseignée'} />
              </>
            ) : null}
          </Card>
        </Section>

        {hasAllRights ? (
          <Section title="Mes droits" subtitle="Accès complet à la ferme" icon={<ShieldCheck className="h-4 w-4" />}>
            <Card className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50">
                <Crown className="h-5 w-5 text-amber-500" />
              </span>
              <span>
                <span className="block text-sm font-bold text-slate-900">Accès complet</span>
                <span className="block text-sm text-slate-500">
                  Propriétaire de la ferme (ou administrateur plateforme) : toutes les sections sont accessibles.
                </span>
              </span>
            </Card>
          </Section>
        ) : null}
      </div>

      <Section title="Ma ferme" subtitle="Nom et logo modifiables" icon={<Crosshair className="h-4 w-4" />}>
        {farm ? <FarmIdentityCard key={farm.id} farm={farm} /> : <Loading />}
      </Section>

      <ReferenceConstants />

      <Card className="space-y-2 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <IconTile icon={<Info className="h-4 w-4" />} tone="green" size="sm" /> Ce que pilote l’application
          <SlidersHorizontal className="ml-auto h-4 w-4 text-slate-300" />
        </h2>
        <p className="text-sm text-slate-500">
          Saisie journalière, ventes (POS espèces), soins prophylactiques, stock de provende, abattage et caisse :
          l’advisory s’appuie sur les seuils ci-dessus pour prioriser vos prochaines actions.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {['Saisie', 'POS', 'Sanitaire', 'Provende', 'Abattage', 'Caisse'].map((s) => (
            <span key={s} className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
              {s}
            </span>
          ))}
        </div>
      </Card>

      <Section title="Session" subtitle="Déconnexion de ce compte" icon={<LogOut className="h-4 w-4" />}>
        <Button tone="secondary" onClick={logout}>
          <LogOut className="h-4 w-4" /> Se déconnecter
        </Button>
      </Section>
    </div>
  );
}
