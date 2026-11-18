import React from 'react';
import { useRouter, type Href } from 'expo-router';
import { PenLine } from 'lucide-react-native';

import { Button } from '@/components/ui/Button';
import { useFarmProfile } from '@/hooks/useFarmProfile';

/**
 * « Saisir pour cet éleveur »: primary action of a technical agent (institution
 * whose matrix grants the daily entry and/or the health declaration) on the
 * active farm. Nothing for any other account.
 */
export function DelegatedEntryButton({ size = 'md', block = true }: { size?: 'xs' | 'sm' | 'md'; block?: boolean }) {
  const router = useRouter();
  const { delegated } = useFarmProfile();
  if (!delegated.daily && !delegated.declaration) return null;
  return (
    <Button
      label="Saisir pour cet éleveur"
      tone="brand"
      size={size}
      icon={PenLine}
      block={block}
      onPress={() => router.push('/saisie-deleguee' as Href)}
    />
  );
}
