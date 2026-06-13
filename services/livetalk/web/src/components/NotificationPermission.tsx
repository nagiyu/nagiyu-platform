'use client';

import { useCallback, useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { Button } from '@nagiyu/ui';
import { subscribePush, fetchVapidPublicKey } from '@nagiyu/browser';
import { snoozeNotificationPermission } from '@/lib/pwa/standalone';
import { PWA_MESSAGES } from '@/lib/pwa/messages';

const postSubscription = async (subscription: PushSubscription): Promise<void> => {
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!response.ok) throw new Error('サブスクリプションの登録に失敗しました');
};

export interface NotificationPermissionProps {
  onGranted: () => void;
  onSkip: () => void;
}

type PermissionState = 'idle' | 'subscribing' | 'denied' | 'error';

export default function NotificationPermission({ onGranted, onSkip }: NotificationPermissionProps) {
  const [state, setState] = useState<PermissionState>('idle');

  const handleSubscribe = useCallback(async () => {
    setState('subscribing');
    try {
      await subscribePush({
        vapidPublicKey: fetchVapidPublicKey,
        onSubscribed: postSubscription,
      });
      onGranted();
    } catch {
      const denied =
        typeof window !== 'undefined' &&
        typeof window.Notification !== 'undefined' &&
        window.Notification.permission === 'denied';
      setState(denied ? 'denied' : 'error');
    }
  }, [onGranted]);

  const handleSkip = useCallback(() => {
    snoozeNotificationPermission();
    onSkip();
  }, [onSkip]);

  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Button
        variant="solid"
        onClick={handleSubscribe}
        loading={state === 'subscribing'}
        startIcon={<NotificationsActiveIcon fontSize="small" />}
      >
        {PWA_MESSAGES.NOTIFICATION_BUTTON}
      </Button>
      {state === 'denied' && (
        <Typography variant="caption" color="text.secondary">
          {PWA_MESSAGES.NOTIFICATION_DENIED_HINT}
        </Typography>
      )}
      {state === 'error' && (
        <Typography variant="caption" color="error.main" role="alert">
          {PWA_MESSAGES.NOTIFICATION_ERROR}
        </Typography>
      )}
      <Box sx={{ textAlign: 'center' }}>
        <Button variant="ghost" size="sm" onClick={handleSkip}>
          {PWA_MESSAGES.SKIP}
        </Button>
      </Box>
    </Paper>
  );
}
