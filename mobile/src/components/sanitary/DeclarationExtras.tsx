import React, { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImagePlus, ShieldAlert, X } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { fetchProgramList, type DeclarationPhoto } from '@/api/poufa';
import { cachedRead } from '@/offline/ref-cache';
import { PHOTOS_SURVIVE_OFFLINE } from '@/offline/photo-files';
import { clinicalSignOptions, photoMimeType, photoRefusal, photoSlotsLeft, toggleSign } from '@/poufa/declaration';
import { color, palette, radii, semantic } from '@/constants/theme';
import { errorText } from '@/api/errorText';

/** SIGNE_CLINIQUE items, kept on the phone for offline declarations. */
export function useClinicalSigns() {
  return useQuery({
    queryKey: ['programme-list', 'SIGNE_CLINIQUE'],
    queryFn: () => cachedRead('list.SIGNE_CLINIQUE', () => fetchProgramList('SIGNE_CLINIQUE')),
    staleTime: 10 * 60_000,
  });
}

interface Props {
  signs: string[];
  onSigns: (codes: string[]) => void;
  suspicion: boolean;
  onSuspicion: (v: boolean) => void;
  photos: DeclarationPhoto[];
  onPhotos: (photos: DeclarationPhoto[]) => void;
  disabled?: boolean;
}

function Label({ text }: { text: string }) {
  return (
    <AppText size="small" weight="bold" color="muted" style={styles.label}>
      {text}
    </AppText>
  );
}

/**
 * Declaration fields of the POUFA programme (CDC 21) inside the health-event
 * form: clinical signs of the official list, suspicion, photos.
 */
export function DeclarationExtras({ signs, onSigns, suspicion, onSuspicion, photos, onPhotos, disabled }: Props) {
  const list = useClinicalSigns();
  const options = clinicalSignOptions(list.data ?? []);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const slots = photoSlotsLeft(photos.length);
  const webOnly = Platform.OS === 'web';

  const pick = async (source: 'camera' | 'library') => {
    setPhotoError(null);
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setPhotoError('Accès à l’appareil photo refusé : autorisez-le dans les réglages du téléphone.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, exif: false };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true, selectionLimit: slots });
      if (result.canceled) return;
      const next = [...photos];
      for (const asset of result.assets) {
        if (next.length >= 5) break;
        const refusal = photoRefusal({ uri: asset.uri, mimeType: asset.mimeType, fileSize: asset.fileSize });
        if (refusal) {
          setPhotoError(refusal);
          continue;
        }
        const mime = photoMimeType({ uri: asset.uri, mimeType: asset.mimeType }) ?? 'image/jpeg';
        const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
        next.push({ uri: asset.uri, name: asset.fileName ?? `declaration-${next.length + 1}.${ext}`, mimeType: mime });
      }
      onPhotos(next);
    } catch (e) {
      setPhotoError(errorText(e, 'Photo indisponible.'));
    }
  };

  return (
    <View style={styles.wrap}>
      <Label text="SIGNES CLINIQUES (LISTE DU PROGRAMME)" />
      {list.isLoading ? (
        <AppText size="caption" color="muted">
          Chargement de la liste…
        </AppText>
      ) : options.length === 0 ? (
        <AppText size="caption" color="muted">
          {list.isError
            ? 'Liste des signes cliniques indisponible hors ligne (jamais chargée sur ce téléphone).'
            : 'Aucun signe clinique dans la liste du programme.'}
        </AppText>
      ) : (
        <View style={styles.rowWrap}>
          {options.map((o) => {
            const selected = signs.includes(o.code);
            return (
              <Pressable
                key={o.code}
                onPress={() => onSigns(toggleSign(signs, o.code))}
                disabled={disabled}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={o.label}>
                <Chip label={o.label} tone={selected ? 'red' : 'outline'} dot={selected} />
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={[styles.suspicion, suspicion && styles.suspicionOn]}>
        <ShieldAlert size={18} color={suspicion ? palette.red[600] : color.ink[400]} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size="body" weight="semibold" color="text">
            Suspicion de maladie
          </AppText>
          <AppText size="small" color="muted">
            Ouvre une alerte sanitaire officielle, suivie par les services vétérinaires.
          </AppText>
        </View>
        <Switch
          value={suspicion}
          onValueChange={onSuspicion}
          disabled={disabled}
          trackColor={{ true: palette.red[500], false: color.ink[200] }}
          accessibilityLabel="Suspicion de maladie"
        />
      </View>

      <Label text={`PHOTOS (${photos.length}/5, OPTIONNEL)`} />
      {webOnly ? (
        <AppText size="caption" color="muted">
          Les photos se joignent depuis l’application Android ou iOS.
        </AppText>
      ) : (
        <>
          <View style={styles.rowWrap}>
            {photos.map((p, i) => (
              <View key={`${p.uri}-${i}`} style={styles.thumb}>
                <Image source={{ uri: p.uri }} style={styles.thumbImg} />
                <Pressable
                  onPress={() => onPhotos(photos.filter((_, j) => j !== i))}
                  disabled={disabled}
                  style={styles.thumbRemove}
                  accessibilityRole="button"
                  accessibilityLabel={`Retirer la photo ${i + 1}`}>
                  <X size={12} color={semantic.surface} strokeWidth={3} />
                </Pressable>
              </View>
            ))}
            {slots > 0 ? (
              <>
                <Pressable onPress={() => void pick('camera')} disabled={disabled} style={styles.addPhoto} accessibilityRole="button" accessibilityLabel="Prendre une photo">
                  <Camera size={18} color={palette.red[600]} />
                  <AppText size="label" weight="semibold" color="danger">
                    Photo
                  </AppText>
                </Pressable>
                <Pressable onPress={() => void pick('library')} disabled={disabled} style={styles.addPhoto} accessibilityRole="button" accessibilityLabel="Choisir dans la galerie">
                  <ImagePlus size={18} color={palette.red[600]} />
                  <AppText size="label" weight="semibold" color="danger">
                    Galerie
                  </AppText>
                </Pressable>
              </>
            ) : null}
          </View>
          <AppText size="small" color="faint">
            {PHOTOS_SURVIVE_OFFLINE
              ? 'Hors connexion, les photos sont gardées sur le téléphone et envoyées avec la déclaration.'
              : 'Les photos partent avec la déclaration une fois la connexion revenue.'}
          </AppText>
        </>
      )}
      {photoError ? (
        <AppText size="small" color="danger">
          {photoError}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  label: { letterSpacing: 0.4 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suspicion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  suspicionOn: { borderColor: palette.red[300], backgroundColor: semantic.dangerSoft },
  thumb: { width: 64, height: 64, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: semantic.surfaceAlt },
  thumbImg: { width: '100%', height: '100%' },
  thumbRemove: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  addPhoto: {
    width: 64,
    height: 64,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.red[300],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: semantic.dangerSoft,
  },
});
