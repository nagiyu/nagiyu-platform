'use client';

import { useCallback, useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { Button } from '@nagiyu/ui';
import { subscribePush } from '@nagiyu/browser';
import { getCharacterDisplay } from '@/lib/characters/client-profiles';

/**
 * キャラからのプッシュ通知を購読するためのトグル UI。
 *
 * - 初回の通知許可リクエスト → SW 登録 → push 購読 → サーバ登録までを
 *   `subscribePush`（@nagiyu/browser）に委譲する。
 * - 許可済みユーザーの再購読は layout の ServiceWorkerRegistration が担うため、
 *   ここでは「まだ許可していないユーザー」への導線に専念する。
 */

const { shortName } = getCharacterDisplay();

export const NOTIFICATION_TOGGLE_MESSAGES = {
  PROMPT: `${shortName}からのお知らせを受け取る`,
  SUBSCRIBED: 'お知らせを受け取る設定になっているよ',
  SUBSCRIBING: '設定中…',
  DENIED: 'ブラウザの設定から通知を許可してね',
  ERROR: '通知の設定に失敗しちゃった。あとでもう一度試してね',
} as const;

const fetchVapidPublicKey = async (): Promise<string> => {
  const response = await fetch('/api/push/vapid-public-key');
  if (!response.ok) {
    throw new Error('VAPID 公開鍵の取得に失敗しました');
  }
  const { publicKey } = (await response.json()) as { publicKey?: string };
  if (!publicKey) {
    throw new Error('VAPID 公開鍵が空です');
  }
  return publicKey;
};

const postSubscription = async (subscription: PushSubscription): Promise<void> => {
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!response.ok) {
    throw new Error('サブスクリプションの登録に失敗しました');
  }
};

const isPushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.Notification !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

type ToggleState = 'idle' | 'subscribing' | 'subscribed' | 'denied' | 'error';

export default function NotificationToggle() {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<ToggleState>('idle');

  // 対応状況・許可状況は client でのみ確定する（SSR でのハイドレーション差異を避ける）。
  useEffect(() => {
    if (!isPushSupported()) {
      return;
    }
    setSupported(true);
    if (window.Notification.permission === 'granted') {
      setState('subscribed');
    } else if (window.Notification.permission === 'denied') {
      setState('denied');
    }
  }, []);

  const handleSubscribe = useCallback(async () => {
    setState('subscribing');
    try {
      await subscribePush({
        vapidPublicKey: fetchVapidPublicKey,
        onSubscribed: postSubscription,
      });
      setState('subscribed');
    } catch {
      // 許可が拒否された場合と、その他の失敗を区別して案内する
      const denied =
        typeof window !== 'undefined' &&
        typeof window.Notification !== 'undefined' &&
        window.Notification.permission === 'denied';
      setState(denied ? 'denied' : 'error');
    }
  }, []);

  // 非対応ブラウザでは何も表示しない
  if (!supported) {
    return null;
  }

  if (state === 'subscribed') {
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
        disabled={state === 'subscribing'}
        variant="ghost"
        startIcon={<NotificationsActiveIcon fontSize="small" />}
      >
        {state === 'subscribing'
          ? NOTIFICATION_TOGGLE_MESSAGES.SUBSCRIBING
          : NOTIFICATION_TOGGLE_MESSAGES.PROMPT}
      </Button>
      {state === 'denied' && (
        <Typography variant="caption" color="text.secondary">
          {NOTIFICATION_TOGGLE_MESSAGES.DENIED}
        </Typography>
      )}
      {state === 'error' && (
        <Typography variant="caption" color="error.main" role="alert">
          {NOTIFICATION_TOGGLE_MESSAGES.ERROR}
        </Typography>
      )}
    </Box>
  );
}
