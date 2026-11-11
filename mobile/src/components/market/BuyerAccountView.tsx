import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react-native';

import { fetchBuyerProfile, saveBuyerProfile } from '@/api/market';
import { roleLabel } from '@/api/roles';
import type { CustomerType } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { toast } from '@/components/ui/Feedback';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Skeleton } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { customerTypeLabel } from '@/constants/customers';
import { palette, radii, semantic, spacing } from '@/constants/theme';
import { BUYER_TYPES, Labeled, marketError, PillRow } from './shared';

export function BuyerAccountView({ back = false }: { back?: boolean }) {
  const client = useQueryClient();
  const { user, signOut } = useAuth();
  const isBuyer = user.role === 'ACHETEUR';
  const query = useQuery({ queryKey: ['buyer-profile'], queryFn: fetchBuyerProfile });
  const [type, setType] = useState<CustomerType>('PARTICULIER');
  const [organizationName, setOrganizationName] = useState('');
  const [city, setCity] = useState('');

  useEffect(() => {
    if (!query.data) return;
    setType(query.data.type);
    setOrganizationName(query.data.organizationName ?? '');
    setCity(query.data.city ?? '');
  }, [query.data]);

  const save = useMutation({
    mutationFn: () =>
      saveBuyerProfile({
        type,
        organizationName: type !== 'PARTICULIER' ? organizationName.trim() || undefined : undefined,
        city: city.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Profil enregistré');
      void client.invalidateQueries({ queryKey: ['buyer-profile'] });
    },
    onError: (e) => toast.error('Enregistrement impossible', marketError(e)),
  });

  const name = user.fullName.trim();
  return (
    <Screen header={<ScreenHeader title="Mon compte" back={back} />}>
      <View style={styles.page}>
        {/* Who is signed in: the one dark surface of the screen. */}
        <Card tone="hero" style={styles.identity}>
          <View style={styles.avatar}>
            <AppText size="h2" weight="bold" color={palette.green[300]}>
              {(name.charAt(0) || 'A').toUpperCase()}
            </AppText>
          </View>
          <View style={styles.identityText}>
            <AppText size="h3" weight="bold" color={semantic.textOnFill} numberOfLines={1}>
              {name}
            </AppText>
            <AppText size="small" color={palette.brand[200]} numberOfLines={1}>
              {query.data ? customerTypeLabel(query.data.type) : roleLabel(user.role)}
            </AppText>
          </View>
        </Card>

        <Card style={styles.form}>
          <View style={styles.formHead}>
            <AppText size="body" weight="semibold">
              Mon profil d’acheteur
            </AppText>
            <AppText size="small" color="muted">
              La ferme voit ces informations avec vos demandes.
            </AppText>
          </View>
          {query.isLoading ? (
            <View style={styles.form} accessibilityLabel="Chargement du profil">
              <Skeleton height={40} radius={radii.pill} />
              <Skeleton height={48} radius={radii.md} />
            </View>
          ) : (
            <>
              <Labeled label="Je suis">
                <PillRow<CustomerType>
                  value={type}
                  onChange={setType}
                  options={BUYER_TYPES.map((key) => ({ key, label: customerTypeLabel(key) }))}
                />
              </Labeled>
              {type !== 'PARTICULIER' ? (
                <Labeled label="Nom de l’établissement">
                  <TextField value={organizationName} onChangeText={setOrganizationName} maxLength={120} accessibilityLabel="Nom de l’établissement" />
                </Labeled>
              ) : null}
              <Labeled label="Ville">
                <TextField value={city} onChangeText={setCity} maxLength={80} accessibilityLabel="Ville" />
              </Labeled>
              <Button label="Enregistrer" size="lg" loading={save.isPending} onPress={() => save.mutate()} />
            </>
          )}
        </Card>
        {isBuyer ? <Button label="Se déconnecter" icon={LogOut} tone="ghost" onPress={() => void signOut()} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: spacing.md,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.xxl,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  form: {
    gap: spacing.md,
  },
  formHead: {
    gap: spacing.xxs,
  },
});
