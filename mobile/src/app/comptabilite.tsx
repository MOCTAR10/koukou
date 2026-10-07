import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Download, Scale, CircleCheck, CircleAlert, Lock, Boxes } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { NumberInput } from '@/components/ui/NumberInput';
import { useAuth } from '@/auth/AuthContext';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import {
  closeAccountExercice,
  createRegularisation,
  fetchAccountBalance,
  fetchAccountBilan,
  fetchAccountCompteResultat,
  fetchAccountExercices,
  fetchAccountJournal,
  fetchAccountStockProvende,
  initializeAccounting,
} from '@/api';
import { downloadPdf } from '@/api/pdf';
import type { AccountSoldes, BalanceData, BilanData, CompteResultatData, ExerciceInfo, JournalData, StockProvende } from '@/api/types';
import { color, radii, fmtFcfa } from '@/constants/theme';

type Tab = 'journal' | 'balance' | 'resultat' | 'bilan' | 'stock' | 'exercices';

const TABS: { key: Tab; label: string }[] = [
  { key: 'journal', label: 'Journal' },
  { key: 'balance', label: 'Balance' },
  { key: 'resultat', label: 'Résultat' },
  { key: 'bilan', label: 'Bilan' },
  { key: 'stock', label: 'Stock' },
  { key: 'exercices', label: 'Exercices' },
];

const REPORT_NAME: Record<Tab, string> = {
  journal: 'Journal comptable',
  balance: 'Balance d’essai',
  resultat: 'Compte de résultat',
  bilan: 'Bilan',
  stock: 'Stock provende',
  exercices: 'Exercices',
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function Row({ label, value, muted, wide }: { label: string; value: string; muted?: boolean; wide?: boolean }) {
  return (
    <View style={styles.rowBetween}>
      <AppText size={wide ? 'body' : 'small'} color="text" style={styles.rowLabel} numberOfLines={1}>
        {label}
      </AppText>
      <AppText size={wide ? 'body' : 'small'} weight="semibold" color={muted ? 'muted' : 'text'}>
        {value}
      </AppText>
    </View>
  );
}

function SoldesRow({ account }: { account: AccountSoldes }) {
  const sign = account.soldeFcfa >= 0 ? '' : '-';
  const abs = Math.abs(account.soldeFcfa);
  return (
    <View style={styles.rowBetween}>
      <View style={styles.accLeft}>
        <Chip label={account.code} tone="neutral" style={styles.accChip} />
        <AppText size="small" color="muted" style={styles.rowLabel} numberOfLines={1}>
          {account.label}
        </AppText>
      </View>
      <AppText size="small" weight="semibold" color="text">
        {sign}
        {fmtFcfa(abs)}
      </AppText>
    </View>
  );
}

export default function ComptabiliteScreen() {
  const { farms, farmId } = useAuth();
  const { hasPermission } = useFarmProfile();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>('journal');
  const [sheetOpen, setSheetOpen] = useState(false);

  const canEcritures = hasPermission('compta:ecritures');

  const journalQuery = useQuery({
    queryKey: ['accounting-journal', farmId],
    queryFn: () => fetchAccountJournal(farmId),
    enabled: tab === 'journal',
  });
  const balanceQuery = useQuery({
    queryKey: ['accounting-balance', farmId],
    queryFn: () => fetchAccountBalance(farmId),
    enabled: tab === 'balance',
  });
  const resultatQuery = useQuery({
    queryKey: ['accounting-resultat', farmId],
    queryFn: () => fetchAccountCompteResultat(farmId),
    enabled: tab === 'resultat',
  });
  const bilanQuery = useQuery({
    queryKey: ['accounting-bilan', farmId],
    queryFn: () => fetchAccountBilan(farmId),
    enabled: tab === 'bilan',
  });
  const stockQuery = useQuery({
    queryKey: ['accounting-stock', farmId],
    queryFn: () => fetchAccountStockProvende(farmId),
    enabled: tab === 'stock',
  });
  const exercicesQuery = useQuery({
    queryKey: ['accounting-exercices', farmId],
    queryFn: () => fetchAccountExercices(farmId),
    enabled: tab === 'exercices',
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['accounting-journal', farmId] });
    queryClient.invalidateQueries({ queryKey: ['accounting-balance', farmId] });
    queryClient.invalidateQueries({ queryKey: ['accounting-resultat', farmId] });
    queryClient.invalidateQueries({ queryKey: ['accounting-bilan', farmId] });
    queryClient.invalidateQueries({ queryKey: ['accounting-stock', farmId] });
    queryClient.invalidateQueries({ queryKey: ['accounting-exercices', farmId] });
  };

  const initMutation = useMutation({
    mutationFn: () => initializeAccounting(farmId),
    onSuccess: () => {
      invalidate();
      Alert.alert('Comptabilité à jour', 'Plan comptable et historique passés en écritures.');
    },
    onError: (e: Error) => Alert.alert('Synchronisation impossible', e.message),
  });

  const exportPdf = async () => {
    try {
      await downloadPdf(
        `/farms/${farmId}/accounting/export?report=${tab}&format=pdf`,
        `koukou-${tab}.pdf`,
      );
      Alert.alert('Rapport téléchargé', `${REPORT_NAME[tab]} exporté (PDF).`);
    } catch (e) {
      Alert.alert('Téléchargement impossible', e instanceof Error ? e.message : 'Erreur inattendue.');
    }
  };

  const closeMutation = useMutation({
    mutationFn: (exerciceId: string) => closeAccountExercice(farmId, exerciceId),
    onSuccess: (res) => {
      invalidate();
      const details: string[] = [];
      if (res.stockFcfa > 0) {
        details.push(`Stock final valorisé à ${fmtFcfa(res.stockFcfa)} (311/603).`);
      }
      if (res.resultatFcfa > 0) {
        details.push(`Bénéfice de ${fmtFcfa(res.resultatFcfa)} reporté à nouveau (129/12).`);
      } else if (res.resultatFcfa < 0) {
        details.push(`Perte de ${fmtFcfa(Math.abs(res.resultatFcfa))} reportée à nouveau (12/129).`);
      }
      Alert.alert(
        'Exercice clôturé',
        `${res.exercice.label} est clôturé. ${res.next.label} est ouvert.${details.length ? `\n${details.join('\n')}` : ''}`,
      );
    },
    onError: (e: Error) => Alert.alert('Clôture impossible', e.message),
  });

  const confirmClose = (ex: ExerciceInfo) => {
    Alert.alert(
      'Clôturer l’exercice',
      `${ex.label} (${ex.startDate} → ${ex.endDate})\nLe stock final sera valorisé (311/603) et le résultat reporté à nouveau. Le jour de clôture est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Clôturer', style: 'destructive', onPress: () => closeMutation.mutate(ex.id) },
      ],
    );
  };

  const exportable = tab === 'journal' || tab === 'balance' || tab === 'resultat' || tab === 'bilan';

  return (
    <Screen
      header={
        <ScreenHeader
          // Pas d'icône décorative à droite : « Comptabilité SYSCOHADA » en
          // h2 (22px) frôle la largeur disponible sur les petits écrans, et le
          // titre ne doit jamais être tronqué.
          title="Comptabilité SYSCOHADA"
          subtitle={farms[0]?.name ?? 'Ferme'}
          back
        />
      }>
      <Segmented
        options={TABS}
        value={tab}
        onChange={setTab}
        haptic
      />

      <View style={styles.actions}>
        {exportable ? (
          <Button label="Exporter PDF" tone="ghost" size="sm" icon={Download} onPress={() => void exportPdf()} style={styles.actionBtn} block={false} />
        ) : null}
        {canEcritures ? (
          <Button label="Régularisation" tone="brand" size="sm" icon={Plus} onPress={() => setSheetOpen(true)} style={styles.actionBtn} block={false} />
        ) : null}
      </View>

      {tab === 'journal' ? <JournalBlock data={journalQuery.data} loading={journalQuery.isLoading} /> : null}
      {tab === 'balance' ? <BalanceBlock data={balanceQuery.data} loading={balanceQuery.isLoading} /> : null}
      {tab === 'resultat' ? <ResultatBlock data={resultatQuery.data} loading={resultatQuery.isLoading} /> : null}
      {tab === 'bilan' ? <BilanBlock data={bilanQuery.data} loading={bilanQuery.isLoading} /> : null}
      {tab === 'stock' ? <StockBlock data={stockQuery.data} loading={stockQuery.isLoading} /> : null}
      {tab === 'exercices' ? <ExercicesBlock data={exercicesQuery.data} loading={exercicesQuery.isLoading} canEcritures={canEcritures} onClose={confirmClose} closingId={closeMutation.variables} /> : null}

      {!canEcritures ? null : (
        <Button
          label="Synchroniser l'historique"
          tone="ghost"
          size="sm"
          icon={Scale}
          loading={initMutation.isPending}
          onPress={() => initMutation.mutate()}
          style={{ marginTop: 6 }}
        />
      )}

      {canEcritures ? (
        <RegularisationSheet
          visible={sheetOpen}
          farmId={farmId}
          onClose={() => setSheetOpen(false)}
          onDone={() => {
            setSheetOpen(false);
            invalidate();
          }}
        />
      ) : null}
    </Screen>
  );
}

function JournalBlock({ data, loading }: { data: JournalData | undefined; loading: boolean }) {
  if (loading) return <Spinner label="Journal…" />;
  if (!data || data.entries.length === 0) {
    return (
      <View style={styles.empty}>
        <AppText size="body" color="muted">
          Aucune écriture pour le moment. Synchronisez l’historique avec la comptabilité.
        </AppText>
      </View>
    );
  }
  return (
    <>
      {data.entries.map((entry) => (
        <Card key={entry.id} tone="default" style={styles.card}>
          <View style={styles.rowBetween}>
            <Chip label={entry.status === 'CANCELLED' ? 'ANNULÉE' : entry.source} tone={entry.status === 'CANCELLED' ? 'red' : 'neutral'} />
            <AppText size="label" color="muted">
              {entry.reference}
            </AppText>
          </View>
          <AppText size="body" weight="bold" color="text">
            {entry.label}
          </AppText>
          <AppText size="caption" color="muted">
            {entry.entryDate}
          </AppText>
          <View style={styles.sep} />
          {entry.lines.map((line) => (
            <View key={line.id} style={styles.rowBetween}>
              <View style={styles.accLeft}>
                <Chip label={line.accountCode} tone="neutral" style={styles.accChip} />
                <AppText size="small" color="muted" style={styles.rowLabel} numberOfLines={1}>
                  {line.label ?? ''}
                </AppText>
              </View>
              <AppText size="small" weight="semibold" color="text">
                {line.debitFcfa > 0 ? fmtFcfa(line.debitFcfa) : line.creditFcfa > 0 ? `- ${fmtFcfa(line.creditFcfa)}` : '—'}
              </AppText>
            </View>
          ))}
        </Card>
      ))}
      <Card tone="default" style={styles.card}>
        <Row label="Total débit" value={fmtFcfa(data.totals.debit)} wide />
        <Row label="Total crédit" value={fmtFcfa(data.totals.credit)} wide />
      </Card>
    </>
  );
}

function BalanceBlock({ data, loading }: { data: BalanceData | undefined; loading: boolean }) {
  if (loading) return <Spinner label="Balance…" />;
  if (!data) {
    return (
      <View style={styles.empty}>
        <AppText size="body" color="muted">
          Balance indisponible.
        </AppText>
      </View>
    );
  }
  const balanced = data.totals.totalDebit === data.totals.totalCredit;
  return (
    <>
      <Card tone={balanced ? 'green' : 'alert'} style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1, gap: 2 }}>
            <Row label="Total débit" value={fmtFcfa(data.totals.totalDebit)} muted={!balanced} />
            <Row label="Total crédit" value={fmtFcfa(data.totals.totalCredit)} muted={!balanced} />
            <Row label="Soldes débiteurs" value={fmtFcfa(data.totals.totalSoldeDebit)} muted />
            <Row label="Soldes créditeurs" value={fmtFcfa(data.totals.totalSoldeCredit)} muted />
          </View>
          {balanced ? <CircleCheck size={22} color={color.green[600]} /> : <CircleAlert size={22} color={color.red[500]} />}
        </View>
      </Card>
      {data.byClasse
        .filter((g) => g.accounts.length > 0)
        .map((group) => (
          <View key={group.classe}>
            <SectionHeader title={`Classe ${group.classe}`} />
            <Card tone="default" style={styles.card}>
              {group.accounts.map((a) => (
                <SoldesRow key={a.code} account={a} />
              ))}
            </Card>
          </View>
        ))}
    </>
  );
}

function LedgerRows({ data, title }: { data: CompteResultatData | BilanData; title: string }) {
  const charges = 'charges' in data ? data.charges : (data as BilanData).actif;
  const produits = 'produits' in data ? data.produits : (data as BilanData).passif;
  const capitaux = 'capitaux' in data ? (data as BilanData).capitaux : [];
  const resultatFcfa = 'resultatFcfa' in data ? data.resultatFcfa : (data as BilanData).resultatFcfa;
  const resultatNegatif = 'resultatNegatif' in data ? data.resultatNegatif : (data as BilanData).resultatNegatif;

  const renderRows = (rows: AccountSoldes[], invert: boolean) =>
    rows.map((a) => (
      <Row
        key={a.code}
        label={`${a.code} — ${a.label}`}
        value={fmtFcfa(invert ? Math.abs(a.soldeFcfa) : a.soldeFcfa)}
      />
    ));

  return (
    <>
      {title === 'compte-resultat' ? (
        <>
          <SectionHeader title="Charges (classe 6)" />
          <Card tone="default" style={styles.card}>
            {renderRows(charges, false)}
          </Card>
          <SectionHeader title="Produits (classe 7)" />
          <Card tone="default" style={styles.card}>
            {renderRows(produits, true)}
            <Row label="Résultat net" value={`${resultatNegatif ? '-' : ''}${fmtFcfa(Math.abs(resultatFcfa))}`} wide />
          </Card>
        </>
      ) : (
        <>
          <SectionHeader title="Actif" />
          <Card tone="default" style={styles.card}>
            {renderRows(charges, false)}
          </Card>
          <SectionHeader title="Passif externe" />
          <Card tone="default" style={styles.card}>
            {renderRows(produits, true)}
          </Card>
          <SectionHeader title="Capitaux propres" />
          <Card tone="default" style={styles.card}>
            {renderRows(capitaux, true)}
            <Row label="Résultat net" value={`${resultatNegatif ? '-' : ''}${fmtFcfa(Math.abs(resultatFcfa))}`} wide />
          </Card>
        </>
      )}
    </>
  );
}

function ResultatBlock({ data, loading }: { data: CompteResultatData | undefined; loading: boolean }) {
  if (loading) return <Spinner label="Compte de résultat…" />;
  if (!data) {
    return (
      <View style={styles.empty}>
        <AppText size="body" color="muted">
          Compte de résultat indisponible.
        </AppText>
      </View>
    );
  }
  return (
    <>
      <LedgerRows data={data} title="compte-resultat" />
      <Card tone={data.resultatNegatif ? 'alert' : 'green'} style={styles.card}>
        <View style={styles.rowBetween}>
          <AppText size="body" weight="bold" color="text">
            Résultat net
          </AppText>
          <AppText size="body" weight="bold" color={data.resultatNegatif ? 'danger' : 'success'}>
            {data.resultatNegatif ? '-' : ''}
            {fmtFcfa(Math.abs(data.resultatFcfa))}
          </AppText>
        </View>
        <AppText size="caption" color="faint">
          Produits {fmtFcfa(data.totalProduits)} − Charges {fmtFcfa(data.totalCharges)}
        </AppText>
      </Card>
    </>
  );
}

function BilanBlock({ data, loading }: { data: BilanData | undefined; loading: boolean }) {
  if (loading) return <Spinner label="Bilan…" />;
  if (!data) {
    return (
      <View style={styles.empty}>
        <AppText size="body" color="muted">
          Bilan indisponible.
        </AppText>
      </View>
    );
  }
  const balanced = data.ecartFcfa === 0;
  return (
    <>
      <LedgerRows data={data} title="bilan" />
      <Card tone={balanced ? 'green' : 'alert'} style={styles.card}>
        <Row label="Total actif" value={fmtFcfa(data.totalActif)} wide />
        <Row label="Total passif externe" value={fmtFcfa(data.totalPassifExterne)} muted wide />
        <Row label="Total capitaux propres" value={fmtFcfa(data.totalCapitaux)} muted wide />
        <Row label="Capitaux apportés" value={fmtFcfa(data.capitauxApportsFcfa)} muted />
        <Row label="Écart bilan" value={fmtFcfa(data.ecartFcfa)} wide />
      </Card>
    </>
  );
}

function StockBlock({ data, loading }: { data: StockProvende | undefined; loading: boolean }) {
  if (loading) return <Spinner label="Stock provende…" />;
  if (!data || data.lots.length === 0) {
    return (
      <View style={styles.empty}>
        <AppText size="body" color="muted">
          Aucun stock de provende valorisable. Les réceptions d’aliments comptabilisées (6011/401) apparaîtront ici dès la clôture de l’exercice.
        </AppText>
      </View>
    );
  }
  return (
    <>
      <Card tone={data.totalValueFcfa > 0 ? 'green' : 'default'} style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={{ gap: 2, flex: 1 }}>
            <Row label="Valeur du stock (compte 311)" value={fmtFcfa(data.totalValueFcfa)} wide />
            <Row label={`Lots valorisés`} value={`${data.lots.length}`} muted />
          </View>
          <Boxes size={22} color={color.green[600]} />
        </View>
        <AppText size="caption" color="faint">
          Disponible comptable = réception − consommation − pertes − ventes, valorisée au coût d’intrant (311/603 en clôture).
        </AppText>
      </Card>
      {data.lots.map((lot) => (
        <Card key={lot.lotId} tone="default" style={styles.card}>
          <View style={styles.rowBetween}>
            <AppText size="body" weight="bold" color="text" style={styles.rowLabel} numberOfLines={1}>
              {lot.productName}
            </AppText>
            <AppText size="small" weight="semibold" color="text">
              {fmtFcfa(lot.valueFcfa)}
            </AppText>
          </View>
          <View style={styles.rowBetween}>
            <AppText size="small" color="muted">
              Lot {lot.supplierLotNumber}
            </AppText>
            <AppText size="small" color="muted">
              {lot.availableKg} kg disponibles
            </AppText>
          </View>
        </Card>
      ))}
    </>
  );
}

function ExercicesBlock({
  data,
  loading,
  canEcritures,
  onClose,
  closingId,
}: {
  data: ExerciceInfo[] | undefined;
  loading: boolean;
  canEcritures: boolean;
  onClose: (ex: ExerciceInfo) => void;
  closingId: string | undefined;
}) {
  if (loading) return <Spinner label="Exercices…" />;
  if (!data || data.length === 0) {
    return (
      <View style={styles.empty}>
        <AppText size="body" color="muted">
          Aucun exercice comptable. Les écritures s’organisent par exercice annuel dès la première opération.
        </AppText>
      </View>
    );
  }
  const today = todayStr();
  return (
    <>
      {data.map((ex) => {
        const open = ex.status === 'OPEN';
        const past = open && ex.endDate < today;
        return (
          <Card key={ex.id} tone="default" style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={{ gap: 2, flex: 1 }}>
                <AppText size="body" weight="bold" color="text">
                  {ex.label}
                </AppText>
                <AppText size="caption" color="muted">
                  {ex.startDate} → {ex.endDate}
                </AppText>
              </View>
              <Chip label={open ? 'Ouvert' : 'Clôturé'} tone={open ? 'green' : 'neutral'} />
            </View>
            {canEcritures && open && past ? (
              <Button
                label="Clôturer l’exercice"
                tone="danger"
                size="sm"
                icon={Lock}
                loading={closingId === ex.id}
                disabled={closingId !== undefined && closingId !== ex.id}
                onPress={() => onClose(ex)}
                style={{ marginTop: 10 }}
              />
            ) : null}
            {open && !past ? (
              <AppText size="caption" color="faint" style={{ marginTop: 8 }}>
                Exercice en cours — clôture possible après le {ex.endDate}.
              </AppText>
            ) : null}
          </Card>
        );
      })}
    </>
  );
}

function RegularisationSheet({
  visible,
  farmId,
  onClose,
  onDone,
}: {
  visible: boolean;
  farmId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const balanceQuery = useQuery({
    queryKey: ['accounting-balance', farmId],
    queryFn: () => fetchAccountBalance(farmId),
    staleTime: 60_000,
  });

  const suggestions = useMemo(() => {
    const rows = balanceQuery.data?.accounts ?? [];
    return ['571', '108', '401', '411', '6011', '7011', '658', '758', '471', '421'].filter(
      (code) => rows.some((a) => a.code === code),
    );
  }, [balanceQuery.data]);

  const [label, setLabel] = useState('');
  const [date, setDate] = useState(todayStr);
  const [debitAccount, setDebitAccount] = useState('6011');
  const [debitAmount, setDebitAmount] = useState('');
  const [creditAccount, setCreditAccount] = useState('471');
  const [creditAmount, setCreditAmount] = useState('');

  const debit = Number(debitAmount) || 0;
  const credit = Number(creditAmount) || 0;
  const balanced = debit > 0 && debit === credit;
  const valid = label.trim().length > 0 && debitAccount.trim() && creditAccount.trim() && balanced;

  const mutation = useMutation({
    mutationFn: () =>
      createRegularisation(farmId, {
        date,
        label: label.trim(),
        lines: [
          { account: debitAccount.trim(), debitFcfa: debit },
          { account: creditAccount.trim(), creditFcfa: credit },
        ],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-journal', farmId] });
      queryClient.invalidateQueries({ queryKey: ['accounting-balance', farmId] });
      queryClient.invalidateQueries({ queryKey: ['accounting-resultat', farmId] });
      queryClient.invalidateQueries({ queryKey: ['accounting-bilan', farmId] });
      Alert.alert('Écriture posée', 'La régularisation équilibrée a été enregistrée au journal.');
      onDone();
    },
    onError: (e: Error) => Alert.alert('Écriture refusée', e.message),
  });

  return (
    <Sheet
      visible={visible}
      title="Régularisation"
      subtitle="Écriture manuelle équilibrée (au moins 2 lignes, total débit = total crédit)"
      icon={<Plus size={20} color={color.brand[600]} />}
      accentColor={color.brand[500]}
      onClose={onClose}
      footer={
        <Button
          label={mutation.isPending ? 'Écriture en cours…' : balanced ? `Enregistrer ${fmtFcfa(debit)}` : 'Débit et crédit doivent être égaux'}
          tone="brand"
          disabled={!valid || mutation.isPending}
          loading={mutation.isPending}
          onPress={() => mutation.mutate()}
        />
      }>
      <ScrollView keyboardShouldPersistTaps="handled">
        <AppText size="label" color="muted" style={styles.fieldLabel}>
          LIBELLÉ
        </AppText>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="Ex. Ajustement provende culture"
          placeholderTextColor={color.ink[300]}
          style={styles.input}
        />
        <AppText size="label" color="muted" style={styles.fieldLabel}>
          DATE ({date})
        </AppText>
        <TextInput
          value={date}
          onChangeText={(t) => setDate(t.replace(/[^0-9-]/g, '').slice(0, 10))}
          placeholder="AAAA-MM-JJ"
          placeholderTextColor={color.ink[300]}
          style={styles.input}
        />

        <SectionHeader title="Débit" subtitle={fmtFcfa(debit)} />
        <TextInput
          value={debitAccount}
          onChangeText={setDebitAccount}
          placeholder="Compte (ex. 6011)"
          placeholderTextColor={color.ink[300]}
          style={styles.input}
        />
        <NumberInput value={debitAmount} onChangeText={setDebitAmount} placeholder="Montant débit" suffix="FCFA" style={styles.mt} />

        <SectionHeader title="Crédit" subtitle={fmtFcfa(credit)} />
        <TextInput
          value={creditAccount}
          onChangeText={setCreditAccount}
          placeholder="Compte (ex. 471)"
          placeholderTextColor={color.ink[300]}
          style={styles.input}
        />
        <NumberInput value={creditAmount} onChangeText={setCreditAmount} placeholder="Montant crédit" suffix="FCFA" style={styles.mt} />

        {suggestions.length > 0 ? (
          <>
            <AppText size="label" color="muted" style={styles.fieldLabel}>
              COMPTES FRÉQUENTS
            </AppText>
            <View style={styles.chips}>
              {suggestions.map((code) => (
                <Pressable key={code} onPress={() => { setDebitAccount(code); setCreditAccount(code); }} accessibilityRole="button">
                  <Chip label={code} tone="neutral" />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.sep} />
        <View style={styles.rowBetween}>
          <AppText size="body" color="muted">Équilibre</AppText>
          <AppText size="body" weight="bold" color={balanced ? 'success' : debit > 0 && !balanced ? 'danger' : 'muted'}>
            {balanced ? 'OK' : `${fmtFcfa(debit)} vs ${fmtFcfa(credit)}`}
          </AppText>
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flexShrink: 0,
  },
  card: {
    gap: 8,
    padding: 14,
  },
  empty: {
    paddingVertical: 24,
    paddingHorizontal: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowLabel: {
    flex: 1,
  },
  accLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accChip: {
    minWidth: 46,
  },
  sep: {
    height: 1,
    backgroundColor: color.border,
    marginVertical: 6,
  },
  mt: {
    marginTop: 8,
  },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radii.md,
    backgroundColor: color.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    color: color.ink[900],
    marginBottom: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
});