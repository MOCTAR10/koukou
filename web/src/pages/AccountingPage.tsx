import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Landmark, Plus, Scale } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../api/client';
import type {
  BalanceData,
  BilanData,
  CloseExerciceResult,
  CompteResultatData,
  ExerciceInfo,
  JournalData,
  StockProvende,
} from '../api/types-finance';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { ReadOnlyNotice } from '../components/access/ReadOnlyNotice';
import {
  BalanceTab,
  BilanTab,
  ExercicesTab,
  JournalTab,
  ResultatTab,
  StockTab,
} from '../components/finance/AccountingReports';
import { GrandLivreTab } from '../components/finance/GrandLivreTab';
import { RegularisationModal } from '../components/finance/RegularisationModal';
import { ConfirmModal, SuccessNote } from '../components/finance/shared';
import { Button, ErrorNote } from '../components/form';
import { Loading, PageHeader } from '../components/ui';
import { classNames, dateFr, fcfa } from '../lib/format';

type Tab = 'journal' | 'grand-livre' | 'balance' | 'resultat' | 'bilan' | 'stock' | 'exercices';

const TABS: { key: Tab; label: string }[] = [
  { key: 'journal', label: 'Journal' },
  { key: 'grand-livre', label: 'Grand livre' },
  { key: 'balance', label: 'Balance' },
  { key: 'resultat', label: 'Résultat' },
  { key: 'bilan', label: 'Bilan' },
  { key: 'stock', label: 'Stock' },
  { key: 'exercices', label: 'Exercices' },
];

/** The tabs with a PDF, by their `report` value on the export endpoint. */
const EXPORT_REPORT: Partial<Record<Tab, string>> = {
  journal: 'journal',
  balance: 'balance',
  resultat: 'compte-resultat',
  bilan: 'bilan',
};

const QUERY_KEYS = [
  'accounting-journal',
  'accounting-balance',
  'accounting-grand-livre',
  'accounting-grand-livre-opening',
  'accounting-resultat',
  'accounting-bilan',
  'accounting-stock',
  'accounting-exercices',
];

function closeDetails(res: CloseExerciceResult): string {
  const lines = [`${res.exercice.label} est clôturé. ${res.next.label} est ouvert.`];
  if (res.stockFcfa > 0) lines.push(`Stock final valorisé à ${fcfa(res.stockFcfa)} (311/603).`);
  if (res.resultatFcfa > 0) {
    lines.push(`Bénéfice de ${fcfa(res.resultatFcfa)} reporté à nouveau (129/12).`);
  } else if (res.resultatFcfa < 0) {
    lines.push(`Perte de ${fcfa(Math.abs(res.resultatFcfa))} reportée à nouveau (12/129).`);
  }
  return lines.join('\n');
}

export function AccountingPage() {
  const { farmId, farm } = useFarm();
  const { hasPermission } = useFarmProfile();
  const canPost = hasPermission('compta:ecritures');
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('journal');
  const [regulOpen, setRegulOpen] = useState(false);
  const [closing, setClosing] = useState<ExerciceInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const base = `/farms/${farmId}/accounting`;
  const journal = useQuery({
    queryKey: ['accounting-journal', farmId],
    queryFn: () => api.get<JournalData>(`${base}/journal`),
    enabled: !!farmId && tab === 'journal',
  });
  const balance = useQuery({
    queryKey: ['accounting-balance', farmId],
    queryFn: () => api.get<BalanceData>(`${base}/balance`),
    enabled: !!farmId && (tab === 'balance' || tab === 'journal' || tab === 'grand-livre'),
  });
  const resultat = useQuery({
    queryKey: ['accounting-resultat', farmId],
    queryFn: () => api.get<CompteResultatData>(`${base}/compte-resultat`),
    enabled: !!farmId && tab === 'resultat',
  });
  const bilan = useQuery({
    queryKey: ['accounting-bilan', farmId],
    queryFn: () => api.get<BilanData>(`${base}/bilan`),
    enabled: !!farmId && tab === 'bilan',
  });
  const stock = useQuery({
    queryKey: ['accounting-stock', farmId],
    queryFn: () => api.get<StockProvende>(`${base}/stock`),
    enabled: !!farmId && tab === 'stock',
  });
  const exercices = useQuery({
    queryKey: ['accounting-exercices', farmId],
    queryFn: () => api.get<ExerciceInfo[]>(`${base}/exercices`),
    enabled: !!farmId && tab === 'exercices',
  });

  const accountLabels = useMemo(
    () => new Map((balance.data?.accounts ?? []).map((a) => [a.code, a.label])),
    [balance.data],
  );

  const invalidate = () => {
    for (const key of QUERY_KEYS) void queryClient.invalidateQueries({ queryKey: [key, farmId] });
  };

  const init = useMutation({
    mutationFn: () => api.post(`${base}/init`, {}),
    onMutate: () => setNotice(null),
    onSuccess: () => {
      invalidate();
      setNotice('Comptabilité à jour : plan comptable et historique passés en écritures.');
    },
  });

  const close = useMutation({
    mutationFn: (exerciceId: string) => api.post<CloseExerciceResult>(`${base}/exercices/${exerciceId}/close`),
    onSuccess: (res) => {
      setClosing(null);
      invalidate();
      setNotice(closeDetails(res));
    },
  });

  const report = EXPORT_REPORT[tab];
  const exportPdf = useMutation({
    mutationFn: () => api.download(`${base}/export?report=${report}&format=pdf`, `fermia-${report}.pdf`),
  });

  const noQuery = { error: null, isLoading: false };
  const current = tab === 'grand-livre' ? noQuery : { journal, balance, resultat, bilan, stock, exercices }[tab];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Comptabilité SYSCOHADA"
        subtitle={farm?.name ?? 'Ferme'}
        icon={<Landmark />}
        // POUFA lot A droits: an institution granted COMPTABILITE reads the books (exports included), never posts.
        actions={
          <>
            {canPost ? (
              <Button tone="secondary" busy={init.isPending} onClick={() => init.mutate()}>
                {init.isPending ? null : <Scale className="h-4 w-4" />}
                Synchroniser l’historique
              </Button>
            ) : null}
            {report ? (
              <Button tone="secondary" busy={exportPdf.isPending} onClick={() => exportPdf.mutate()}>
                {exportPdf.isPending ? null : <Download className="h-4 w-4" />}
                Exporter PDF
              </Button>
            ) : null}
            {canPost ? (
              <Button onClick={() => setRegulOpen(true)}>
                <Plus className="h-4 w-4" /> Régularisation
              </Button>
            ) : null}
          </>
        }
      />
      <ReadOnlyNotice what="comptabilité SYSCOHADA" />

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setNotice(null);
              exportPdf.reset();
            }}
            className={classNames(
              '-mb-px border-b-2 px-3.5 py-2 text-sm font-semibold transition',
              tab === t.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice ? <SuccessNote>{notice}</SuccessNote> : null}
      <ErrorNote error={init.error} />
      <ErrorNote error={exportPdf.error} />
      <ErrorNote error={current.error} />

      {current.isLoading ? <Loading /> : null}
      {tab === 'journal' && journal.data ? <JournalTab data={journal.data} accountLabels={accountLabels} /> : null}
      {tab === 'grand-livre' && farmId ? (
        <GrandLivreTab farmId={farmId} accounts={(balance.data?.accounts ?? []).map((a) => ({ code: a.code, label: a.label }))} />
      ) : null}
      {tab === 'balance' && balance.data ? <BalanceTab data={balance.data} /> : null}
      {tab === 'resultat' && resultat.data ? <ResultatTab data={resultat.data} /> : null}
      {tab === 'bilan' && bilan.data ? <BilanTab data={bilan.data} /> : null}
      {tab === 'stock' && stock.data ? <StockTab data={stock.data} /> : null}
      {tab === 'exercices' && exercices.data ? (
        <ExercicesTab
          data={exercices.data}
          canClose={canPost}
          closingId={close.isPending ? (close.variables ?? null) : null}
          onClose={(ex) => {
            close.reset();
            setClosing(ex);
          }}
        />
      ) : null}

      {regulOpen && farmId ? (
        <RegularisationModal
          farmId={farmId}
          onClose={() => setRegulOpen(false)}
          onSaved={() => {
            setRegulOpen(false);
            invalidate();
            setNotice('Écriture posée : la régularisation équilibrée a été enregistrée au journal.');
          }}
        />
      ) : null}

      {closing ? (
        <ConfirmModal
          title="Clôturer l’exercice"
          confirmLabel="Clôturer"
          busy={close.isPending}
          error={close.error}
          onConfirm={() => close.mutate(closing.id)}
          onCancel={() => setClosing(null)}
        >
          <p className="font-medium text-slate-800">
            {closing.label} ({dateFr(closing.startDate)} → {dateFr(closing.endDate)})
          </p>
          <p>Le stock final sera valorisé (311/603) et le résultat reporté à nouveau. La clôture est irréversible.</p>
        </ConfirmModal>
      ) : null}
    </div>
  );
}
