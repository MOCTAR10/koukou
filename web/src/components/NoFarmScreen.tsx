import { Building2, LifeBuoy, LogOut, RotateCcw, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { noFarmMessage, type FarmSpaceState } from '../app/roles';
import { useAuth } from '../auth/AuthContext';
import { Button } from './form';
import { Card, IconTile, Loading } from './ui';

/**
 * Replaces a farm page when the account has no farm (or the list can't be
 * read), instead of a page waiting for a farm forever.
 */
export function NoFarmScreen({ state, onRetry }: { state: Exclude<FarmSpaceState, 'ready'>; onRetry: () => void }) {
  const { user, logout } = useAuth();
  if (state === 'loading') return <Loading label="Chargement de vos fermes…" />;

  const failed = state === 'error';
  const text = failed
    ? {
        title: 'Vos fermes n’ont pas pu être chargées',
        body: 'Le serveur ne répond pas, ou cet appareil est hors ligne et n’a encore jamais chargé vos fermes. Réessayez une fois reconnecté.',
      }
    : noFarmMessage(user?.role);

  return (
    <Card className="mx-auto mt-6 max-w-xl p-6 text-center sm:p-8">
      <div className="flex justify-center">
        <IconTile icon={<Building2 className="h-6 w-6" />} tone={failed ? 'amber' : 'brand'} size="lg" />
      </div>
      <h1 className="mt-4 text-lg font-bold text-slate-900">{text.title}</h1>
      <p className="mt-2 text-sm text-slate-600">{text.body}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {failed ? (
          <Button onClick={onRetry}>
            <RotateCcw className="h-4 w-4" /> Réessayer
          </Button>
        ) : null}
        {user?.role === 'PLATFORM_ADMIN' ? (
          <Link
            to="/app/platform"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Shield className="h-4 w-4" /> Console plateforme
          </Link>
        ) : null}
        <Link
          to="/app/help"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <LifeBuoy className="h-4 w-4" /> Aide
        </Link>
        <Button tone="secondary" onClick={logout}>
          <LogOut className="h-4 w-4" /> Se déconnecter
        </Button>
      </div>
    </Card>
  );
}
