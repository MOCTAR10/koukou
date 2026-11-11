import React from 'react';
import { router, type Href } from 'expo-router';

import { Segmented } from '@/components/ui/Segmented';

type Side = 'login' | 'register';

const ROUTES: Record<Side, string> = {
  login: '/login',
  register: '/inscription-acheteur',
};

/**
 * Sign-in and sign-up of a Market customer, one tap apart. The other screen
 * replaces this one and keeps `from`, so the visitor still returns to the
 * listing that asked for an account.
 */
export function BuyerAuthSwitch({ active, from }: { active: Side; from?: string }) {
  return (
    <Segmented<Side>
      value={active}
      onChange={(side) => {
        if (side === active) return;
        const query = from ? `?from=${encodeURIComponent(from)}` : '';
        router.replace(`${ROUTES[side]}${query}` as Href);
      }}
      options={[
        { key: 'login', label: 'Se connecter' },
        { key: 'register', label: 'Créer un compte' },
      ]}
    />
  );
}
