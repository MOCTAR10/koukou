import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bird, BookOpen, HandCoins, LayoutGrid, ListTodo, Tractor, User } from 'lucide-react';
import { api } from '../api/client';
import { useFarmProfile } from '../app/useFarmProfile';
import { DailyEntryModal } from '../components/flock/DailyEntryModal';
import { Button, ErrorNote } from '../components/form';
import { Card, IconTile, PageHeader, type IconTone } from '../components/ui';

function Tile({ icon, tone, label, sub }: { icon: ReactNode; tone: IconTone; label: string; sub: string }) {
  return (
    <Card className="flex h-full items-center gap-3 p-4 transition hover:border-brand-300 hover:shadow-md">
      <IconTile icon={icon} tone={tone} size="lg" />
      <div className="min-w-0">
        <p className="font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">{sub}</p>
      </div>
    </Card>
  );
}

/** Landing page of a field account (mobile's GroundHome): the daily actions, nothing else. */
export function GroundHomePage() {
  const { hasPermission, isSimpleMode, canChangeOwnUiMode } = useFarmProfile();
  const [entering, setEntering] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // The owner may leave the simple mode himself; staff are switched by the owner or the technical agent.
  const goComplete = useMutation({
    mutationFn: () => api.patch('/auth/me/ui-mode', { uiMode: 'COMPLET' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['farm-profile'] });
      navigate('/app/dashboard');
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mon terrain"
        subtitle="Saisie du jour, vos tâches et les ventes au comptoir."
        icon={<Tractor className="h-6 w-6" />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {hasPermission('saisie:creer') ? (
          <button type="button" className="block text-left" onClick={() => setEntering(true)}>
            <Tile icon={<BookOpen />} tone="green" label="Saisie du jour" sub="Morts, aliments, eau, poids" />
          </button>
        ) : null}
        <Link to="/app/tasks" className="block">
          <Tile icon={<ListTodo />} tone="amber" label="Mes tâches" sub="Travail assigné de l’équipe" />
        </Link>
        {hasPermission('vente:creer') ? (
          <Link to="/app/finance/ventes" className="block">
            <Tile icon={<HandCoins />} tone="brand" label="Vendre" sub="POS espèces — encaisser" />
          </Link>
        ) : null}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Comptes & suivi</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link to="/app/settings" className="block">
            <Tile icon={<User />} tone="slate" label="Mon profil" sub="Compte et ferme" />
          </Link>
          <Link to="/app/batches" className="block">
            <Tile icon={<Bird />} tone="brand" label="Mes lots" sub="Bandes en cours" />
          </Link>
        </div>
      </div>

      {isSimpleMode && canChangeOwnUiMode ? (
        <div className="space-y-2">
          <ErrorNote error={goComplete.error} />
          <Button tone="secondary" busy={goComplete.isPending} onClick={() => goComplete.mutate()}>
            <LayoutGrid className="h-4 w-4" /> Passer en mode complet
          </Button>
        </div>
      ) : null}

      {entering ? <DailyEntryModal onClose={() => setEntering(false)} /> : null}
    </div>
  );
}
