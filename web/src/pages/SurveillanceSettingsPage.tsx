import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ListChecks, Settings2, Syringe } from 'lucide-react';
import { PageNotOpen } from '../components/access/PageNotOpen';
import { Tabs } from '../components/flock/shared';
import { SanitaryListsAdmin } from '../components/surveillance/SanitaryListsAdmin';
import { VaccinationCalendarsAdmin } from '../components/surveillance/VaccinationCalendarsAdmin';
import { useSurveillanceRights } from '../components/surveillance/useSurveillanceRights';
import { Loading, PageHeader } from '../components/ui';

type Tab = 'listes' | 'calendriers';

/**
 * What the veterinary services set for the whole programme (POUFA L5):
 * sanitary lists and reference vaccination calendars. Rights from the
 * matrix (SANITAIRE CREER / MODIFIER), never a hard-coded owner.
 */
export function SurveillanceSettingsPage() {
  const rights = useSurveillanceRights();
  const [tab, setTab] = useState<Tab>('listes');
  if (rights.loading) return <Loading />;
  if (!rights.view || !rights.settings) return <PageNotOpen />;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Listes et calendriers sanitaires"
        icon={<Settings2 />}
        subtitle="Signes cliniques, produits de traitement, statuts des alertes et calendriers vaccinaux de référence du programme"
        actions={
          <Link to="/app/surveillance" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" /> Alertes
          </Link>
        }
      />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { key: 'listes', label: 'Listes sanitaires', icon: <ListChecks /> },
          { key: 'calendriers', label: 'Calendriers vaccinaux', icon: <Syringe /> },
        ]}
      />
      {tab === 'listes' ? <SanitaryListsAdmin canEdit={rights.editLists} /> : <VaccinationCalendarsAdmin canCreate={rights.createCalendars} canEdit={rights.editCalendars} />}
    </div>
  );
}
