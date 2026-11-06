import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
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
import { Spinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { customerTypeLabel } from '@/constants/customers';
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

  return (
    <Screen header={<ScreenHeader title="Mon compte" subtitle={`${user.fullName} · ${roleLabel(user.role)}`} back={back} />}>
      <View style={{ gap: 12 }}>
        <Card style={{ gap: 12 }}>
          <AppText size="bodyM" weight="semibold">Mon profil d’acheteur</AppText>
          <AppText size="small" color="muted">La ferme voit ces informations avec vos demandes.</AppText>
          {query.isLoading ? (
            <Spinner label="Chargement…" />
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
              <Button label="Enregistrer" loading={save.isPending} onPress={() => save.mutate()} />
            </>
          )}
        </Card>
        {isBuyer ? <Button label="Se déconnecter" icon={LogOut} tone="ghost" onPress={() => void signOut()} /> : null}
      </View>
    </Screen>
  );
}
