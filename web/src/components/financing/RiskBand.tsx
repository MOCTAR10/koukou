import type { PortfolioRisk } from '../../api/types-financing';
import { StackedShare } from '../Charts';
import { Card, DataTable, Td, Th } from '../ui';
import { fcfa, plural } from '../../lib/format';
import { AGEING_COLORS, PROVISIONS_NOTE, PURPOSE_NOTE, shareText, totalOverdue, totalOverdueFiles } from './riskLogic';
import { fcfaCompact } from './financingLogic';

const num = 'whitespace-nowrap text-right tabular-nums';

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-4 pt-4 sm:px-5">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {note ? <p className="mt-0.5 text-xs text-slate-500">{note}</p> : null}
      </div>
      <div className="mt-2">{children}</div>
    </Card>
  );
}

/** Figures for the risk committee: ageing of the overdue amounts, concentration, indicative provisions. */
export function RiskBand({ risk }: { risk: PortfolioRisk }) {
  const overdue = totalOverdue(risk.ageing);
  const { top, byProvince, topSharePct } = risk.concentration;
  const prov = risk.provisions;
  return (
    <section aria-label="Risque" className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Risque</h2>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Block title="Impayés par ancienneté" note="Dossiers ayant un montant échu, selon les jours de retard de leur plus ancienne échéance.">
          {overdue === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-600">Aucun impayé à cette date.</p>
          ) : (
            <div className="space-y-3 px-4 pb-4 sm:px-5">
              <StackedShare
                ariaLabel="Répartition des impayés par ancienneté"
                total={overdue}
                parts={risk.ageing.map((b) => ({
                  key: b.key,
                  label: b.label,
                  value: b.overdueFcfa,
                  color: AGEING_COLORS[b.key],
                  detail: `${plural(b.files, 'dossier')} · ${shareText(overdue > 0 ? Math.round((b.overdueFcfa / overdue) * 1000) / 10 : null)}`,
                }))}
              />
            </div>
          )}
          <DataTable>
            <thead>
              <tr>
                <Th>Retard</Th>
                <Th className="text-right">Dossiers</Th>
                <Th className="text-right">Impayé (FCFA)</Th>
              </tr>
            </thead>
            <tbody>
              {risk.ageing.map((b) => (
                <tr key={b.key}>
                  <Td className="whitespace-nowrap">{b.label}</Td>
                  <Td label="Dossiers" className={num}>{b.files.toLocaleString('fr-FR')}</Td>
                  <Td label="Impayé" className={num}>{fcfa(b.overdueFcfa)}</Td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-semibold text-slate-900">
                <Td className="whitespace-nowrap">Total</Td>
                <Td label="Dossiers" className={num}>{totalOverdueFiles(risk.ageing).toLocaleString('fr-FR')}</Td>
                <Td label="Impayé" className={num}>{fcfa(overdue)}</Td>
              </tr>
            </tbody>
          </DataTable>
        </Block>

        <Block
          title="Concentration de l’encours"
          note={topSharePct == null ? 'Aucun encours à cette date.' : `Les ${plural(top.length, 'plus gros emprunteur')} portent ${shareText(topSharePct)} de l’encours.`}
        >
          <DataTable>
            <thead>
              <tr>
                <Th>Emprunteur</Th>
                <Th className="text-right">Dossiers</Th>
                <Th className="text-right">Encours (FCFA)</Th>
                <Th className="text-right">Part</Th>
              </tr>
            </thead>
            <tbody>
              {top.length === 0 ? (
                <tr>
                  <Td className="text-slate-500">Aucun encours.</Td>
                  <Td />
                  <Td />
                  <Td />
                </tr>
              ) : (
                top.map((t) => (
                  <tr key={t.farmId}>
                    <Td>
                      <span className="font-medium text-slate-900">{t.farmName}</span>
                      {t.provinceName ? <span className="block text-xs text-slate-500">{t.provinceName}</span> : null}
                    </Td>
                    <Td label="Dossiers" className={num}>{t.files.toLocaleString('fr-FR')}</Td>
                    <Td label="Encours" className={num}>{fcfa(t.outstandingFcfa)}</Td>
                    <Td label="Part" className={num}>{shareText(t.sharePct)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
          {byProvince.length > 0 ? (
            <>
              <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">Encours par province</p>
              <DataTable>
                <thead>
                  <tr>
                    <Th>Province</Th>
                    <Th className="text-right">Dossiers</Th>
                    <Th className="text-right">Encours (FCFA)</Th>
                    <Th className="text-right">Part</Th>
                  </tr>
                </thead>
                <tbody>
                  {byProvince.map((p) => (
                    <tr key={p.key}>
                      <Td className="whitespace-nowrap">{p.label}</Td>
                      <Td label="Dossiers" className={num}>{p.files.toLocaleString('fr-FR')}</Td>
                      <Td label="Encours" className={num}>{fcfa(p.outstandingFcfa)}</Td>
                      <Td label="Part" className={num}>{shareText(p.sharePct)}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </>
          ) : null}
          <p className="px-4 pb-4 pt-2 text-xs text-slate-500 sm:px-5">{PURPOSE_NOTE}</p>
        </Block>
      </div>

      <Block title="Provisions indicatives" note={`Total ${fcfaCompact(prov.totalFcfa)}${prov.coveragePct == null ? '' : `, soit ${shareText(prov.coveragePct)} de l’encours`}.`}>
        <DataTable>
          <thead>
            <tr>
              <Th>Classe de créance</Th>
              <Th className="text-right">Dossiers</Th>
              <Th className="text-right">Encours (FCFA)</Th>
              <Th className="text-right">Taux</Th>
              <Th className="text-right">Provision (FCFA)</Th>
            </tr>
          </thead>
          <tbody>
            {prov.rows.map((r) => (
              <tr key={r.claimClass}>
                <Td className="whitespace-nowrap">{r.label}</Td>
                <Td label="Dossiers" className={num}>{r.files.toLocaleString('fr-FR')}</Td>
                <Td label="Encours" className={num}>{fcfa(r.outstandingFcfa)}</Td>
                <Td label="Taux" className={num}>{shareText(r.ratePct)}</Td>
                <Td label="Provision" className={num}>{fcfa(r.provisionFcfa)}</Td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 font-semibold text-slate-900">
              <Td className="whitespace-nowrap">Total</Td>
              <Td label="Dossiers" className={num}>{prov.rows.reduce((n, r) => n + r.files, 0).toLocaleString('fr-FR')}</Td>
              <Td label="Encours" className={num}>{fcfa(prov.rows.reduce((n, r) => n + r.outstandingFcfa, 0))}</Td>
              <Td label="Taux" className={num}>{shareText(prov.coveragePct)}</Td>
              <Td label="Provision" className={num}>{fcfa(prov.totalFcfa)}</Td>
            </tr>
          </tbody>
        </DataTable>
        <p className="px-4 pb-4 pt-2 text-xs text-slate-500 sm:px-5">{PROVISIONS_NOTE}</p>
      </Block>
    </section>
  );
}
