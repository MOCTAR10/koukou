import { Link } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { useFarm } from '../../app/FarmContext';
import { Note } from '../flock/shared';
import { FARM_DELIVERIES_PATH } from '../trace/traceAccess';
import { useFarmDeliveries } from './queries';

/** A reminder on the stock page: programme deliveries still to confirm (they enter the stock once confirmed). */
export function PendingDeliveriesNote() {
  const { farmId } = useFarm();
  const pending = useFarmDeliveries(farmId, 'EXPEDIEE');
  const n = pending.data?.length ?? 0;
  if (n === 0) return null;
  return (
    <Note tone="amber" icon={<Truck />}>
      {n} livraison{n > 1 ? 's' : ''} d’intrants du programme à confirmer : le stock n’en tient compte qu’après votre confirmation.{' '}
      <Link to={FARM_DELIVERIES_PATH} className="font-semibold underline">
        Confirmer la réception
      </Link>
    </Note>
  );
}
