import React from 'react';

import { BuyerOrdersView } from '@/components/market/BuyerOrdersView';

/** What a farm account has bought. A buyer has this as a tab. */
export default function MyPurchasesScreen() {
  return <BuyerOrdersView back />;
}
