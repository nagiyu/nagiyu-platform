'use client';

import { useState } from 'react';
import { Alert } from '@mui/material';
import { Button } from '@nagiyu/ui';
import { usePushSubscription } from '@nagiyu/react';
import { fetchVapidPublicKey, postPushSubscription } from '@nagiyu/browser';

const ERROR_MESSAGES = {
  UNKNOWN: '通知設定中にエラーが発生しました',
} as const;

const SUCCESS_MESSAGE = '通知を有効化しました';

export default function NotifyButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const { loading, subscribe } = usePushSubscription({
    getVapidPublicKey: () => fetchVapidPublicKey('/api/notify/vapid-key'),
    swPath: '/sw-push.js',
    onSubscribed: (subscription) =>
      postPushSubscription(subscription, {
        endpoint: '/api/notify/subscribe',
        bodyShape: 'raw',
      }),
  });

  const handleEnableNotification = async () => {
    setMessage(null);
    setIsError(false);
    try {
      await subscribe();
      setMessage(SUCCESS_MESSAGE);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN);
    }
  };

  return (
    <>
      <Button variant="solid" onClick={handleEnableNotification} loading={loading}>
        通知を有効にする
      </Button>
      {message && (
        <Alert severity={isError ? 'error' : 'success'} sx={{ mt: 2 }}>
          {message}
        </Alert>
      )}
    </>
  );
}
