// Home of a SIMPLE account: no statistics, no charts, no percentages. Very big
// tiles, one per action, each with a state badge (green check done today,
// orange dot still to do, red when late), a red alert card, the speaker.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { ConnectionPill } from '@/components/ui/ConnectionStrip';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { OnBehalfBadge } from '@/components/OnBehalfBadge';
import { useQuickCapture } from '@/components/capture/QuickCaptureProvider';
import { useAuth } from '@/auth/AuthContext';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { givenName } from '@/api/format';
import { layout, palette, radii, semantic } from '@/constants/theme';
import { gridColumns } from '@/theme/responsive';
import { useScreen } from '@/theme/useScreen';
import { useAnnounce } from '@/voice/useAnnounce';
import { BandChip, BandPicker, bandName } from './BandPicker';
import { CoinsPicto, DeadBirdPicto, EggPicto, FeedSackPicto, ScalePicto, SyringePicto, WarningPicto, WaterDropPicto } from './pictos/Pictos';
import { SimpleAlertCard } from './SimpleAlertCard';
import { SimpleFlowModal, type FlowKind } from './SimpleFlowModal';
import { SpeakButton } from './SpeakButton';
import { pickBand, SENTENCES, tileState, visibleActions, type SimpleAction, type SimpleEntryKind, type TileState } from './simple-logic';
import { doneSet, selectBand, useSimpleSession } from './simpleSession';
import { isWeighingDue, useBandCares, useBandWeighing, useDayEntry, useOpenBands, useRedAlerts } from './useSimpleData';

interface TileMeta {
  /** One or two words, big, under the pictogram (also the accessibility label). */
  label: string;
  picto: (size: number) => React.ReactNode;
}

const TILES: Record<SimpleAction, TileMeta> = {
  morts: { label: 'Morts', picto: (s) => <DeadBirdPicto size={s} /> },
  aliment: { label: 'Aliment', picto: (s) => <FeedSackPicto size={s} /> },
  eau: { label: 'Eau', picto: (s) => <WaterDropPicto size={s} /> },
  oeufs: { label: 'Œufs', picto: (s) => <EggPicto size={s} /> },
  pesee: { label: 'Pesée', picto: (s) => <ScalePicto size={s} /> },
  vaccin: { label: 'Vaccin', picto: (s) => <SyringePicto size={s} /> },
  probleme: { label: 'Problème', picto: (s) => <WarningPicto size={s} /> },
  vendre: { label: 'Vendre', picto: (s) => <CoinsPicto size={s} /> },
};

const STATE_TEXT: Record<TileState, string> = {
  done: ', fait aujourd’hui',
  todo: ', à faire',
  late: ', en retard',
  none: '',
};

function Badge({ state }: { state: TileState }) {
  if (state === 'none') return null;
  if (state === 'done') {
    return (
      <View style={[styles.badge, { backgroundColor: palette.green[600] }]}>
        <Check size={24} color={semantic.surface} strokeWidth={4} />
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: state === 'late' ? palette.red[500] : palette.accent[500] }]}>
      {state === 'late' ? (
        <AppText size="h3" weight="bold" color={semantic.surface}>
          !
        </AppText>
      ) : null}
    </View>
  );
}

export function Tile({ action, state, width, onPress }: { action: SimpleAction; state: TileState; width: number; onPress: () => void }) {
  const meta = TILES[action];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${meta.label}${STATE_TEXT[state]}`}
      style={({ pressed }) => [
        styles.tile,
        { width },
        state === 'late' && styles.tileLate,
        state === 'done' && styles.tileDone,
        pressed && styles.tilePressed,
      ]}>
      {meta.picto(72)}
      <AppText size="h2" weight="bold" align="center" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {meta.label}
      </AppText>
      <Badge state={state} />
    </Pressable>
  );
}

export function SimpleHome() {
  const { user, farms, farmId } = useAuth();
  const { hasPermission, fermiaReadOnly } = useFarmProfile();
  const { openSale } = useQuickCapture();
  const { contentWidth, gutter } = useScreen();
  const session = useSimpleSession();
  const { bands, isLoading } = useOpenBands();
  const [flow, setFlow] = useState<FlowKind | null>(null);

  const band = pickBand(bands, session.selectedBandId);
  const { entry, today } = useDayEntry(band);
  const cares = useBandCares(band);
  const weighing = useBandWeighing(band);
  const alerts = useRedAlerts();
  const farm = farms.find((f) => f.id === farmId) ?? farms[0] ?? null;

  const canEnter = hasPermission('saisie:creer') && !fermiaReadOnly;
  const actions = visibleActions({
    isLayer: band?.type === 'PONDEUSE',
    hasCares: cares.todo.length > 0,
    canEnter,
    canReport: hasPermission('sanitaire:signaler') || hasPermission('sanitaire:gerer'),
    canSell: hasPermission('vente:creer') && !fermiaReadOnly,
  });

  const localDone: ReadonlySet<SimpleEntryKind> = band ? doneSet(session, today, band.id) : new Set<SimpleEntryKind>();
  const tileWidth = gridColumns(contentWidth - gutter * 2, 140, 12, 2).tileWidth;
  const needsBand = bands.length > 1 && band == null;
  const sentence = needsBand ? SENTENCES.band : SENTENCES.home;
  useAnnounce(sentence, flow == null);

  const open = (action: SimpleAction) => {
    if (action === 'vendre') {
      openSale(band?.id);
      return;
    }
    setFlow(action);
  };

  return (
    <Screen
      bottomPad={layout.bottomPad}
      header={
        <View style={styles.header}>
          <View style={styles.headerText}>
            <AppText size="h2" weight="bold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {farm?.name ?? 'Ma ferme'}
            </AppText>
            <AppText size="h3" weight="semibold" color="muted" numberOfLines={1}>
              Bonjour {givenName(user.fullName)}
            </AppText>
          </View>
          <ConnectionPill />
          <SpeakButton text={`Bonjour ${givenName(user.fullName)}. ${sentence}`} />
        </View>
      }>
      {isLoading ? (
        <BrandLoader />
      ) : (
        <View style={styles.content}>
          {alerts[0] ? <SimpleAlertCard alert={alerts[0]} /> : null}
          {bands.length === 0 ? (
            <View style={styles.empty}>
              <WarningPicto size={96} />
              <AppText size="h2" weight="bold" align="center">
                Pas de bande en cours.
              </AppText>
            </View>
          ) : needsBand ? (
            <BandPicker bands={bands} onPick={selectBand} />
          ) : (
            <>
              {bands.length > 1 && band ? <BandChip band={band} onChange={() => selectBand(null)} /> : null}
              <OnBehalfBadge record={entry} />
              <View style={styles.grid}>
                {actions.map((action) => (
                  <Tile
                    key={action}
                    action={action}
                    width={tileWidth}
                    state={tileState(action, {
                      entry,
                      localDone,
                      caresLate: cares.late,
                      caresDueToday: cares.dueToday,
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
      <SimpleFlowModal flow={flow} band={band} bandLabel={bands.length > 1 && band ? bandName(band) : null} onClose={() => setFlow(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerText: { flex: 1, minWidth: 0 },
  content: { gap: 12, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  tile: {
    minHeight: 160,
    borderRadius: radii.xxl,
    backgroundColor: semantic.surface,
    borderWidth: 2,
    borderColor: semantic.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 10,
  },
  tileDone: { borderColor: palette.green[400], backgroundColor: palette.green[50] },
  tileLate: { borderColor: palette.red[500], backgroundColor: palette.red[50] },
  tilePressed: { backgroundColor: palette.brand[50] },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
