import React from 'react';
import { Redirect } from 'expo-router';

/**
 * The notification inbox now lives in the « Historique » tab of the single
 * notifications screen; this route stays so old links and push taps work.
 */
export default function NotificationsScreen() {
  return <Redirect href="/alerts?tab=historique" />;
}
