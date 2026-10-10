'use client';

import { useCallback } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { Button } from '@nagiyu/ui';
import { usePushSubscription } from '@nagiyu/react';
import { snoozeNotificationPermission } from '@/lib/pwa/standalone';
import { PWA_MESSAGES } from '@/lib/pwa/messages';

export interface NotificationPermissionProps {
  onGranted: () => void;
  onSkip: () => void;
}

export default function NotificationPermission({ onGranted, onSkip }: NotificationPermissionProps) {
  const { permission, loading, error, subscribe } = usePushSubscription();

  const handleSubscribe = useCallback(async () => {
    try {
      await subscribe();
    } catch {
      // 失敗の内容は hook の error / permission に反映されるため、ここでは握りつぶす
      return;
    }
    onGranted();
  }, [subscribe, onGranted]);

  const handleSkip = useCallback(() => {
    snoozeNotificationPermission();
    onSkip();
  }, [onSkip]);

  const denied = Boolean(error) && permission === 'denied';

  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Button
        variant="solid"
        onClick={handleSubscribe}
        loading={loading}
        startIcon={<NotificationsActiveIcon fontSize="small" />}
      >
        {PWA_MESSAGES.NOTIFICATION_BUTTON}
      </Button>
      {denied && (
        <Typography variant="caption" color="text.secondary">
          {PWA_MESSAGES.NOTIFICATION_DENIED_HINT}
        </Typography>
      )}
      {error && !denied && (
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
