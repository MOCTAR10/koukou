import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bird, BookOpen, HandCoins, ListTodo, Tractor, User } from 'lucide-react';
import { useFarmProfile } from '../app/useFarmProfile';
import { DailyEntryModal } from '../components/flock/DailyEntryModal';
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
  const { hasPermission } = useFarmProfile();
  const [entering, setEntering] = useState(false);

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

      {entering ? <DailyEntryModal onClose={() => setEntering(false)} /> : null}
    </div>
  );
}
