import React, { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImagePlus, X } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import type { DeclarationPhoto } from '@/api/poufa';
import { PHOTOS_SURVIVE_OFFLINE } from '@/offline/photo-files';
import { photoMimeType, photoRefusal } from '@/poufa/declaration';
import { MAX_VISIT_PHOTOS, visitPhotoSlotsLeft } from '@/poufa/visits';
import { color, palette, radii, semantic } from '@/constants/theme';
import { errorText } from '@/api/errorText';

/**
 * Photos of a visit: camera or gallery (expo-image-picker, compressed), shown
 * as removable thumbnails. The files travel with the queued visit and are sent
 * once it exists (a visit is never edited afterwards).
 */
export function VisitPhotoPicker({ photos, onPhotos, disabled }: { photos: DeclarationPhoto[]; onPhotos: (photos: DeclarationPhoto[]) => void; disabled?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const slots = visitPhotoSlotsLeft(photos.length);

  const pick = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError('Accès à l’appareil photo refusé : autorisez-le dans les réglages du téléphone.');
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
        if (next.length >= MAX_VISIT_PHOTOS) break;
        const refusal = photoRefusal({ uri: asset.uri, mimeType: asset.mimeType, fileSize: asset.fileSize });
        if (refusal) {
          setError(refusal);
          continue;
        }
        const mime = photoMimeType({ uri: asset.uri, mimeType: asset.mimeType }) ?? 'image/jpeg';
        const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
        next.push({ uri: asset.uri, name: asset.fileName ?? `visite-${next.length + 1}.${ext}`, mimeType: mime });
      }
      onPhotos(next);
    } catch (e) {
      setError(errorText(e, 'Photo indisponible.'));
    }
  };

  if (Platform.OS === 'web') {
    return (
      <AppText size="caption" color="muted">
        Les photos se joignent depuis l’application Android ou iOS.
      </AppText>
    );
  }
  return (
    <View style={{ gap: 8 }}>
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
            <Pressable onPress={() => void pick('camera')} disabled={disabled} style={styles.add} accessibilityRole="button" accessibilityLabel="Prendre une photo">
              <Camera size={18} color={color.brand[700]} />
              <AppText size="label" weight="semibold" color="text">
                Photo
              </AppText>
            </Pressable>
            <Pressable onPress={() => void pick('library')} disabled={disabled} style={styles.add} accessibilityRole="button" accessibilityLabel="Choisir dans la galerie">
              <ImagePlus size={18} color={color.brand[700]} />
              <AppText size="label" weight="semibold" color="text">
                Galerie
              </AppText>
            </Pressable>
          </>
        ) : null}
      </View>
      <AppText size="small" color="faint">
        {PHOTOS_SURVIVE_OFFLINE
          ? 'Hors connexion, les photos sont gardées sur le téléphone et envoyées avec la visite.'
          : 'Les photos partent avec la visite une fois la connexion revenue.'}
      </AppText>
      {error ? (
        <AppText size="small" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  add: {
    width: 64,
    height: 64,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.brand[300],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: semantic.primarySoft,
  },
});
