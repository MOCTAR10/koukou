import React from 'react';
import { Modal, View } from 'react-native';

import type { BatchWithMetrics } from '@/api/types';
import { semantic } from '@/constants/theme';
import { CareFlow } from './CareFlow';
import { EntryFlow } from './EntryFlow';
import { ProblemFlow } from './ProblemFlow';
import type { SimpleEntryKind } from './simple-logic';

export type FlowKind = SimpleEntryKind | 'vaccin' | 'probleme';

interface Props {
  flow: FlowKind | null;
  band: BatchWithMetrics | null;
  /** Band name to show when the farm has several open bands. */
  bandLabel: string | null;
  onClose: () => void;
}

/** Full-screen host of the simple flows: covers the tab bar, Android back closes it. */
export function SimpleFlowModal({ flow, band, bandLabel, onClose }: Props) {
  const visible = flow != null && band != null;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      {visible ? (
        <View key={flow} style={{ flex: 1, backgroundColor: semantic.bg }}>
          {flow === 'vaccin' ? (
            <CareFlow band={band} onClose={onClose} />
          ) : flow === 'probleme' ? (
            <ProblemFlow band={band} onClose={onClose} />
          ) : (
            <EntryFlow kind={flow} band={band} bandLabel={bandLabel} onClose={onClose} />
          )}
        </View>
      ) : null}
    </Modal>
  );
}
