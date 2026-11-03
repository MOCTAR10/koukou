import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { LogOut, Tractor } from 'lucide-react-native';

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
import { color } from '@/constants/theme';
import { BUYER_TYPES, Labeled, marketError, PillRow } from './shared';

function BecomeFarmerCard() {
  const router = useRouter();
  const { becomeFarmer, busy, error } = useAuth();
  const [farmName, setFarmName] = useState('');
  const [farmCity, setFarmCity] = useState('');

  const submit = async () => {
    const ok = await becomeFarmer(farmName.trim(), farmCity.trim() || undefined);
    if (ok) router.replace('/');
  };

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Tractor size={18} color={color.brand[600]} />
        <AppText size="bodyM" weight="semibold">Vous avez une ferme ?</AppText>
      </View>
      <AppText size="small" color="muted">
        Créez-la avec ce compte pour gérer vos lots et, une fois vérifiée, publier vos annonces. Vous gardez vos commandes.
      </AppText>
      <Labeled label="Nom de la ferme">
        <TextField value={farmName} onChangeText={setFarmName} accessibilityLabel="Nom de la ferme" />
      </Labeled>
      <Labeled label="Ville">
        <TextField value={farmCity} onChangeText={setFarmCity} accessibilityLabel="Ville de la ferme" />
      </Labeled>
      {error ? <AppText size="small" color="danger">{error}</AppText> : null}
      <Button label="Créer ma ferme" tone="ghost" loading={busy} disabled={farmName.trim().length < 2} onPress={() => void submit()} />
    </Card>
  );
}

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
        {isBuyer ? <BecomeFarmerCard /> : null}
        {isBuyer ? <Button label="Se déconnecter" icon={LogOut} tone="ghost" onPress={() => void signOut()} /> : null}
      </View>
    </Screen>
  );
}
