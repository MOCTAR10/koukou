import React, { createContext, useContext, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Bird, BookOpen, Building2, HandCoins, PackageOpen, Syringe } from 'lucide-react-native';

import { CreateLotSheet } from '../CreateLotSheet';
import { CreateBuildingSheet } from '../CreateBuildingSheet';
import { FarmLogo } from '../ui/FarmLogo';
import { RadialMenu, type RadialItem } from './RadialMenu';
import { color } from '@/constants/theme';
import { useQuickCapture } from '../capture/QuickCaptureProvider';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { useAuth } from '@/auth/AuthContext';
import type { PermissionCode } from '@/api/types';

type CreateMode = 'none' | 'menu' | 'lot' | 'building';

type CreateKey = 'lot' | 'building' | 'daily' | 'sale' | 'feed' | 'care';

interface CreateCenterApi {
  openCreateMenu: () => void;
  openCreateLot: () => void;
  openCreateBuilding: () => void;
}

const CreateCenterContext = createContext<CreateCenterApi | null>(null);

export function useCreateCenter(): CreateCenterApi {
  const ctx = useContext(CreateCenterContext);
  if (!ctx) throw new Error('useCreateCenter doit être utilisé dans CreateCenterProvider');
  return ctx;
}

/**
 * Les six entrées du cercle. `perm` pilote l'affichage : une entrée que le rôle
 * courant ne peut pas utiliser n'est pas proposée — mieux vaut un anneau de
 * trois nœuds qu'un anneau qui mène à un écran interdit.
 */
/**
 * Les six entrées du cercle. `perm` pilote l'affichage : une entrée que le rôle
 * courant ne peut pas utiliser n'est pas proposée — mieux vaut un anneau de
 * trois nœuds qu'un anneau qui mène à un écran interdit.
 *
 * `short` est ce qui s'affiche sous l'icône ; il faut tenir dans ~100pt entre
 * deux nœuds voisins, donc on abrège (« Lot », pas « Nouveau lot »).
 */
const CREATE_ACTIONS: (RadialItem & { key: CreateKey; perm: PermissionCode })[] = [
  { key: 'daily', label: 'Saisie du jour', short: 'Saisie', hint: 'Morts, aliments, eau', icon: BookOpen, bg: color.green[50], fg: color.green[600], perm: 'saisie:creer' },
  { key: 'lot', label: 'Nouveau lot', short: 'Lot', hint: 'Bande de poulets', icon: Bird, bg: color.brand[50], fg: color.brand[600], perm: 'production:gerer' },
  { key: 'feed', label: 'Entrée provende', short: 'Provende', hint: 'Nouveau lot HACCP', icon: PackageOpen, bg: color.surfaceAlt, fg: color.ink[600], perm: 'stock:gerer' },
  { key: 'care', label: 'Soin', short: 'Soin', hint: 'Protocole sanitaire', icon: Syringe, bg: color.brand[50], fg: color.brand[700], perm: 'sanitaire:lecture' },
  { key: 'building', label: 'Bâtiment', short: 'Bâtiment', hint: 'Infrastructure', icon: Building2, bg: color.brand[50], fg: color.brand[700], perm: 'production:gerer' },
  { key: 'sale', label: 'Encaisser', short: 'Encaisser', hint: 'POS espèces', icon: HandCoins, bg: color.accent[50], fg: color.accent[600], perm: 'vente:creer' },
];

export function CreateCenterProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { farms, farmId } = useAuth();
  const { openDaily, openSale, openFeed } = useQuickCapture();
  const { hasPermission } = useFarmProfile();
  const [mode, setMode] = useState<CreateMode>('none');

  const close = () => setMode('none');

  const api = useMemo<CreateCenterApi>(
    () => ({
      openCreateMenu: () => setMode('menu'),
      openCreateLot: () => setMode('lot'),
      openCreateBuilding: () => setMode('building'),
    }),
    [],
  );

  const items = useMemo(
    () =>
      CREATE_ACTIONS.filter((a) => hasPermission(a.perm)).map(
        ({ perm: _perm, ...item }): RadialItem => item,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [farms, farmId],
  );

  const handlePick = (key: CreateKey) => {
    switch (key) {
      case 'lot':
        setMode('lot');
        return;
      case 'building':
        setMode('building');
        return;
      case 'daily':
        close();
        openDaily();
        return;
      case 'sale':
        close();
        openSale();
        return;
      case 'feed':
        close();
        openFeed();
        return;
      case 'care':
        close();
        router.push('/sanitary');
        return;
    }
  };

  const farm = farms.find((f) => f.id === farmId) ?? farms[0];

  return (
    <CreateCenterContext.Provider value={api}>
      {children}

      <CreateLotSheet visible={mode === 'lot'} onClose={close} />
      <CreateBuildingSheet visible={mode === 'building'} onClose={close} />

      <RadialMenu
        visible={mode === 'menu'}
        items={items}
        onPick={(key) => handlePick(key as CreateKey)}
        onClose={close}
        hubLabel={farm?.name ?? 'KouKou'}
        hub={<FarmLogo farm={farm} size={58} tone="brand" />}
      />
    </CreateCenterContext.Provider>
  );
}
