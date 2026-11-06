import { useState, type ChangeEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, ClipboardCheck, FileText, History, PenLine, Play, Scale, Sigma, Users } from 'lucide-react';
import { api } from '../../api/client';
import type { Lot } from '../../api/types-flock';
import type {
  BandComparison,
  BandeIndicators,
  BandeSnapshot,
  BandSheet,
  GenerateReportResult,
  OfficialIndicator,
  ReportRun,
} from '../../api/types-pilotage';
import { useFarm } from '../../app/FarmContext';
import { useInstitutionAccess } from '../../app/useInstitutionAccess';
import { useMenuAccess } from '../../app/useMenuAccess';
import { useAuth } from '../../auth/AuthContext';
import { classNames, dateFr, dateTimeFr, fcfa } from '../../lib/format';
import { Button, ErrorNote, Field, FormColumns, Modal, inputCls } from '../form';
import { Note, Pill, SectionCard, useInvalidateFarm } from '../flock/shared';
import { canCorrectClosedBand } from '../pilotage/pilotageAccess';
import { END_OF_BAND_TEMPLATE } from '../pilotage/reports';
import { RUNS_KEY, RunDetail, RunsTable } from '../pilotage/ReportsView';
import { DataTable, Loading, Td, Th } from '../ui';
import {
  COMPARISON_FIELDS,
  COMPARISON_LABELS,
  CORRECTION_REASON_MIN,
  EMPTY_CORRECTION,
  TRIGGER_LABELS,
  compareTone,
  comparisonValueLabel,
  correctionBody,
  correctionError,
  formulaVersionLabel,
  indicatorValueLabel,
  latestComparableWeek,
  programmeCell,
  splitIndicators,
  type CorrectionForm,
} from './bandSummary';

/**
 * « Bilan POUFA » of a band (CDC rows 10-15, 36): the band sheet, the
 * official indicators with the formula version in force, the comparison
 * with the anonymous programme average per age week, the frozen bilans
 * (one version per correction), the closed-band correction for an
 * authorized profile and the end-of-band reports.
 */
export function BandSummaryTab({ lot }: { lot: Lot }) {
  const { farmId } = useFarm();
  const base = `/farms/${farmId}/bandes/${lot.id}`;
  const closed = lot.status === 'CLOTURE';
  const [asOf, setAsOf] = useState('');
  const sheet = useQuery({ queryKey: ['bande-sheet', farmId, lot.id], queryFn: () => api.get<BandSheet>(base), enabled: !!farmId });
  const indicators = useQuery({
    queryKey: ['bande-indicators', farmId, lot.id, asOf],
    queryFn: () => api.get<BandeIndicators>(`${base}/indicators${asOf ? `?asOf=${asOf}` : ''}`),
    enabled: !!farmId,
    retry: false,
  });
  const comparison = useQuery({
    queryKey: ['bande-comparison', farmId, lot.id],
    queryFn: () => api.get<BandComparison>(`${base}/comparison`),
    enabled: !!farmId,
    retry: false,
  });

  return (
    <div className="space-y-4">
      <SheetCard sheet={sheet.data} error={sheet.error} loading={sheet.isLoading} />
      <ComparisonSummary comparison={comparison.data} />
      <SectionCard
        title="Indicateurs officiels"
        subtitle="Calculés avec les formules du programme en vigueur à la date"
        icon={<Sigma />}
        actions={
          <label className="flex items-center gap-2 text-xs text-slate-500">
            À la date
            <input
              type="date"
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
              value={asOf}
              min={lot.integrationDate.slice(0, 10)}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </label>
        }
      >
        {indicators.isLoading ? <Loading /> : indicators.error ? <ErrorNote error={indicators.error} /> : indicators.data ? <IndicatorsBlock data={indicators.data} /> : null}
      </SectionCard>
      <ComparisonCard query={comparison} />
      {closed || sheet.data?.lastSnapshotVersion ? <SnapshotsCard lot={lot} sheet={sheet.data} /> : null}
      <BandReports lot={lot} closed={closed} />
    </div>
  );
}

function SheetCard({ sheet, error, loading }: { sheet: BandSheet | undefined; error: unknown; loading: boolean }) {
  if (loading) return <Loading />;
  if (error || !sheet) return <ErrorNote error={error ?? 'Fiche de bande indisponible.'} />;
  const w = sheet.weighing;
  return (
    <SectionCard title={`Fiche de la bande ${sheet.code ?? ''}`.trim()} icon={<ClipboardCheck />}>
      <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Line label="Ouverture">
          {dateFr(sheet.integrationDate)}
          {sheet.initialAgeDays ? ` à J${sheet.initialAgeDays}` : ''}
        </Line>
        <Line label={sheet.closedAt ? 'Âge à la clôture' : 'Âge'}>J{sheet.ageDays}</Line>
        <Line label="Durée de référence">{sheet.referenceDurationDays != null ? `${sheet.referenceDurationDays} j` : '—'}</Line>
        <Line label="Fin prévue">{dateFr(sheet.expectedEndDate)}</Line>
        <Line label="Clôture">{sheet.closedAt ? dateFr(sheet.closedAt) : 'en cours'}</Line>
        <Line label="Effectif">
          {sheet.quantityAlive.toLocaleString('fr-FR')} / {sheet.quantityAtStart.toLocaleString('fr-FR')}
        </Line>
        <Line label="Complétude des saisies">{sheet.completenessPct != null ? `${sheet.completenessPct.toLocaleString('fr-FR')} %` : '—'}</Line>
        <Line label="Dernière pesée">
          {w.lastWeighingDate ? `${dateFr(w.lastWeighingDate)}${w.lastSampleSize ? ` (${w.lastSampleSize} sujets)` : ''}` : 'aucune'}
        </Line>
        <Line label="Prochaine pesée">
          <span className={w.late ? 'text-red-700' : undefined}>
            {dateFr(w.nextDueDate)}
            {w.late ? ` · ${w.daysLate} j de retard` : ''}
          </span>
        </Line>
      </div>
      {w.lastSampleBelowExpected ? (
        <p className="mt-2 text-xs text-amber-700">La dernière pesée compte moins de sujets que les {w.expectedSampleSize} demandés par le programme.</p>
      ) : null}
    </SectionCard>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{children}</span>
    </div>
  );
}

function IndicatorsBlock({ data }: { data: BandeIndicators }) {
  const { official, others } = splitIndicators(data.indicators);
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Au {dateFr(data.asOf)} (J{data.ageDays}) · formules en vigueur le {dateTimeFr(data.parametersAt)}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {official.map((i) => (
          <IndicatorCard key={i.key} i={i} />
        ))}
      </div>
      {others.length > 0 ? <IndicatorTable list={others} /> : null}
    </div>
  );
}

function IndicatorCard({ i }: { i: OfficialIndicator }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{i.label}</p>
      <p className={classNames('mt-0.5 text-lg font-bold tabular-nums', i.value == null ? 'text-sm font-medium text-slate-400' : 'text-slate-800')}>
        {indicatorValueLabel(i)}
      </p>
      <p className="mt-1 break-words font-mono text-[11px] text-slate-600" title="Formule">
        {i.expression}
      </p>
      <p className="mt-0.5 text-[11px] text-slate-400">{formulaVersionLabel(i, dateFr)}</p>
    </div>
  );
}

function IndicatorTable({ list }: { list: OfficialIndicator[] }) {
  return (
    <DataTable>
      <thead>
        <tr>
          <Th>Indicateur</Th>
          <Th>Valeur</Th>
          <Th>Formule</Th>
          <Th className="hidden lg:table-cell">Version</Th>
        </tr>
      </thead>
      <tbody>
        {list.map((i) => (
          <tr key={i.key}>
            <Td>
              <span className="font-medium text-slate-800">{i.label}</span>
            </Td>
            <Td label="Valeur">{indicatorValueLabel(i)}</Td>
            <Td label="Formule" className="font-mono text-xs">
              {i.expression}
            </Td>
            <Td label="Version" className="text-xs text-slate-500 md:max-lg:hidden">
              {formulaVersionLabel(i, dateFr)}
            </Td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

const TONE_CLS = { better: 'text-emerald-700', worse: 'text-red-700', same: 'text-slate-700' } as const;

/** Small « comparaison au programme » card: the latest week both values are known. */
function ComparisonSummary({ comparison }: { comparison: BandComparison | undefined }) {
  if (!comparison) return null;
  const w = latestComparableWeek(comparison);
  if (!w || !w.band || !w.programme) return null;
  const band = w.band;
  const prog = w.programme;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Users className="h-4 w-4 text-slate-400" /> Comparaison au programme · semaine {w.week} (J{w.ageFrom}-J{w.ageTo})
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {COMPARISON_FIELDS.map((f) => {
          const tone = compareTone(f, band[f], prog[f]);
          return (
            <div key={f} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{COMPARISON_LABELS[f]}</p>
              <p className={classNames('font-bold tabular-nums', tone ? TONE_CLS[tone] : 'text-slate-800')}>{comparisonValueLabel(f, band[f])}</p>
              <p className="text-xs text-slate-500">moyenne du programme : {comparisonValueLabel(f, prog[f])}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Moyenne anonyme de {prog.bands} bandes de {prog.farms} autres fermes, même espèce et même type.
      </p>
    </div>
  );
}

function ComparisonCard({ query }: { query: { data?: BandComparison; error: unknown; isLoading: boolean } }) {
  const c = query.data;
  return (
    <SectionCard title="Comparaison avec la moyenne du programme" subtitle="Par semaine d’âge, autres fermes du programme, anonyme" icon={<BarChart3 />} flush>
      {query.isLoading ? (
        <Loading />
      ) : query.error || !c ? (
        <div className="p-4">
          <ErrorNote error={query.error ?? 'Comparaison indisponible.'} />
        </div>
      ) : c.weeks.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">Pas encore de semaine d’âge à comparer.</p>
      ) : (
        <>
          <DataTable>
            <thead>
              <tr>
                <Th>Semaine d’âge</Th>
                {COMPARISON_FIELDS.map((f) => (
                  <Th key={f}>{COMPARISON_LABELS[f]} (bande / programme)</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.weeks.map((w) => (
                <tr key={w.week} className={w.week === c.currentWeek ? 'bg-brand-50/50' : undefined}>
                  <Td>
                    <span className="font-medium text-slate-800">S{w.week}</span>{' '}
                    <span className="text-xs text-slate-500">
                      J{w.ageFrom}-J{w.ageTo}
                    </span>
                    {w.week === c.currentWeek ? <span className="ml-1 text-xs text-brand-700">(en cours)</span> : null}
                  </Td>
                  {COMPARISON_FIELDS.map((f) => {
                    const cell = programmeCell(w, f, c.minGroupSize);
                    const tone = cell.suppressed ? null : compareTone(f, w.band?.[f], w.programme?.[f]);
                    return (
                      <Td key={f} label={COMPARISON_LABELS[f]}>
                        <span className={classNames('font-medium tabular-nums', tone ? TONE_CLS[tone] : undefined)}>{comparisonValueLabel(f, w.band?.[f])}</span>
                        <span className="text-slate-400"> / </span>
                        <span className={cell.suppressed ? 'text-xs italic text-slate-400' : 'tabular-nums text-slate-600'}>{cell.text}</span>
                      </Td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </DataTable>
          <details className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <summary className="cursor-pointer font-medium text-slate-600">Méthode</summary>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {c.method.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </SectionCard>
  );
}

function SnapshotsCard({ lot, sheet }: { lot: Lot; sheet: BandSheet | undefined }) {
  const { farmId } = useFarm();
  const { user } = useAuth();
  const { access } = useInstitutionAccess();
  const snapshots = useQuery({
    queryKey: ['bande-snapshots', farmId, lot.id],
    queryFn: () => api.get<BandeSnapshot[]>(`/farms/${farmId}/bandes/${lot.id}/snapshots`),
    enabled: !!farmId,
    retry: false,
  });
  const [picked, setPicked] = useState<number | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const list = snapshots.data ?? [];
  const current = list.find((s) => s.version === picked) ?? list[list.length - 1] ?? null;
  const mayCorrect = lot.status === 'CLOTURE' && canCorrectClosedBand(user?.role, access?.profile);

  return (
    <SectionCard
      title="Bilan figé de la bande"
      subtitle="Version 1 à la clôture ; une nouvelle version par correction, les précédentes restent lisibles."
      icon={<History />}
      actions={
        mayCorrect ? (
          <Button tone="secondary" onClick={() => setCorrecting(true)}>
            <PenLine className="h-4 w-4" /> Corriger
          </Button>
        ) : null
      }
    >
      {snapshots.isLoading ? (
        <Loading />
      ) : snapshots.error ? (
        <ErrorNote error={snapshots.error} />
      ) : list.length === 0 ? (
        <p className="text-sm text-slate-500">Le bilan figé se calcule à la clôture : il apparaîtra dans un instant.</p>
      ) : current ? (
        <div className="space-y-3">
          {list.length > 1 ? (
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Versions du bilan">
              {list.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={s.version === current.version}
                  onClick={() => setPicked(s.version)}
                  className={classNames(
                    'rounded-full px-2.5 py-1 text-xs font-medium ring-1',
                    s.version === current.version ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  Version {s.version}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Pill tone={current.trigger === 'CORRECTION' ? 'amber' : 'slate'}>
              Version {current.version} · {TRIGGER_LABELS[current.trigger]}
            </Pill>
            <span className="text-slate-500">
              au {dateFr(current.asOf)} · {current.durationDays} j d’élevage · J{current.ageDays} · enregistré le {dateTimeFr(current.createdAt)}
            </span>
          </div>
          {current.reason ? <Note tone="amber">Motif : {current.reason}</Note> : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Mini label="Complétude">{current.completenessPct != null ? `${current.completenessPct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : '—'}</Mini>
            <Mini label="Recettes">{fcfa(current.revenueFcfa)}</Mini>
            <Mini label="Charges">{fcfa(current.chargesFcfa)}</Mini>
            <Mini label="Marge">{fcfa(current.marginFcfa)}</Mini>
          </div>
          <SnapshotIndicators list={current.indicators} />
        </div>
      ) : null}
      {correcting && sheet ? <CorrectionModal lot={lot} sheet={sheet} onClose={() => setCorrecting(false)} /> : null}
    </SectionCard>
  );
}

function SnapshotIndicators({ list }: { list: OfficialIndicator[] }) {
  const { official, others } = splitIndicators(list);
  return <IndicatorTable list={[...official, ...others]} />;
}

function Mini({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-bold tabular-nums text-slate-800">{children}</p>
    </div>
  );
}

function CorrectionModal({ lot, sheet, onClose }: { lot: Lot; sheet: BandSheet; onClose: () => void }) {
  const { farmId } = useFarm();
  const qc = useQueryClient();
  const invalidateFarm = useInvalidateFarm();
  const [form, setForm] = useState<CorrectionForm>(EMPTY_CORRECTION);
  const [checkError, setCheckError] = useState<string | null>(null);
  const bounds = { from: lot.integrationDate.slice(0, 10), to: sheet.closedAt ? sheet.closedAt.slice(0, 10) : null };
  const save = useMutation({
    mutationFn: () => api.post<{ snapshot: BandeSnapshot }>(`/farms/${farmId}/bandes/${lot.id}/corrections`, correctionBody(form)),
    onSuccess: async () => {
      await Promise.all(
        ['bande-snapshots', 'bande-indicators', 'bande-sheet', 'bande-comparison'].map((k) => qc.invalidateQueries({ queryKey: [k, farmId] })),
      );
      await invalidateFarm();
      onClose();
    },
  });
  const set = (k: keyof CorrectionForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const submit = () => {
    const err = correctionError(form, bounds);
    setCheckError(err);
    if (!err) save.mutate();
  };
  return (
    <Modal large title={`Corriger la bande clôturée ${sheet.code ?? ''}`.trim()} onClose={onClose}>
      <div className="space-y-4">
        <Note tone="amber">
          La correction remplace les valeurs saisies de ce jour, est inscrite au journal d’audit avec son motif et produit une nouvelle version du bilan. Les
          versions précédentes restent lisibles.
        </Note>
        <FormColumns>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Jour corrigé">
              <input type="date" className={inputCls} value={form.entryDate} min={bounds.from} max={bounds.to ?? undefined} onChange={set('entryDate')} />
            </Field>
            <Field label="Morts">
              <input inputMode="numeric" className={inputCls} value={form.deaths} onChange={set('deaths')} />
            </Field>
            <Field label="Aliment consommé (kg)">
              <input inputMode="decimal" className={inputCls} value={form.feedQuantityKg} onChange={set('feedQuantityKg')} />
            </Field>
            <Field label="Eau (L)">
              <input inputMode="decimal" className={inputCls} value={form.waterL} onChange={set('waterL')} />
            </Field>
            <Field label="Poids moyen (kg)">
              <input inputMode="decimal" className={inputCls} value={form.avgWeightKg} onChange={set('avgWeightKg')} />
            </Field>
            <Field label="Sujets pesés">
              <input inputMode="numeric" className={inputCls} value={form.sampleSize} onChange={set('sampleSize')} />
            </Field>
          </div>
          <div className="space-y-3">
            <Field label="Motif de la correction" hint={`Obligatoire, ${CORRECTION_REASON_MIN} caractères au moins.`}>
              <textarea className={inputCls} rows={5} maxLength={1000} value={form.reason} onChange={set('reason')} />
            </Field>
            <p className="text-xs text-slate-500">Laissez vide un champ à ne pas changer.</p>
          </div>
        </FormColumns>
        <ErrorNote error={checkError ?? save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button busy={save.isPending} onClick={submit}>
            <Scale className="h-4 w-4" /> Enregistrer la correction
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** End-of-band reports of this band (`GET /pilotage/reports/runs?level=BANDE`, already limited to the reader's farms by the server). */
function BandReports({ lot, closed }: { lot: Lot; closed: boolean }) {
  const { pilotage, canRead } = useMenuAccess();
  const qc = useQueryClient();
  const readable = pilotage.runs && canRead('PILOTAGE');
  const runs = useQuery({
    queryKey: [RUNS_KEY, 'band', lot.id],
    queryFn: () => api.get<ReportRun[]>('/pilotage/reports/runs?level=BANDE'),
    enabled: readable && closed,
    retry: false,
  });
  const [open, setOpen] = useState<string | null>(null);
  const generate = useMutation({
    mutationFn: () => api.post<GenerateReportResult>(`/pilotage/reports/templates/${END_OF_BAND_TEMPLATE}/runs`, { batchId: lot.id }),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: [RUNS_KEY] });
      setOpen(res.run.id);
    },
  });
  if (!closed || !readable) return null;
  const mine = (runs.data ?? []).filter((r) => r.batchId === lot.id);
  return (
    <SectionCard
      title="Rapport de fin de bande"
      subtitle="PDF figé à la clôture, avec son empreinte SHA-256"
      icon={<FileText />}
      flush
      actions={
        pilotage.generate && mine.length === 0 ? (
          <Button tone="secondary" busy={generate.isPending} onClick={() => generate.mutate()}>
            <Play className="h-4 w-4" /> Produire maintenant
          </Button>
        ) : null
      }
    >
      {generate.error ? (
        <div className="p-4">
          <ErrorNote error={generate.error} />
        </div>
      ) : null}
      {runs.isLoading ? (
        <Loading />
      ) : runs.error ? (
        <div className="p-4">
          <ErrorNote error={runs.error} />
        </div>
      ) : mine.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">Le rapport se produit automatiquement dans l’heure qui suit la clôture.</p>
      ) : (
        <RunsTable runs={mine} onOpen={setOpen} />
      )}
      <p className="border-t border-slate-100 px-4 py-2 text-xs">
        <Link to="/app/pilotage/rapports" className="font-medium text-brand-700 hover:underline">
          {pilotage.view ? 'Tous les rapports du programme' : 'Tous les rapports de fin de bande de mes fermes'}
        </Link>
      </p>
      {open ? <RunDetail id={open} onClose={() => setOpen(null)} /> : null}
    </SectionCard>
  );
}
