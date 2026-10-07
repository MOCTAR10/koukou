import React from 'react';
import { Bird, Sprout } from 'lucide-react-native';

import { Segmented } from './ui/Segmented';
import { color } from '@/constants/theme';
import { useAuth, type FarmMode } from '@/auth/AuthContext';

/** Bascule Élevage / Agriculture, posée au-dessus des métriques d'accueil. */
export function FarmModeSwitch() {
  const { farmMode, setFarmMode } = useAuth();

  return (
    <Segmented<FarmMode>
      value={farmMode}
      onChange={setFarmMode}
      haptic
      options={[
        {
          key: 'aviculture',
          label: 'Élevage',
          icon: <Bird size={15} color={farmMode === 'aviculture' ? color.brand[600] : color.ink[400]} strokeWidth={2.2} />,
          tint: color.brand[600],
        },
        {
          key: 'agriculture',
          label: 'Agriculture',
          icon: <Sprout size={15} color={farmMode === 'agriculture' ? color.green[600] : color.ink[400]} strokeWidth={2.2} />,
          tint: color.green[600],
        },
      ]}
    />
  );
}