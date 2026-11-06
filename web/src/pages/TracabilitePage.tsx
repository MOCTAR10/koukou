import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { Building2, QrCode, Search } from 'lucide-react';
import { api } from '../api/client';
import type { LotHistory } from '../api/types-trace';
import { useAuth } from '../auth/AuthContext';
import { useFarm } from '../app/FarmContext';
import { useInstitutionAccess } from '../app/useInstitutionAccess';
import { Tabs } from '../components/flock/shared';
import { Button, ErrorNote, inputCls } from '../components/form';
import { LotHistoryView } from '../components/trace/LotHistoryView';
import { FarmLotsTable } from '../components/trace/LotTraceTab';
import { OperatorsPanel } from '../components/trace/OperatorsPanel';
import { TRACE_TAB_PATH, traceRights, traceTabOf, traceTabs, type TraceTab } from '../components/trace/traceAccess';
import { codeFromInput } from '../components/trace/traceLabels';
import { Card, Loading, PageHeader } from '../components/ui';

const TAB_LABEL: Record<TraceTab, string> = {
  lots: 'Lots de la ferme',
  recherche: 'Recherche par code',
  operateurs: 'Opérateurs',
};

/**
 * Traceability (POUFA L7): the active farm's lots, the lookup of a lot by
 * the code read on its label, and the national operators registry. The
 * server checks every call (domain TRACABILITE, ADMINISTRATION for the
 * registry writes); the tabs only follow the matrix.
 */
export function TracabilitePage() {
  const { user } = useAuth();
  const inst = useInstitutionAccess();
  const { farmId, farm } = useFarm();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const rights = traceRights(user?.role, inst.access?.profile);
  const tabs = traceTabs(rights, !!farmId);
  const tab = traceTabOf(pathname, tabs);

  if (inst.pending) return <Loading />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Traçabilité"
        icon={<QrCode />}
        subtitle="Lots des bandes, sous-lots cédés aux opérateurs du programme et étiquettes QR. Le QR code indique l’origine du produit ; il ne constitue pas un certificat sanitaire."
      />
      {tabs.length > 1 ? (
        <Tabs<TraceTab>
          options={tabs.map((k) => ({
            key: k,
            label: TAB_LABEL[k],
            icon: k === 'operateurs' ? <Building2 /> : k === 'recherche' ? <Search /> : <QrCode />,
          }))}
          value={tab}
          onChange={(k) => navigate(TRACE_TAB_PATH[k])}
        />
      ) : null}
      {tab === 'lots' ? (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">{farm?.name ?? 'Ferme active'}</p>
            <p className="text-xs text-slate-500">Lot de chaque bande et sous-lots cédés. Ouvrez un lot pour son historique et son étiquette.</p>
          </div>
          <FarmLotsTable />
        </Card>
      ) : null}
      {tab === 'recherche' ? <CodeSearch /> : null}
      {tab === 'operateurs' ? <OperatorsPanel rights={rights} /> : null}
    </div>
  );
}

/** `GET /trace/lots/by-code/:code`: the code typed, or the QR address pasted. */
function CodeSearch() {
  const [input, setInput] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const history = useQuery({
    queryKey: ['trace-lot-by-code', code],
    queryFn: () => api.getFresh<LotHistory>(`/trace/lots/by-code/${encodeURIComponent(code!)}`),
    enabled: !!code,
    retry: false,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = codeFromInput(input);
    if (c) setCode(c);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Code du lot (G1-0001-B01-L01) ou adresse du QR code"
              aria-label="Code du lot"
              className={`${inputCls} pl-9 font-mono`}
            />
          </div>
          <Button type="submit" busy={history.isFetching}>
            Rechercher
          </Button>
        </form>
      </Card>
      <ErrorNote error={history.error} />
      {history.data ? (
        <Card className="p-5">
          <LotHistoryView
            history={history.data}
            onOpenLot={(id) => {
              const target = [history.data.root, ...history.data.subLots].find((l) => l?.id === id);
              if (target) {
                setInput(target.code);
                setCode(target.code);
              }
            }}
          />
        </Card>
      ) : null}
    </div>
  );
}
