import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { BookUp, ClipboardList, PackageOpen } from 'lucide-react-native';

import { Sheet } from '../ui/Sheet';
import { QuickActions } from './QuickActions';
import { DailyEntrySheet } from './DailyEntrySheet';
import { FeedEntrySheet } from './FeedEntrySheet';
import { color } from '@/constants/theme';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { toast } from '../ui/Feedback';

type Mode = 'none' | 'quick' | 'daily' | 'feed';

interface QuickCaptureApi {
  openQuick: () => void;
  openDaily: (batchId?: string) => void;
  openSale: (batchId?: string) => void;
  openFeed: () => void;
}

const QuickCaptureContext = createContext<QuickCaptureApi | null>(null);

export function useQuickCapture(): QuickCaptureApi {
  const ctx = useContext(QuickCaptureContext);
  if (!ctx) throw new Error('useQuickCapture doit être utilisé dans QuickCaptureProvider');
  return ctx;
}

export function QuickCaptureProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { hasPermission, fermiaReadOnly } = useFarmProfile();
  // Read-only profiles (institution, member without the right): the forms do not open (recette A13).
  const canEnter = hasPermission('saisie:creer') && !fermiaReadOnly;
  const canStock = hasPermission('stock:gerer') && !fermiaReadOnly;
  const [mode, setMode] = useState<Mode>('none');
  const [targetBatch, setTargetBatch] = useState<string | undefined>(undefined);
  const [dailySticky, setDailySticky] = useState<React.ReactNode>(undefined);
  const [dailyFooter, setDailyFooter] = useState<React.ReactNode>(undefined);
  const [dailyDirty, setDailyDirty] = useState(false);

  // En quittant le mode « saisie du jour », on ne laisse pas trainer son pied de page.
  useEffect(() => {
    if (mode !== 'daily') setDailyFooter(undefined);
  }, [mode]);

  const close = () => setMode('none');

  const api = useMemo<QuickCaptureApi>(
    () => ({
      openQuick: () => setMode('quick'),
      openDaily: (batchId) => {
        if (!canEnter) {
          toast.error('Votre profil est en consultation seule : saisie non autorisée.');
          return;
        }
        setTargetBatch(batchId);
        setMode('daily');
      },
      openSale: (batchId) => {
        setMode('none');
        router.push({ pathname: '/pos', params: batchId ? { batch: batchId } : {} });
      },
      openFeed: () => {
        if (!canStock) {
          toast.error('Votre profil est en consultation seule : entrée de provende non autorisée.');
          return;
        }
        setTargetBatch(undefined);
        setMode('feed');
      },
    }),
    [router, canEnter, canStock],
  );

  const titles: Record<Exclude<Mode, 'none'>, { title: string; subtitle: string; icon: React.ReactNode }> = {
    quick: { title: 'Nouvelle capture', subtitle: 'Choisissez une action', icon: <BookUp size={22} color={color.brand[600]} /> },
    daily: { title: 'Saisie du jour', subtitle: 'Tout sur un écran · analyses en direct', icon: <ClipboardList size={22} color={color.brand[600]} /> },
    feed: { title: 'Entrée de provende', subtitle: 'Nouveau lot HACCP', icon: <PackageOpen size={22} color={color.ink[600]} /> },
  };

  const meta = mode === 'none' ? null : titles[mode];

  const maybeOpenFeed = () => {
    setTargetBatch(undefined);
    setMode('feed');
  };

  return (
    <QuickCaptureContext.Provider value={api}>
      {children}
      <Sheet
        visible={mode !== 'none'}
        onClose={close}
        dirty={mode === 'daily' && dailyDirty}
        title={meta?.title}
        subtitle={meta?.subtitle}
        icon={meta?.icon}
        stickyHeader={dailySticky}
        footer={dailyFooter}>
        {mode === 'quick' && (
          <QuickActions
            onPick={(key) => {
              if (key === 'saisie') { if (canEnter) setMode('daily'); else toast.error('Votre profil est en consultation seule : saisie non autorisée.'); return; }
              if (key === 'vente') { close(); router.push('/pos'); return; }
              if (key === 'soin') { close(); router.push('/sanitary'); return; }
              if (key === 'caisse') { close(); router.push('/pos?tab=CAISSE'); return; }
              if (key === 'rapports') { close(); router.push('/rapports'); return; }
              maybeOpenFeed();
            }}
          />
        )}
        {mode === 'daily' && <DailyEntrySheet initialBatchId={targetBatch} onClose={close} onStickyChange={setDailySticky} onFooterChange={setDailyFooter} onDirtyChange={setDailyDirty} />}
        {mode === 'feed' && <FeedEntrySheet onClose={close} />}
      </Sheet>
    </QuickCaptureContext.Provider>
  );
}