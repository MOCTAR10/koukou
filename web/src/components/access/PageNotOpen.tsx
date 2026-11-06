import { KeyRound, ShieldOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MY_ACCESS_PATH } from '../../app/menu-access';
import { Card, IconTile } from '../ui';

/** A typed URL the institution's access profile doesn't open (instead of a page of 403s). */
export function PageNotOpen() {
  return (
    <Card className="mx-auto mt-6 max-w-xl p-6 text-center sm:p-8">
      <div className="flex justify-center">
        <IconTile icon={<ShieldOff className="h-6 w-6" />} tone="amber" size="lg" />
      </div>
      <h1 className="mt-4 text-lg font-bold text-slate-900">Cette page n’est pas ouverte à votre profil</h1>
      <p className="mt-2 text-sm text-slate-600">
        Votre profil d’accès au programme ne donne pas les droits qu’elle demande, ou elle relève de la gestion propre de la ferme.
        Les droits se règlent dans les profils d’accès, par l’administration du programme.
      </p>
      <div className="mt-6 flex justify-center">
        <Link
          to={MY_ACCESS_PATH}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <KeyRound className="h-4 w-4" /> Voir mon accès
        </Link>
      </div>
    </Card>
  );
}
