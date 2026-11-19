import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileSpreadsheet, Info, TriangleAlert } from 'lucide-react';
import { api } from '../../api/client';
import type { FarmFinancials, StatementLine } from '../../api/types-financing';
import { classNames, dateFr } from '../../lib/format';
import { librevilleDay } from '../../lib/libreville';
import { GroupedBarChart } from '../Charts';
import { Button, DateInput, ErrorNote, inputCls } from '../form';
import { Card, Skeleton, StatusBadge } from '../ui';
import {
  NOT_COMPUTABLE,
  PERIOD_PRESETS,
  PERIOD_PRESET_LABELS,
  READING_LABELS,
  READING_TONES,
  balanceCheck,
  beforeAfterRows,
  coveragePct,
  headlineRatios,
  isLowCoverage,
  monthsText,
  periodError,
  periodFor,
  ratioValueText,
  signedText,
  type Period,
  type PeriodPreset,
} from './financialsLogic';
import { fcfaCompact, monthLabel } from './financingLogic';
import { financialsPdfUrl, useFarmFinancials } from './queries';

// ── Period ─────────────────────────────────────────────────────────────────

export interface PeriodState {
  preset: PeriodPreset;
  setPreset: (p: PeriodPreset) => void;
  custom: Period;
  setCustom: (p: Period) => void;
  /** The period to ask for; null while a free period is incomplete or incoherent. */
  period: Period | null;
  error: string | null;
}

/** Period choice shared by the 360° block and the « attach the statements » dialog. */
export function usePeriodState(initial: PeriodPreset = 'MONTHS_12'): PeriodState {
  const [preset, setPreset] = useState<PeriodPreset>(initial);
  const [custom, setCustom] = useState<Period>(() => periodFor('YEAR_CURRENT'));
  const today = librevilleDay();
  const error = preset === 'CUSTOM' ? periodError(custom, today) : null;
  const period = preset === 'CUSTOM' ? (error ? null : custom) : periodFor(preset, today);
  return { preset, setPreset, custom, setCustom, period, error };
}

export function PeriodPicker({ state, idPrefix }: { state: PeriodState; idPrefix: string }) {
  const today = librevilleDay();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Période</span>
        <select id={`${idPrefix}-period`} className={classNames(inputCls, 'w-auto min-w-[13rem]')} value={state.preset} onChange={(e) => state.setPreset(e.target.value as PeriodPreset)}>
          {PERIOD_PRESETS.map((p) => (
            <option key={p} value={p}>
              {PERIOD_PRESET_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
      {state.preset === 'CUSTOM' ? (
        <>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Du</span>
            <DateInput aria-label="Début de la période" value={state.custom.from} max={today} onChange={(e) => state.setCustom({ ...state.custom, from: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Au</span>
            <DateInput aria-label="Fin de la période" value={state.custom.to} max={today} onChange={(e) => state.setCustom({ ...state.custom, to: e.target.value })} />
          </label>
        </>
      ) : null}
      {state.error ? (
        <p role="alert" className="basis-full text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

const amountText = (n: number): string => (Math.round(n) || 0).toLocaleString('fr-FR');

function FigureTile({ label, value, hint, tone = 'default' }: { label: string; value: number; hint?: string; tone?: 'default' | 'bad' }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={classNames('mt-1 text-lg font-bold tabular-nums', tone === 'bad' ? 'text-red-700' : 'text-slate-900')}>
        {amountText(value)} <span className="text-xs font-medium text-slate-500">FCFA</span>
      </p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function ReliabilityStrip({ f }: { f: FarmFinancials }) {
  const r = f.reliability;
  const low = isLowCoverage(r);
  return (
    <div className={classNames('rounded-xl px-4 py-3 ring-1', low ? 'bg-amber-50 ring-amber-200' : 'bg-slate-50 ring-slate-200')} role="note">
      <p className={classNames('flex items-start gap-2 text-sm font-semibold', low ? 'text-amber-900' : 'text-slate-800')}>
        {low ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />}
        États issus de la saisie de l’exploitation, non audités
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Fact label="Jours saisis">
          {r.daysWithEntries.toLocaleString('fr-FR')} sur {r.daysInPeriod.toLocaleString('fr-FR')} ({coveragePct(r)} %)
        </Fact>
        <Fact label="Écritures comptables">{r.journalEntries.toLocaleString('fr-FR')}</Fact>
        <Fact label="Dernière écriture">{r.lastEntryOn ? dateFr(r.lastEntryOn) : 'Aucune'}</Fact>
        <Fact label="Exercice">{r.closed ? 'Clos' : 'Non clos'}</Fact>
      </dl>
      {low ? <p className="mt-2 text-sm text-amber-900">Moins de 60 % des jours de la période sont saisis : lisez ces chiffres avec prudence.</p> : null}
    </div>
  );
}

function RatioTiles({ ratios }: { ratios: FarmFinancials['ratios'] }) {
  if (ratios.length === 0) return null;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {ratios.map((r) => (
        <li key={r.code}>
          <Card className="h-full p-4">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <p className="text-sm font-semibold text-slate-800">{r.label}</p>
              {r.value == null ? null : r.reading ? (
                <StatusBadge tone={READING_TONES[r.reading]} label={READING_LABELS[r.reading]} />
              ) : (
                <span className="whitespace-nowrap text-xs text-slate-500">Sans seuil défini</span>
              )}
            </div>
            <p className={classNames('mt-2 text-xl font-bold tabular-nums', r.value == null ? 'text-slate-500' : 'text-slate-900')}>{ratioValueText(r.value, r.unit)}</p>
            <p className="mt-1 text-xs text-slate-500">{r.formula}</p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** One side of a statement: its lines, then the total, figures right-aligned. */
function StatementColumn({ title, lines, total, totalLabel }: { title: string; lines: StatementLine[]; total: number; totalLabel: string }) {
  return (
    <table className="w-full self-start text-sm">
      <caption className="sr-only">{title}</caption>
      <thead>
        <tr className="border-b border-slate-200 text-xs text-slate-500">
          <th scope="col" className="py-2 pr-2 text-left font-semibold uppercase tracking-wide">
            {title}
          </th>
          <th scope="col" className="py-2 pl-2 text-right font-medium">
            FCFA
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 ? (
          <tr>
            <td colSpan={2} className="py-3 text-slate-500">
              Aucune ligne sur la période.
            </td>
          </tr>
        ) : (
          lines.map((l) => (
            <tr key={`${l.code}-${l.label}`} className="border-b border-slate-100 align-top">
              <td className="py-1.5 pr-2 text-slate-800">
                <span className="mr-2 font-mono text-xs text-slate-400">{l.code}</span>
                {l.label}
              </td>
              <td className="whitespace-nowrap py-1.5 pl-2 text-right tabular-nums text-slate-900">{amountText(l.amountFcfa)}</td>
            </tr>
          ))
        )}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
          <th scope="row" className="py-2 pr-2 text-left font-semibold">
            {totalLabel}
          </th>
          <td className="whitespace-nowrap py-2 pl-2 text-right tabular-nums">{amountText(total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function StatementCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      <div className="mt-3 grid gap-x-8 gap-y-5 md:grid-cols-2">{children}</div>
      {footer}
    </Card>
  );
}

function IncomeStatement({ i }: { i: NonNullable<FarmFinancials['incomeStatement']> }) {
  return (
    <StatementCard
      title="Compte de résultat"
      footer={
        <p className="mt-3 flex items-baseline justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
          <span>Résultat net (produits − charges)</span>
          <span className={classNames('whitespace-nowrap tabular-nums', i.netResultFcfa < 0 && 'text-red-700')}>{amountText(i.netResultFcfa)} FCFA</span>
        </p>
      }
    >
      <StatementColumn title="Produits" lines={i.products} total={i.revenueFcfa} totalLabel="Total des produits" />
      <StatementColumn title="Charges" lines={i.charges} total={i.chargesFcfa} totalLabel="Total des charges" />
    </StatementCard>
  );
}

function BalanceSheet({ b }: { b: NonNullable<FarmFinancials['balanceSheet']> }) {
  const check = balanceCheck(b);
  return (
    <StatementCard
      title="Bilan"
      subtitle={`Arrêté au ${dateFr(b.asOf)}`}
      footer={
        check.balanced && check.totalsMatchLines ? null : (
          <p role="note" className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {check.balanced
              ? 'Le total d’une colonne ne correspond pas à la somme de ses lignes : vérifiez la saisie de l’exploitation.'
              : `Le total de l’actif et celui du passif diffèrent de ${amountText(Math.abs(check.gapFcfa))} FCFA : la comptabilité de l’exploitation n’est pas équilibrée.`}
          </p>
        )
      }
    >
      <StatementColumn title="Actif" lines={b.assets} total={b.totalAssetsFcfa} totalLabel="Total de l’actif" />
      <StatementColumn title="Passif" lines={b.liabilities} total={b.totalLiabilitiesFcfa} totalLabel="Total du passif" />
    </StatementCard>
  );
}

function CashBlock({ c }: { c: NonNullable<FarmFinancials['cash']> }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-800">Trésorerie</h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FigureTile label="Ouverture" value={c.openingFcfa} />
        <FigureTile label="Encaissements" value={c.inflowsFcfa} />
        <FigureTile label="Décaissements" value={c.outflowsFcfa} />
        <FigureTile label="Clôture" value={c.closingFcfa} tone={c.closingFcfa < 0 ? 'bad' : 'default'} />
      </div>
      {c.monthly.length > 0 ? (
        <Card className="p-4">
          <p className="text-sm font-medium text-slate-800">Encaissements et décaissements par mois</p>
          <div className="mt-2">
            <GroupedBarChart
              height={200}
              valueFmt={(v) => fcfaCompact(v, false)}
              series={[
                { key: 'in', label: 'Encaissements', color: '#059669' },
                { key: 'out', label: 'Décaissements', color: '#d97706', outline: true },
              ]}
              rows={c.monthly.map((m) => ({ label: monthLabel(m.month), values: { in: m.inflowsFcfa, out: m.outflowsFcfa } }))}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function BeforeAfter({ b }: { b: NonNullable<FarmFinancials['beforeAfter']> }) {
  const rows = beforeAfterRows(b);
  const differ = b.before.months !== b.after.months;
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-800">Avant et après le financement</h3>
      <Card className="p-4">
        <p className="text-xs text-slate-500">Avant et après le premier décaissement, le {dateFr(b.pivotDate)}.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th scope="col" className="py-2 pr-2 text-left font-medium">
                  Chiffres de la période
                </th>
                <th scope="col" className="whitespace-nowrap px-2 py-2 text-right font-medium">
                  Avant<span className="block text-xs font-normal">{monthsText(b.before.months)}</span>
                </th>
                <th scope="col" className="whitespace-nowrap px-2 py-2 text-right font-medium">
                  Après<span className="block text-xs font-normal">{monthsText(b.after.months)}</span>
                </th>
                <th scope="col" className="whitespace-nowrap py-2 pl-2 text-right font-medium">
                  Variation<span className="block text-xs font-normal">{differ ? 'par mois' : ''}&nbsp;</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-slate-100">
                  <th scope="row" className="py-2 pr-2 text-left font-medium text-slate-800">
                    {r.label}
                  </th>
                  <td className="whitespace-nowrap px-1.5 py-2 text-right tabular-nums sm:px-2">{r.kind === 'money' ? amountText(r.before ?? 0) : r.before == null ? NOT_COMPUTABLE : `${r.before.toLocaleString('fr-FR')} %`}</td>
                  <td className="whitespace-nowrap px-1.5 py-2 text-right tabular-nums sm:px-2">{r.kind === 'money' ? amountText(r.after ?? 0) : r.after == null ? NOT_COMPUTABLE : `${r.after.toLocaleString('fr-FR')} %`}</td>
                  <td className="whitespace-nowrap py-2 pl-2 text-right tabular-nums">
                    {r.kind === 'money' ? (
                      <>
                        {signedText(r.variation, '')}
                        {r.variationPct != null ? <span className="block text-xs text-slate-500">{`${r.variationPct > 0 ? '+' : r.variationPct < 0 ? '−' : ''}${Math.abs(r.variationPct).toLocaleString('fr-FR')} %`}</span> : null}
                      </>
                    ) : (
                      signedText(r.variation, 'points')
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Montants en FCFA sur les mois couverts.
          {differ ? ' Les deux périodes n’ont pas la même durée : la variation compare les moyennes mensuelles.' : ''}
        </p>
      </Card>
    </div>
  );
}

function PdfButton({ farmId, farmCode, period }: { farmId: string; farmCode: string; period: Period | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        tone="secondary"
        className="whitespace-nowrap"
        busy={busy}
        disabled={!period}
        onClick={() => {
          if (!period) return;
          setBusy(true);
          setError(null);
          api
            .download(financialsPdfUrl(farmId, period.from, period.to), `etats-financiers-${farmCode || farmId}-${period.from}-${period.to}.pdf`)
            .catch(setError)
            .finally(() => setBusy(false));
        }}
      >
        <Download className="h-4 w-4" /> Télécharger en PDF
      </Button>
      <ErrorNote error={error} />
    </div>
  );
}

// ── Block ──────────────────────────────────────────────────────────────────

/** Financial statements of a farm for the credit analyst (SYSCOHADA bookkeeping, not audited). */
export function FinancialsBlock({ farmId, farmCode }: { farmId: string; farmCode: string }) {
  const state = usePeriodState();
  const p = state.period;
  const query = useFarmFinancials(farmId, p?.from ?? '', p?.to ?? '', !!p);
  const f = query.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PeriodPicker state={state} idPrefix="fin360" />
        <PdfButton farmId={farmId} farmCode={farmCode} period={p} />
      </div>
      {f ? (
        <p className="-mt-2 text-xs text-slate-500">
          Du {dateFr(f.from)} au {dateFr(f.to)}.
        </p>
      ) : null}

      {!p ? null : query.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      ) : !f ? (
        <ErrorNote error={query.error ?? 'États financiers indisponibles.'} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <ReliabilityStrip f={f} />
          {!f.initialized ? (
            <p className="flex items-start gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-600">
              <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
              Cette exploitation n’a pas encore ouvert sa comptabilité dans Fermia. Les états financiers seront disponibles dès ses premières écritures.
            </p>
          ) : null}
          {f.initialized && f.ratios.length > 0 ? <RatioTiles ratios={f.ratios} /> : null}
          {f.incomeStatement ? <IncomeStatement i={f.incomeStatement} /> : null}
          {f.balanceSheet ? <BalanceSheet b={f.balanceSheet} /> : null}
          {f.cash ? <CashBlock c={f.cash} /> : null}
          {f.beforeAfter ? <BeforeAfter b={f.beforeAfter} /> : null}
        </>
      )}
    </div>
  );
}

// ── Compact card of the file panel ─────────────────────────────────────────

/** « Santé financière » of a file's farm: a few ratios over the last 12 months, and the way to the full statements. */
export function FinancialHealthCard({ farmId, to }: { farmId: string; to: string }) {
  const period = periodFor('MONTHS_12');
  const query = useFarmFinancials(farmId, period.from, period.to);
  const f = query.data;
  const ratios = f ? headlineRatios(f.ratios) : [];
  return (
    <section aria-label="Santé financière">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Santé financière</h3>
          <Link to={to} className="whitespace-nowrap text-sm font-medium text-brand-700 hover:underline">
            Voir les états financiers
          </Link>
        </div>
        {query.isLoading ? (
          <Skeleton className="mt-3 h-16" />
        ) : !f ? (
          <p className="mt-2 text-sm text-slate-600">Les états financiers ne sont pas disponibles pour l’instant.</p>
        ) : !f.initialized ? (
          <p className="mt-2 text-sm text-slate-600">Cette exploitation n’a pas encore ouvert sa comptabilité dans Fermia.</p>
        ) : (
          <>
            <ul className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {ratios.map((r) => (
                <li key={r.code} className="min-w-0">
                  <p className="text-xs text-slate-500">{r.label}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={classNames('text-base font-bold tabular-nums', r.value == null ? 'text-slate-500' : 'text-slate-900')}>{ratioValueText(r.value, r.unit)}</span>
                    {r.value != null && r.reading ? <StatusBadge tone={READING_TONES[r.reading]} label={READING_LABELS[r.reading]} /> : null}
                  </p>
                </li>
              ))}
            </ul>
            <p className={classNames('mt-3 text-xs', isLowCoverage(f.reliability) ? 'font-medium text-amber-800' : 'text-slate-500')}>
              12 derniers mois, issus de la saisie de l’exploitation, non audités. {f.reliability.daysWithEntries.toLocaleString('fr-FR')} jours saisis sur {f.reliability.daysInPeriod.toLocaleString('fr-FR')}.
            </p>
          </>
        )}
      </Card>
    </section>
  );
}
