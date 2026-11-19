import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FolderOpen, Plus, Search } from 'lucide-react';
import { CLAIM_CLASS_LABELS, FINANCING_STEPS, FINANCING_STEP_LABELS, type ClaimClass, type FinancingStep } from '../../api/types-financing';
import { useMenuAccess } from '../../app/useMenuAccess';
import { FilePanel } from '../../components/financing/FilePanel';
import { NewFileModal } from '../../components/financing/NewFileModal';
import {
  EMPTY_FILE_FILTERS,
  FILES_PAGE_SIZE,
  daysLateText,
  fileFilterParams,
  pageRange,
  parseFileFilters,
  type FileFilters,
} from '../../components/financing/financingLogic';
import { useFinancingFiles, usePortfolio } from '../../components/financing/queries';
import { ClaimClassBadge, ConsentBadge, StepBadge } from '../../components/financing/shared';
import { Button, ErrorNote, inlineInputCls, inputCls } from '../../components/form';
import { Card, DataTable, EmptyState, PageHeader, SkeletonRows, Td, Th } from '../../components/ui';
import { classNames, fcfa } from '../../lib/format';

const DOSSIER_PARAM = 'dossier';

/** The financing files: filters in the URL, paged by the server, `?dossier=<id>` opens the file's panel. */
export function FilesPage() {
  const { financing } = useMenuAccess();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFileFilters(params), [params]);
  const openId = params.get(DOSSIER_PARAM);
  const creating = params.get('nouveau') === '1';
  const [q, setQ] = useState(filters.q);
  const written = useRef(filters.q);

  const list = useFinancingFiles(filters, financing.view);
  // Province options come from the portfolio buckets (same keys the server filters on).
  const portfolio = usePortfolio(financing.view);
  const provinces = portfolio.data?.byProvince ?? [];

  const update = (next: FileFilters) => setParams(fileFilterParams(next, params), { replace: true });
  const setFilter = <K extends keyof FileFilters>(key: K, value: FileFilters[K]) => update({ ...filters, [key]: value, page: key === 'page' ? (value as number) : 1 });
  const openFile = (id: string | null) => {
    const next = new URLSearchParams(params);
    next.delete('nouveau');
    if (id) next.set(DOSSIER_PARAM, id);
    else next.delete(DOSSIER_PARAM);
    setParams(next);
  };

  // The search box writes the URL once typing pauses; the URL wins when it changes otherwise.
  useEffect(() => {
    const typed = q.trim();
    const t = window.setTimeout(() => {
      written.current = typed;
      setParams(
        (prev) => {
          const cur = parseFileFilters(prev);
          return cur.q === typed ? prev : fileFilterParams({ ...cur, q: typed, page: 1 }, prev);
        },
        { replace: true },
      );
    }, 300);
    return () => window.clearTimeout(t);
  }, [q, setParams]);
  useEffect(() => {
    if (filters.q !== written.current) {
      written.current = filters.q;
      setQ(filters.q);
    }
  }, [filters.q]);

  const data = list.data;
  const hasFilters = !!(filters.step || filters.claimClass || filters.province || filters.q);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dossiers de financement"
        icon={<FolderOpen className="h-6 w-6" />}
        subtitle={data ? `${data.total.toLocaleString('fr-FR')} dossier${data.total > 1 ? 's' : ''}` : undefined}
        actions={
          financing.create ? (
            <Button
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('nouveau', '1');
                setParams(next);
              }}
            >
              <Plus className="h-4 w-4" /> Nouveau dossier
            </Button>
          ) : null
        }
      />

      <Card className="p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <label className="relative block">
            <span className="sr-only">Rechercher un dossier</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              className={classNames(inputCls, 'pl-9')}
              placeholder="Référence, ferme, exploitant, objet"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="sr-only">Étape</span>
            <select className={inputCls} value={filters.step} onChange={(e) => setFilter('step', e.target.value as FinancingStep | '')}>
              <option value="">Toutes les étapes</option>
              {FINANCING_STEPS.map((s) => (
                <option key={s} value={s}>
                  {FINANCING_STEP_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Classe de créance</span>
            <select className={inputCls} value={filters.claimClass} onChange={(e) => setFilter('claimClass', e.target.value as ClaimClass | '')}>
              <option value="">Toutes les classes</option>
              {(Object.keys(CLAIM_CLASS_LABELS) as ClaimClass[]).map((c) => (
                <option key={c} value={c}>
                  {CLAIM_CLASS_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Province</span>
            <select className={inputCls} value={filters.province} onChange={(e) => setFilter('province', e.target.value)}>
              <option value="">Toutes les provinces</option>
              {provinces.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {hasFilters ? (
          <button type="button" className="mt-2 text-xs font-semibold text-brand-700 hover:underline" onClick={() => update({ ...EMPTY_FILE_FILTERS })}>
            Effacer les filtres
          </button>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        {list.isLoading ? (
          <SkeletonRows rows={8} />
        ) : list.isError && !data ? (
          <div className="p-4">
            <ErrorNote error={list.error} onRetry={() => void list.refetch()} />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<FolderOpen className="h-6 w-6" />}
              title={hasFilters ? 'Aucun dossier ne correspond' : 'Aucun dossier pour l’instant'}
              message={hasFilters ? 'Essayez d’élargir les filtres.' : 'Ouvrez un premier dossier en choisissant une ferme du registre, l’objet du financement et le montant demandé.'}
              action={!hasFilters && financing.create ? <Button onClick={() => setParams(new URLSearchParams({ nouveau: '1' }))}>Nouveau dossier</Button> : undefined}
            />
          </div>
        ) : (
          <>
            <DataTable>
              <thead>
                <tr>
                  <Th>Dossier</Th>
                  <Th className="hidden lg:table-cell">Objet</Th>
                  <Th>Étape</Th>
                  <Th>Classe</Th>
                  <Th className="text-right">Accordé</Th>
                  <Th className="hidden text-right lg:table-cell">Encours</Th>
                  <Th className="hidden text-right xl:table-cell">Retard</Th>
                  <Th className="hidden xl:table-cell">Pièces</Th>
                  <Th className="hidden xl:table-cell">Consentement</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((f) => (
                  <tr key={f.id} className={classNames('cursor-pointer hover:bg-slate-50', openId === f.id && 'bg-brand-50/50')} onClick={() => openFile(f.id)}>
                    <Td>
                      <button
                        type="button"
                        className="text-left font-semibold text-brand-700 hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          openFile(f.id);
                        }}
                      >
                        {f.reference}
                      </button>
                      <span className="block text-sm text-slate-800">{f.farmName}</span>
                      <span className="block text-xs text-slate-500">
                        {f.farmCode}
                        {f.provinceName ? ` · ${f.provinceName}` : ''}
                      </span>
                    </Td>
                    <Td label="Objet" className="max-w-[16rem] md:max-lg:hidden">
                      <span className="line-clamp-2">{f.purpose}</span>
                    </Td>
                    <Td label="Étape">
                      <StepBadge step={f.step} decision={f.decision} />
                    </Td>
                    <Td label="Classe">
                      <ClaimClassBadge value={f.claimClass} />
                    </Td>
                    <Td label="Accordé" className="text-right tabular-nums">
                      {fcfa(f.amounts.grantedFcfa)}
                    </Td>
                    <Td label="Encours" className="text-right tabular-nums md:max-lg:hidden">
                      {fcfa(f.amounts.outstandingFcfa)}
                    </Td>
                    <Td label="Retard" className={classNames('text-right tabular-nums md:max-xl:hidden', f.daysLate > 0 && 'font-semibold text-red-700')}>
                      {daysLateText(f.daysLate)}
                    </Td>
                    <Td label="Pièces" className="tabular-nums md:max-xl:hidden">
                      {f.documents.expected > 0 ? `${f.documents.provided} sur ${f.documents.expected}` : '—'}
                      {f.documents.rejected > 0 ? <span className="block text-xs text-red-700">{f.documents.rejected} rejetée{f.documents.rejected > 1 ? 's' : ''}</span> : null}
                    </Td>
                    <Td label="Consentement" className="md:max-xl:hidden">
                      <ConsentBadge value={f.consent} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 text-sm text-slate-600">
              <span aria-live="polite">{pageRange(data.page, data.pageSize || FILES_PAGE_SIZE, data.total)}</span>
              <span className="inline-flex items-center gap-1">
                <button
                  type="button"
                  className={classNames(inlineInputCls, 'inline-flex items-center gap-1 px-2.5 disabled:opacity-40')}
                  disabled={filters.page <= 1}
                  onClick={() => setFilter('page', filters.page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" /> Précédent
                </button>
                <span className="px-2 tabular-nums">
                  Page {filters.page} sur {totalPages}
                </span>
                <button
                  type="button"
                  className={classNames(inlineInputCls, 'inline-flex items-center gap-1 px-2.5 disabled:opacity-40')}
                  disabled={filters.page >= totalPages}
                  onClick={() => setFilter('page', filters.page + 1)}
                >
                  Suivant <ChevronRight className="h-4 w-4" />
                </button>
              </span>
            </div>
          </>
        )}
      </Card>

      {openId ? <FilePanel fileId={openId} onClose={() => openFile(null)} /> : null}
      {creating && financing.create ? (
        <NewFileModal
          onClose={() => {
            const next = new URLSearchParams(params);
            next.delete('nouveau');
            setParams(next);
          }}
          onCreated={(id) => {
            const next = new URLSearchParams(params);
            next.delete('nouveau');
            next.set(DOSSIER_PARAM, id);
            setParams(next);
          }}
        />
      ) : null}
    </div>
  );
}
