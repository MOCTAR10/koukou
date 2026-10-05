import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Map as MapIcon, MapPin, X } from 'lucide-react-native';

import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { Spinner } from '../ui/Spinner';
import { suggestGabonAddress, type GeoSuggest } from '@/utils/geocode';
import { color, palette, radii, spacing } from '@/constants/theme';

interface AddressSearchSheetProps {
  visible: boolean;
  province?: string | null;
  onPick: (r: GeoSuggest) => void;
  onManual: (text: string) => void;
  onClose: () => void;
}

/**
 * Recherche d'adresse en temps réel sur OpenStreetMap (Photon), restreinte au
 * Gabon et cadrée par la province si sélectionnée. Partagé entre le formulaire
 * des points de vente et l'adresse de livraison des commandes.
 */
export function AddressSearchSheet({
  visible,
  province,
  onPick,
  onManual,
  onClose,
}: AddressSearchSheetProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeoSuggest[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setSuggestions([]);
  }, [visible]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || !visible) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      suggestGabonAddress(q, province ?? undefined)
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, province, visible]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Adresse"
      subtitle={province ? `Recherche · ${province}, Gabon` : 'Recherche sur OpenStreetMap (Gabon)'}
      icon={<MapIcon size={22} color={color.brand[600]} />}
      stickyHeader={
        <View style={styles.inputWrap}>
          <View style={styles.inputIcon}>
            <MapIcon size={18} color={color.ink[400]} />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Marché, rue, lieu-dit, quartier…"
            placeholderTextColor={color.ink[300]}
            style={styles.input}
            autoFocus
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} style={styles.inputIcon}>
              <X size={16} color={color.ink[400]} />
            </Pressable>
          ) : null}
        </View>
      }
      footer={
        <Button
          label="Ajouter cette adresse manuellement"
          tone="ghost"
          size="md"
          disabled={query.trim().length === 0}
          onPress={() => onManual(query.trim())}
        />
      }>
      <View style={{ gap: spacing.sm }}>
        {searching ? <Spinner label="Recherche…" /> : null}
        {suggestions.length > 0 ? (
          <View style={styles.suggestWrap}>
            {suggestions.map((s) => (
              <Pressable
                key={`${s.latitude}-${s.longitude}-${s.label}`}
                onPress={() => onPick(s)}
                accessibilityRole="button"
                style={styles.suggestRow}>
                <MapPin size={14} color={color.accent[600]} />
                <View style={{ flex: 1, gap: 1 }}>
                  <AppText size="small" weight="semibold" color="text" numberOfLines={1}>
                    {s.label.split(',')[0]}
                  </AppText>
                  <AppText size="caption" color="muted" numberOfLines={2}>
                    {s.label}
                  </AppText>
                </View>
              </Pressable>
            ))}
          </View>
        ) : !searching && query.trim().length >= 3 ? (
          <View style={styles.suggestEmpty}>
            <AppText size="small" color="muted">
              Aucun résultat pour « {query.trim()} » — utilisez le bouton ci-dessous pour saisir manuellement.
            </AppText>
          </View>
        ) : !searching ? (
          <AppText size="caption" color="faint">
            Tapez au moins 3 lettres pour rechercher (rue, marché, quartier, ville…).
          </AppText>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    backgroundColor: color.surface,
  },
  inputIcon: {
    paddingLeft: 12,
  },
  input: {
    flex: 1,
    height: 42,
    paddingHorizontal: 10,
    fontSize: 14,
    color: color.ink[800],
  },
  suggestWrap: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  suggestEmpty: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: radii.md,
    padding: 10,
  },
});