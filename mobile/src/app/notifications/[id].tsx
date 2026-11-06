import React, { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { errorMessage } from '@/components/ui/Feedback';
import { useMarkRead, useOpenNotification } from '@/components/notifications/useInbox';

/**
 * Target of a push (`data.route = /notifications/<id>`): reads the in-app
 * notification (stops its escalation), then replaces itself with the screen
 * of the notification. A failure leaves the user on the inbox.
 */
export default function NotificationRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const markRead = useMarkRead();
  const open = useOpenNotification();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!id || started.current) return;
    started.current = true;
    markRead(id)
      .then((item) => open(item, 'replace'))
      .catch((e) => setError(errorMessage(e)));
  }, [id, markRead, open]);

  return (
    <Screen header={<ScreenHeader title="Notification" back />}>
      {error ? (
        <Card style={{ gap: 10 }}>
          <AppText size="body" color="danger">
            {error}
          </AppText>
          <Button label="Voir toutes les notifications" onPress={() => router.replace('/notifications' as never)} />
        </Card>
      ) : (
        <Spinner label="Ouverture de la notification…" />
      )}
    </Screen>
  );
}
