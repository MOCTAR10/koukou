// Delegated entry (jury lot 5): a technical agent of the programme enters the
// day's data and reports a health problem ON BEHALF of a farmer during his
// visit. Works on the active farm of the agent's scope, with the same flows,
// offline queue and caches as the farmer's simple mode (`components/simple`).
// Only the tiles the agent's matrix allows are shown; no Vaccin / Vendre.
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { OnBehalfBadge } from '@/components/OnBehalfBadge';
import { useClinicalSigns } from '@/components/sanitary/DeclarationExtras';
import { BandChip, BandPicker, bandName } from '@/components/simple/BandPicker';
import { SimpleFlowModal } from '@/components/simple/SimpleFlowModal';
import { OnBehalfBanner } from '@/components/simple/SimpleParts';
import { Tile } from '@/components/simple/SimpleHome';
import { pickBand, tileState, type SimpleEntryKind } from '@/components/simple/simple-logic';
import { doneSet, selectBand, useSimpleSession } from '@/components/simple/simpleSession';
import { isWeighingDue, useBandWeighing, useDayEntry, useFeedStock, useOpenBands } from '@/components/simple/useSimpleData';
import { useAuth } from '@/auth/AuthContext';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { fetchDailyEntries } from '@/api';
import { layout, palette, radii, semantic } from '@/constants/theme';
import { gridColumns } from '@/theme/responsive';
import { useScreen } from '@/theme/useScreen';
import { delegatedActions, delegatedBlock, type DelegatedAction } from '@/poufa/delegated-entry';
import { setAnnounceSilenced } from '@/voice/speak';

export default function DelegatedEntryScreen() {
  const { farms, farmId } = useAuth();
  const { delegated, isLoading: rightsLoading } = useFarmProfile();
  const queryClient = useQueryClient();
  const { contentWidth, gutter } = useScreen();
  const session = useSimpleSession();
  const { bands, isLoading: bandsLoading, isError: bandsError } = useOpenBands();
  const [flow, setFlow] = useState<DelegatedAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const band = pickBand(bands, session.selectedBandId);
  const { entry, today, known: dayKnown, isFetching: dayFetching } = useDayEntry(band);
  const stock = useFeedStock();
  const weighing = useBandWeighing(band);
  // The SIGNE_CLINIQUE list: read here so one online visit caches it for the problem flow.
  useClinicalSigns();
  const farm = farms.find((f) => f.id === farmId) ?? farms[0] ?? null;
  const farmName = farm?.name ?? 'cet éleveur';

  // The agent can read: no automatic read-out here (the speaker button still works).
  // The band picked on a previous farm is forgotten on entry and on leaving.
  useEffect(() => {
    setAnnounceSilenced(true);
    selectBand(null);
    return () => {
      setAnnounceSilenced(false);
      selectBand(null);
    };
  }, [farmId]);

  // Online visit: keep the day's entries of every open band on the phone, so the
  // flows still work when the network drops at the farm.
  useEffect(() => {
    for (const b of bands) {
      void queryClient.prefetchQuery({
        queryKey: ['daily-entries', farmId, b.id],
        queryFn: () => fetchDailyEntries(farmId, b.id),
      });
    }
  }, [bands, farmId, queryClient]);

  const actions = delegatedActions({
    isLayer: band?.type === 'PONDEUSE',
    daily: delegated.daily,
    declaration: delegated.declaration,
  });
  const localDone: ReadonlySet<SimpleEntryKind> = band ? doneSet(session, today, band.id) : new Set<SimpleEntryKind>();
  const tileWidth = gridColumns(contentWidth - gutter * 2, 140, 12, 2).tileWidth;
  const needsBand = bands.length > 1 && band == null;
  const allowed = delegated.daily || delegated.declaration;

  const open = (action: DelegatedAction) => {
    const why = delegatedBlock(action, { day: dayKnown, stock: stock.data !== undefined });
    if (why) {
      setNotice(dayFetching || stock.isFetching ? 'Chargement en cours. Réessayez dans un instant.' : why);
      return;
    }
    setNotice(null);
    setFlow(action);
  };

  return (
    <Screen
      bottomPad={layout.bottomPad}
      header={<ScreenHeader title="Saisie pour l’éleveur" subtitle={farmName} back />}>
      {rightsLoading || bandsLoading ? (
        <BrandLoader />
      ) : !allowed ? (
        <AppText size="body" color="muted">
          Votre profil d’accès ne permet pas la saisie pour un éleveur sur cette ferme.
        </AppText>
      ) : (
        <View style={styles.content}>
          <OnBehalfBanner farmName={farmName} />
          {bands.length === 0 ? (
            <View style={styles.empty}>
              <AppText size="h3" weight="bold" align="center">
                {bandsError ? 'Les bandes de cette ferme ne sont pas sur ce téléphone.' : 'Pas de bande en cours.'}
              </AppText>
              {bandsError ? (
                <AppText size="body" color="muted" align="center">
                  Ouvrez cette ferme une fois avec du réseau pour pouvoir saisir ensuite sans réseau.
                </AppText>
              ) : null}
            </View>
          ) : needsBand ? (
            <BandPicker bands={bands} onPick={selectBand} />
          ) : (
            <>
              {bands.length > 1 && band ? <BandChip band={band} onChange={() => selectBand(null)} /> : null}
              <OnBehalfBadge record={entry} />
              {notice ? (
                <View style={styles.notice} accessibilityRole="alert">
                  <AppText size="bodyM" weight="semibold" color={palette.amber[900]}>
                    {notice}
                  </AppText>
                </View>
              ) : null}
              <View style={styles.grid}>
                {actions.map((action) => (
                  <Tile
                    key={action}
                    action={action}
                    width={tileWidth}
                    state={tileState(action, {
                      entry,
                      localDone,
                      caresLate: 0,
                      caresDueToday: 0,
                      weighingDue: isWeighingDue(weighing, today),
                    })}
                    onPress={() => open(action)}
                  />
                ))}
              </View>
            </>
          )}
        </View>
      )}
      <SimpleFlowModal
        flow={flow}
        band={band}
        bandLabel={bands.length > 1 && band ? bandName(band) : null}
        onBehalfOf={farmName}
        onClose={() => setFlow(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, marginTop: 8 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  notice: {
    padding: 12,
    borderRadius: radii.lg,
    backgroundColor: semantic.warnSoft,
    borderWidth: 1,
    borderColor: palette.amber[400],
  },
});
