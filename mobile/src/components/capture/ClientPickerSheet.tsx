import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { UserRound, Users } from 'lucide-react-native';

import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { Sheet } from '../ui/Sheet';
import { Spinner } from '../ui/Spinner';
import { fetchCustomers } from '@/api';
import type { Customer } from '@/api/types';
import { customerTypeLabel } from '@/constants/customers';
import { color, palette, radii, spacing, fmtFcfa } from '@/constants/theme';

interface ClientPickerSheetProps {
  visible: boolean;
  farmId: string;
  selectedId?: string | null;
  creditMode?: boolean;
  /** Libellé du lien « passer sans client » (par défaut Encaisser sans client). */
  unselectLabel?: string;
  onSelect: (customer: Customer | null) => void;
  onClose: () => void;
}

export function ClientPickerSheet({
  visible,
  farmId,
  selectedId,
  creditMode = false,
  unselectLabel = 'Encaisser sans client',
  onSelect,
  onClose,
}: ClientPickerSheetProps) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSearch('');
  }, [visible]);

  const customersQuery = useQuery({
    queryKey: ['customers', farmId],
    queryFn: () => fetchCustomers(farmId),
    enabled: visible,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = customersQuery.data ?? [];
    if (!q) return list;
    return list.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q) ||
        (c.code ?? '').toLowerCase().includes(q),
    );
  }, [customersQuery.data, search]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Choisir un client"
      subtitle="Client existant trouvé par nom, code ou téléphone"
      icon={<Users size={22} color={color.brand[600]} />}>
      <View style={{ gap: spacing.sm }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher…"
          placeholderTextColor={color.ink[300]}
          style={styles.input}
          autoCorrect={false}
        />

        {customersQuery.isLoading ? (
          <Spinner label="Chargement des clients…" />
        ) : filtered.length === 0 ? (
          <AppText size="caption" color="muted" style={{ textAlign: 'center', paddingVertical: spacing.lg }}>
            {search.trim()
              ? 'Aucun client ne correspond.'
              : 'Aucun client enregistré. Saisissez le nom et le téléphone à l’encaissement pour créer la fiche.'}
          </AppText>
        ) : (
          <View style={{ gap: 8 }}>
            {filtered.map((c) => {
              const selected = c.id === selectedId;
              const due = c.balance?.outstandingFcfa ?? 0;
              return (
                <Card
                  key={c.id}
                  tone={selected ? 'brand' : 'default'}
                  onPress={() => {
                    onSelect(c);
                    onClose();
                  }}
                  style={styles.card}>
                  <View style={styles.avatar}>
                    <UserRound size={18} color={color.surface} />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <AppText size="body" weight="semibold" color="text" numberOfLines={1}>
                      {c.fullName}
                    </AppText>
                    <AppText size="caption" color="muted" numberOfLines={1}>
                      {[c.code, customerTypeLabel(c.type), c.phone].filter(Boolean).join(' · ') || 'Aucun contact'}
                    </AppText>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <AppText size="small" weight="semibold" color={due > 0 ? 'danger' : 'success'} numberOfLines={1}>
                      {due > 0 ? `Dû ${fmtFcfa(due)}` : 'Soldé'}
                    </AppText>
                  </View>
                </Card>
              );
            })}
          </View>
        )}

        {!creditMode ? (
          <Pressable
            onPress={() => {
              onSelect(null);
              onClose();
            }}
            hitSlop={6}
            accessibilityRole="button">
            <AppText size="small" weight="semibold" color="brand" style={{ textAlign: 'center', marginTop: spacing.xs }}>
              {unselectLabel}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    fontSize: 15,
    color: color.ink[800],
    backgroundColor: color.surface,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
});