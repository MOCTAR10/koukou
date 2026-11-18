import React from 'react';

import { Chip } from '@/components/ui/Chip';
import type { OnBehalfMark } from '@/api/types';
import { onBehalfLabel } from '@/poufa/delegated-entry';

/** « Saisi par {agent} ({profil}) » on a record an agent entered on behalf of the farmer; nothing otherwise. */
export function OnBehalfBadge({ record }: { record: OnBehalfMark | null | undefined }) {
  const label = onBehalfLabel(record);
  if (!label) return null;
  return <Chip label={label} tone="amber" />;
}
