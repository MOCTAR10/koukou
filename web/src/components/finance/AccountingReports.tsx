import { Boxes, CircleAlert, CircleCheck, Landmark, Lock, Scale } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import type {
  AccountSoldes,
  AccountingSource,
  BalanceData,
  BilanData,
  CompteResultatData,
  ExerciceInfo,
  JournalData,
  StockProvende,
} from '../../api/types-finance';
import { classNames, dateFr, fcfa, num } from '../../lib/format';
import { Button, todayIso } from '../form';
import { Card, EmptyState, IconTile, Td, Th } from '../ui';
import { KeyValue, SectionTitle } from './shared';

const SOURCE_LABEL: Record<AccountingSource, string> = {
  SALE: 'Vente',
  PAYMENT: 'Paiement',
  EXPENSE: 'Dépense',
  CAISSE: 'Caisse',
  ORDER: 'Commande',
  INPUT: 'Intrant',
  REGULARISATION: 'Régularisation',
  STOCK: 'Stock',
  CLOTURE: 'Clôture',
};

const CLASSE_LABEL: Record<number, string> = {
  1: 'capitaux et dettes financières',
  2: 'immobilisations',
  3: 'stocks',
  4: 'tiers',
  5: 'trésorerie',
  6: 'charges',
  7: 'produits',
  8: 'hors bilan',
};

function AccountCode({ code }: { code: string }) {
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">{code}</span>;
}


export function JournalTab({
  data,
  accountLabels,
}: {
  data: JournalData;
  /** Chart of accounts, to name the lines posted without their own label. */
  accountLabels: Map<string, string>;
}) {
  if (data.entries.length === 0) {
    return (
      <EmptyState
        message="Aucune écriture pour le moment. Synchronisez l’historique avec la comptabilité."
        icon={<Landmark />}
      />
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <Th>Compte</Th>
              <Th>Libellé</Th>
              <Th className="text-right">Débit</Th>
              <Th className="text-right">Crédit</Th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((entry) => (
              <Fragment key={entry.id}>
                <tr className="border-t border-slate-200 bg-slate-50/60">
                  <td colSpan={4} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="whitespace-nowrap text-slate-500">{dateFr(entry.entryDate)}</span>
                      <span className="font-semibold text-slate-800">{entry.label}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                        {SOURCE_LABEL[entry.source] ?? 'Autre'}
                      </span>
                      {entry.status === 'CANCELLED' ? (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200">
                          Annulée
                        </span>
                      ) : null}
                      <span className="ml-auto font-mono text-xs text-slate-400">{entry.reference}</span>
                    </div>
                  </td>
                </tr>
                {entry.lines.map((line) => (
                  <tr key={line.id} className="border-t border-slate-100">
                    <Td className="w-24">
                      <AccountCode code={line.accountCode} />
                    </Td>
                    <Td className="text-slate-500">{line.label ?? accountLabels.get(line.accountCode) ?? ''}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">
                      {line.debitFcfa > 0 ? fcfa(line.debitFcfa) : ''}
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">
                      {line.creditFcfa > 0 ? fcfa(line.creditFcfa) : ''}
                    </Td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
              <Td className="font-semibold" />
              <Td className="font-semibold">Total</Td>
              <Td className="whitespace-nowrap text-right font-semibold tabular-nums">{fcfa(data.totals.debit)}</Td>
              <Td className="whitespace-nowrap text-right font-semibold tabular-nums">{fcfa(data.totals.credit)}</Td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

export function BalanceTab({ data }: { data: BalanceData }) {
  const balanced = data.totals.totalDebit === data.totals.totalCredit;
  // The whole chart of accounts comes back: only those with movements are worth a row.
  const groups = data.byClasse
    .map((g) => ({
      ...g,
      accounts: g.accounts.filter((a) => a.debitTotalFcfa !== 0 || a.creditTotalFcfa !== 0),
    }))
    .filter((g) => g.accounts.length > 0);
  return (
    <div className="space-y-4">
      <Card className={classNames('p-4', balanced ? 'bg-emerald-50/50' : 'bg-red-50/50')}>
        <div className="flex items-start gap-3">
          {balanced ? (
            <CircleCheck className="mt-1 h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <CircleAlert className="mt-1 h-5 w-5 shrink-0 text-red-600" />
          )}
          <div className="grid flex-1 gap-x-8 md:grid-cols-2">
            <KeyValue label="Total débit" value={fcfa(data.totals.totalDebit)} strong />
            <KeyValue label="Total crédit" value={fcfa(data.totals.totalCredit)} strong />
            <KeyValue label="Soldes débiteurs" value={fcfa(data.totals.totalSoldeDebit)} />
            <KeyValue label="Soldes créditeurs" value={fcfa(data.totals.totalSoldeCredit)} />
          </div>
        </div>
        <p className="mt-2 pl-8 text-xs text-slate-500">
          {balanced ? 'Balance équilibrée.' : 'Balance déséquilibrée : le total des débits diffère de celui des crédits.'}
        </p>
      </Card>
      {groups.length === 0 ? (
        <EmptyState
          message="Aucun mouvement pour le moment. Synchronisez l’historique avec la comptabilité."
          icon={<Scale />}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Compte</Th>
                  <Th>Libellé</Th>
                  <Th className="text-right">Débit</Th>
                  <Th className="text-right">Crédit</Th>
                  <Th className="text-right">Solde</Th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.classe}>
                    <tr className="border-t border-slate-200 bg-slate-50/60">
                      <td colSpan={5} className="px-3 py-2 text-sm font-semibold text-slate-700">
                        Classe {group.classe}
                        {CLASSE_LABEL[group.classe] ? ` : ${CLASSE_LABEL[group.classe]}` : ''}
                      </td>
                    </tr>
                    {group.accounts.map((a) => (
                      <tr key={a.code} className="border-t border-slate-100">
                        <Td className="w-24">
                          <AccountCode code={a.code} />
                        </Td>
                        <Td>{a.label}</Td>
                        <Td className="whitespace-nowrap text-right tabular-nums">{fcfa(a.debitTotalFcfa)}</Td>
                        <Td className="whitespace-nowrap text-right tabular-nums">{fcfa(a.creditTotalFcfa)}</Td>
                        <Td className="whitespace-nowrap text-right font-medium tabular-nums">{fcfa(a.soldeFcfa)}</Td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function AccountList({
  title,
  rows,
  value,
  footer,
  empty,
}: {
  title: string;
  rows: AccountSoldes[];
  value: (a: AccountSoldes) => number;
  footer?: ReactNode;
  empty: string;
}) {
  const shown = rows.filter((a) => value(a) !== 0);
  return (
    <Card className="p-4">
      <SectionTitle title={title} />
      {shown.length === 0 ? <p className="py-1 text-sm text-slate-500">{empty}</p> : null}
      <div className="divide-y divide-slate-100">
        {shown.map((a) => (
          <div key={a.code} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
            <span className="flex min-w-0 items-baseline gap-2">
              <AccountCode code={a.code} />
              <span className="text-slate-600">{a.label}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-slate-800">{fcfa(value(a))}</span>
          </div>
        ))}
      </div>
      {footer ? <div className="mt-2 border-t border-slate-200 pt-2">{footer}</div> : null}
    </Card>
  );
}

export function ResultatTab({ data }: { data: CompteResultatData }) {
  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <AccountList
          title="Charges (classe 6)"
          rows={data.charges}
          value={(a) => a.soldeFcfa}
          empty="Aucune charge."
          footer={<KeyValue label="Total charges" value={fcfa(data.totalCharges)} strong />}
        />
        <AccountList
          title="Produits (classe 7)"
          rows={data.produits}
          value={(a) => Math.abs(a.soldeFcfa)}
          empty="Aucun produit."
          footer={<KeyValue label="Total produits" value={fcfa(data.totalProduits)} strong />}
        />
      </div>
      <Card className={classNames('p-4', data.resultatNegatif ? 'bg-red-50/50' : 'bg-emerald-50/50')}>
        <KeyValue
          label={data.resultatNegatif ? 'Résultat net (perte)' : 'Résultat net (bénéfice)'}
          value={`${data.resultatNegatif ? '-' : ''}${fcfa(Math.abs(data.resultatFcfa))}`}
          strong
          tone={data.resultatNegatif ? 'bad' : 'good'}
        />
        <p className="text-xs text-slate-500">
          Produits {fcfa(data.totalProduits)} − Charges {fcfa(data.totalCharges)}
        </p>
      </Card>
    </div>
  );
}

export function BilanTab({ data }: { data: BilanData }) {
  const balanced = data.ecartFcfa === 0;
  const resultat = `${data.resultatNegatif ? '-' : ''}${fcfa(Math.abs(data.resultatFcfa))}`;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Situation arrêtée au {dateFr(data.asOf)}</p>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <AccountList
          title="Actif"
          rows={data.actif}
          value={(a) => a.soldeFcfa}
          empty="Aucun actif."
          footer={<KeyValue label="Total actif" value={fcfa(data.totalActif)} strong />}
        />
        <div className="space-y-4">
          <AccountList
            title="Passif externe"
            rows={data.passif}
            // Credit-natured lines: a debit balance stays negative.
            value={(a) => -a.soldeFcfa}
            empty="Aucune dette."
            footer={<KeyValue label="Total passif externe" value={fcfa(data.totalPassifExterne)} strong />}
          />
          <AccountList
            title="Capitaux propres"
            rows={data.capitaux}
            value={(a) => -a.soldeFcfa}
            empty="Aucun apport."
            footer={
              <>
                <KeyValue
                  label={data.exercice ? `Résultat de l’exercice (${data.exercice.label})` : 'Résultat de l’exercice'}
                  value={resultat}
                  tone={data.resultatNegatif ? 'bad' : 'good'}
                />
                <KeyValue label="Total capitaux propres" value={fcfa(data.totalCapitaux)} strong />
              </>
            }
          />
        </div>
      </div>
      <Card className={classNames('p-4', balanced ? 'bg-emerald-50/50' : 'bg-red-50/50')}>
        <div className="grid gap-x-8 md:grid-cols-2">
          <KeyValue label="Capitaux apportés" value={fcfa(data.capitauxApportsFcfa)} />
          {data.variationStockFcfa ? (
            <KeyValue label="Dont stock provende (inventaire estimé)" value={fcfa(data.variationStockFcfa)} />
          ) : null}
          <KeyValue
            label={balanced ? 'Écart du bilan : équilibré' : 'Écart du bilan : déséquilibré'}
            value={fcfa(data.ecartFcfa)}
            strong
            tone={balanced ? 'good' : 'bad'}
          />
        </div>
      </Card>
    </div>
  );
}

export function StockTab({ data }: { data: StockProvende }) {
  if (data.lots.length === 0) {
    return (
      <EmptyState
        message="Aucun stock de provende valorisable. Les réceptions d’aliments comptabilisées (6011/401) apparaîtront ici dès la clôture de l’exercice."
        icon={<Boxes />}
      />
    );
  }
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <IconTile icon={<Boxes />} tone="green" />
          <div className="min-w-0 flex-1">
            <KeyValue label="Valeur du stock (compte 311)" value={fcfa(data.totalValueFcfa)} strong />
            <KeyValue label="Lots valorisés" value={String(data.lots.length)} tone="muted" />
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Disponible comptable = réception − consommation − pertes − ventes, valorisée au coût d’intrant (311/603 en
          clôture).
        </p>
      </Card>
      <Card className="overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <Th>Produit</Th>
              <Th>Lot fournisseur</Th>
              <Th className="text-right">Disponible</Th>
              <Th className="text-right">Valeur</Th>
            </tr>
          </thead>
          <tbody>
            {data.lots.map((lot) => (
              <tr key={lot.lotId} className="border-t border-slate-100">
                <Td className="font-medium">{lot.productName}</Td>
                <Td>{lot.supplierLotNumber}</Td>
                <Td className="whitespace-nowrap text-right tabular-nums">{num(lot.availableKg)} kg</Td>
                <Td className="whitespace-nowrap text-right font-medium tabular-nums">{fcfa(lot.valueFcfa)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function ExercicesTab({
  data,
  canClose,
  closingId,
  onClose,
}: {
  data: ExerciceInfo[];
  canClose: boolean;
  closingId: string | null;
  onClose: (ex: ExerciceInfo) => void;
}) {
  if (data.length === 0) {
    return (
      <EmptyState
        message="Aucun exercice comptable. Les écritures s’organisent par exercice annuel dès la première opération."
        icon={<Lock />}
      />
    );
  }
  const today = todayIso();
  return (
    <Card className="overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50">
          <tr>
            <Th>Exercice</Th>
            <Th>Période</Th>
            <Th>Statut</Th>
            <Th className="text-right">Clôture</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((ex) => {
            const open = ex.status === 'OPEN';
            const past = open && ex.endDate < today;
            return (
              <tr key={ex.id} className="border-t border-slate-100">
                <Td className="font-medium">{ex.label}</Td>
                <Td className="whitespace-nowrap">
                  {dateFr(ex.startDate)} → {dateFr(ex.endDate)}
                </Td>
                <Td>
                  <span
                    className={classNames(
                      'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1',
                      open
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        : 'bg-slate-100 text-slate-500 ring-slate-200',
                    )}
                  >
                    {open ? 'Ouvert' : 'Clôturé'}
                  </span>
                </Td>
                <Td className="text-right">
                  {past && !canClose ? null : past ? (
                    <Button
                      tone="danger"
                      busy={closingId === ex.id}
                      disabled={closingId !== null && closingId !== ex.id}
                      onClick={() => onClose(ex)}
                    >
                      {closingId === ex.id ? null : <Lock className="h-4 w-4" />}
                      Clôturer l’exercice
                    </Button>
                  ) : open ? (
                    <span className="text-xs text-slate-500">
                      Exercice en cours : clôture possible après le {dateFr(ex.endDate)}.
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
