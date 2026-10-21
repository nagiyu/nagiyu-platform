'use client';

import { useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { Button } from '@nagiyu/ui';
import { usePushSubscription } from '@nagiyu/react';
import { getCharacterDisplay } from '@/lib/characters/client-profiles';

/**
 * キャラからのプッシュ通知を購読するためのトグル UI。
 * 購読の手続きは `usePushSubscription` に委譲し、ここは表示の出し分けだけを持つ。
 */

const { shortName } = getCharacterDisplay();

export const NOTIFICATION_TOGGLE_MESSAGES = {
  PROMPT: `${shortName}からのお知らせを受け取る`,
  SUBSCRIBED: 'お知らせを受け取る設定になっているよ',
  SUBSCRIBING: '設定中…',
  DENIED: 'ブラウザの設定から通知を許可してね',
  ERROR: '通知の設定に失敗しちゃった。あとでもう一度試してね',
} as const;

export default function NotificationToggle() {
  const { supported, ready, permission, subscribed, loading, error, subscribe } =
    usePushSubscription();

  const handleSubscribe = useCallback(async () => {
    try {
      await subscribe();
    } catch {
      // 失敗の内容は hook の error / permission に反映されるため、ここでは握りつぶす
    }
  }, [subscribe]);

  // 対応状況は client でのみ確定するため、確定するまでと非対応ブラウザでは何も表示しない
  if (!ready || !supported) {
    return null;
  }

  const denied = permission === 'denied';

  if (subscribed) {
    return (
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="body2" color="success.main">
          {NOTIFICATION_TOGGLE_MESSAGES.SUBSCRIBED}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Button
        onClick={handleSubscribe}
        disabled={loading}
        variant="ghost"
        startIcon={<NotificationsActiveIcon fontSize="small" />}
      >
        {loading ? NOTIFICATION_TOGGLE_MESSAGES.SUBSCRIBING : NOTIFICATION_TOGGLE_MESSAGES.PROMPT}
      </Button>
      {denied && (
        <Typography variant="caption" color="text.secondary">
          {NOTIFICATION_TOGGLE_MESSAGES.DENIED}
        </Typography>
      )}
      {error && !denied && (
        <Typography variant="caption" color="error.main" role="alert">
          {NOTIFICATION_TOGGLE_MESSAGES.ERROR}
        </Typography>
      )}
    </Box>
  );
}
