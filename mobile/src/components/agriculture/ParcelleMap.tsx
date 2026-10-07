import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { MapPin, Sprout } from 'lucide-react-native';

import { AppText } from '../ui/AppText';
import type { Farm, Parcelle } from '@/api/types';
import { CULTURE_EMOJI } from '@/constants/agriculture';
import {
  geoJsonOuterRing,
  parcelleCenter,
  parcellesCenter,
  ringLatDelta,
  type LatLng,
} from '@/constants/geo';
import { palette, radii, shadow } from '@/constants/theme';

/** Dimensions (ha) → couleur de remplissage du polygone. */
export const STATUS_FILL: Record<Parcelle['status'], string> = {
  PREPARATION: 'rgba(224, 114, 16, 0.35)',
  ACTIVE: 'rgba(96, 160, 64, 0.35)',
  JACHERE: 'rgba(224, 164, 0, 0.30)',
  CLOTURE: 'rgba(88, 120, 140, 0.30)',
};

export const STATUS_STROKE: Record<Parcelle['status'], string> = {
  PREPARATION: '#C25F0E',
  ACTIVE: '#4C8A33',
  JACHERE: '#997100',
  CLOTURE: '#58788C',
};

interface ParcelleMapProps {
  farm: Farm | null;
  parcelles: Parcelle[];
  height?: number;
  /** Parcelle sélectionnée (centroïde mis en avant + label). */
  selectedId?: string | null;
  onSelectParcelle?: (id: string) => void;
}

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * Carte des parcelles (react-native-maps, tuiles OSM — aucune clé API).
 * Chaque parcelle porte un marqueur au centroïde (émoji de sa culture) :
 * tap sur un polygone ou un marqueur → `onSelectParcelle`.
 * Hors mobile (web), affiche un panneau de repli.
 */
export function ParcelleMap({ farm, parcelles, height = 320, selectedId, onSelectParcelle }: ParcelleMapProps) {
  const [web] = React.useState(() => Platform.OS === 'web');

  // lazy import : évite d'analyser react-native-maps sur web.
  const MapComponent = React.useMemo(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    () => (web ? null : require('react-native-maps')) as typeof import('react-native-maps') | null,
    [web],
  );

  if (web || !MapComponent) {
    return (
      <View style={[styles.fallback, { height }]}>
        <Sprout size={26} color={palette.green[600]} strokeWidth={2} />
        <AppText size="body" weight="semibold" color="text" align="center">
          Carte disponible sur mobile
        </AppText>
        <AppText size="small" color="muted" align="center">
          Ouvrez KouKou sur votre téléphone pour visualiser vos parcelles sur fond OpenStreetMap.
        </AppText>
      </View>
    );
  }

  const { default: MapView, Marker, Polygon, UrlTile } = MapComponent;

  const center = parcellesCenter(parcelles) ?? farmCenter(farm);
  const delta = Math.max(ringLatDelta(parcelles[0]?.boundaryGeoJson ? geoJsonOuterRing(parcelles[0].boundaryGeoJson) : []), 0.008);

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: center?.latitude ?? -0.6,
          longitude: center?.longitude ?? 9.45,
          latitudeDelta: delta * 2.2,
          longitudeDelta: delta * 2.2,
        }}
        onMapReady={() => {}}
      >
        <UrlTile urlTemplate={OSM_URL} shouldReplaceMapContent zIndex={-1} />
        {farm?.latitude != null && farm?.longitude != null && (
          <Marker
            coordinate={{ latitude: farm.latitude, longitude: farm.longitude }}
            title={farm.name ?? 'Ma ferme'}
            tracksViewChanges={false}
          >
            <View style={styles.farmPin}>
              <MapPin size={17} color={palette.surface} strokeWidth={2.2} />
            </View>
          </Marker>
        )}
        {parcelles.map((p) => {
          const ring = geoJsonOuterRing(p.boundaryGeoJson);
          if (ring.length < 3) return null;
          const center = parcelleCenter(p);
          const selected = p.id === selectedId;
          return (
            <React.Fragment key={p.id}>
              <Polygon
                coordinates={ring}
                fillColor={STATUS_FILL[p.status]}
                strokeColor={selected ? palette.brand[600] : STATUS_STROKE[p.status]}
                strokeWidth={selected ? 3.5 : 2}
                tappable
                onPress={() => onSelectParcelle?.(p.id)}
              />
              {center && (
                <Marker
                  coordinate={center}
                  title={p.name}
                  description={p.culture.name}
                  tracksViewChanges={false}
                  onPress={() => onSelectParcelle?.(p.id)}
                >
                  <View style={[styles.centroidPin, selected && styles.centroidPinSelected]}>
                    <AppText style={{ fontSize: 13 }}>{CULTURE_EMOJI[p.culture.category]}</AppText>
                  </View>
                </Marker>
              )}
            </React.Fragment>
          );
        })}
      </MapView>
      <View style={styles.legend}>
        <AppText size="small" weight="semibold" color="text">
          {parcelles.length} parcelle{parcelles.length > 1 ? 's' : ''}
        </AppText>
      </View>
    </View>
  );
}

function farmCenter(farm: Farm | null): LatLng | null {
  if (farm?.latitude != null && farm?.longitude != null) {
    return { latitude: farm.latitude, longitude: farm.longitude };
  }
  return null;
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  fallback: {
    borderRadius: radii.lg,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  farmPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.surface,
  },
  legend: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    opacity: 0.92,
  },
  centroidPin: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 5,
    borderRadius: 13,
    backgroundColor: palette.surface,
    borderWidth: 1.5,
    borderColor: palette.green[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  centroidPinSelected: {
    borderColor: palette.brand[600],
    borderWidth: 2.5,
  },
});