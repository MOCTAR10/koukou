import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import * as ImagePicker from 'expo-image-picker';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { FarmLogo } from '@/components/ui/FarmLogo';
import { updateFarmSettings, uploadFarmLogo, deleteFarmLogo } from '@/api/mutations';
import { useAuth } from '@/auth/AuthContext';
import type { Farm } from '@/api/types';
import { color, palette, radii } from '@/constants/theme';
import { Camera, Check, Pencil, Trash2, X } from 'lucide-react-native';

const LOGO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

interface FarmIdentityCardProps {
  farm: Farm;
  /** Droit « reglages:ferme » (ou accès complet) : autorise nom + logo. */
  canEdit: boolean;
}

/** Nom de la ferme + logo (upload ou marque KouKou blanche par défaut). */
export function FarmIdentityCard({ farm, canEdit }: FarmIdentityCardProps) {
  const { refreshFarms } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(farm.name);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setDraftName(farm.name);
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraftName(farm.name);
    setError(null);
    setEditing(false);
  };

  const saveName = async () => {
    const name = draftName.trim();
    if (name.length < 2) {
      setError('Le nom doit comporter au moins 2 caractères.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateFarmSettings(farm.id, { name });
      await refreshFarms();
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  const pickLogo = async () => {
    setPicking(true);
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset?.uri && !asset?.file) {
        setError('Image introuvable.');
        return;
      }
      const extension = asset.mimeType?.split('/')[1] ?? asset.uri?.split('.').pop()?.split('?')[0] ?? 'jpg';

      setBusy(true);
      await uploadFarmLogo(farm.id, {
        uri: asset.uri,
        file: asset.file,
        name: asset.fileName ?? asset.file?.name ?? `logo.${extension}`,
        mimeType: LOGO_MIME[extension] ?? asset.mimeType ?? 'image/jpeg',
      });
      await refreshFarms();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Envoi du logo impossible.');
    } finally {
      setBusy(false);
      setPicking(false);
    }
  };

  const removeLogo = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteFarmLogo(farm.id);
      await refreshFarms();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Suppression du logo impossible.');
    } finally {
      setBusy(false);
    }
  };

  const confirmRemoveLogo = () => {
    Alert.alert(
      'Retirer le logo',
      'La ferme repassera au logo KouKou par défaut. Confirmer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Retirer', style: 'destructive', onPress: () => void removeLogo() },
      ],
    );
  };

  return (
    <Card tone="brand" style={styles.card}>
      <View style={styles.head}>
        <FarmLogo farm={farm} size={52} />
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          {editing ? (
            <TextInput
              style={styles.input}
              value={draftName}
              onChangeText={setDraftName}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={saveName}
              placeholder="Nom de la ferme"
              placeholderTextColor={palette.ink[300]}
              accessibilityLabel="Nom de la ferme"
            />
          ) : (
            <AppText size="body" weight="bold" color="text" numberOfLines={1}>
              {farm.name}
            </AppText>
          )}
          <AppText size="caption" color="muted" numberOfLines={1}>
            {farm.administrativeCity || 'Commune non renseignée'}
          </AppText>
        </View>

        {canEdit && !editing ? (
          <Pressable
            onPress={startEdit}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`Renommer la ferme ${farm.name}`}>
            <Pencil size={14} color={color.brand[600]} />
          </Pressable>
        ) : null}
      </View>

      {editing ? (
        <View style={styles.actions}>
          <Button
            label="Enregistrer"
            tone="primary"
            size="sm"
            image={require('@/assets/images/logo-white.png')}
            loading={busy}
            onPress={saveName}
            style={styles.actionBtn}
          />
          <Button
            label="Annuler"
            tone="ghost"
            size="sm"
            onPress={cancelEdit}
            style={styles.actionBtn}
          />
        </View>
      ) : null}

      <View style={styles.factRow}>
        <View style={styles.factPills}>
          <Chip label={farm.active ? 'Active' : 'Suspendue'} tone={farm.active ? 'green' : 'red'} />
        </View>
      </View>

      {canEdit ? (
        <View style={styles.logoRow}>
          <Pressable
            onPress={pickLogo}
            disabled={busy || picking}
            style={({ pressed }) => [styles.logoBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={
              farm.logoUrl ? 'Changer le logo de la ferme' : 'Ajouter le logo de ma ferme'
            }>
            {picking || (busy && !editing) ? (
              <ActivityIndicator size="small" color={color.brand[600]} />
            ) : (
              <Camera size={14} color={color.brand[600]} />
            )}
            <AppText size="small" weight="semibold" color="brand" style={{ flex: 1 }}>
              {farm.logoUrl ? 'Changer le logo' : 'Ajouter le logo de ma ferme'}
            </AppText>
            {farm.logoUrl ? (
              <View style={styles.logoTag}>
                <Check size={11} color={palette.green[600]} strokeWidth={3} />
                <AppText size="small" color="muted">
                  Logo personnalisé
                </AppText>
              </View>
            ) : null}
          </Pressable>

          {farm.logoUrl ? (
            <Pressable
              onPress={confirmRemoveLogo}
              disabled={busy || picking}
              style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Retirer le logo de la ferme">
              <Trash2 size={14} color={color.red[500]} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!farm.logoUrl ? (
        <AppText size="small" color="faint">
          Sans logo, c’est la marque KouKou blanche qui s’affiche sur vos écrans.
        </AppText>
      ) : null}

      {error ? (
        <View style={styles.errorRow}>
          <X size={13} color={color.red[500]} />
          <AppText size="small" color="danger" style={{ flex: 1 }}>
            {error}
          </AppText>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 14,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  input: {
    height: 40,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: 12,
    fontSize: 15,
    color: palette.ink[900],
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  factPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: color.brand[200],
    backgroundColor: palette.surface,
  },
  removeBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.red[100],
    backgroundColor: color.red[50],
  },
  logoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});