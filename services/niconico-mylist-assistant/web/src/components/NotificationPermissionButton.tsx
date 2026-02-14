'use client';

import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { urlBase64ToUint8Array } from '@/lib/utils/push';

/**
 * 通知許可を求める UI コンポーネント
 *
 * ユーザーに通知許可をリクエストし、サブスクリプションを作成する
 */
export default function NotificationPermissionButton() {
  const [open, setOpen] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const handleOpen = async () => {
    // 既に通知許可とサブスクリプションが得られているかチェック
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.ready;
          const existingSubscription = await registration.pushManager.getSubscription();
          setIsSubscribed(Boolean(existingSubscription));
        }
      } catch (error) {
        console.error('通知購読状態の確認に失敗しました:', error);
        setIsSubscribed(false);
      }
    } else {
      setIsSubscribed(false);
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleRequestPermission = async () => {
    try {
      if (
        !('Notification' in window) ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window)
      ) {
        throw new Error('この環境ではプッシュ通知を利用できません');
      }

      // 通知許可をリクエスト
      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        alert('通知の許可が必要です');
        return;
      }

      // Service Worker を取得
      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await navigator.serviceWorker.register('/sw.js');
      }
      if (!registration.active) {
        registration = await navigator.serviceWorker.ready;
      }

      // VAPID 公開鍵を取得
      const vapidResponse = await fetch('/api/push/vapid-public-key');
      if (!vapidResponse.ok) {
        throw new Error('VAPID公開鍵の取得に失敗しました');
      }
      const { publicKey } = await vapidResponse.json();

      // Push 通知をサブスクライブ（既存があれば再利用）
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        }));

      // サーバーにサブスクリプション情報を送信
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      if (response.ok) {
        setIsSubscribed(true);
        alert('通知が有効になりました！');
      } else {
        throw new Error('サブスクリプションの登録に失敗しました');
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      const detail = error instanceof Error ? `: ${error.message}` : '';
      alert(`通知の有効化に失敗しました${detail}`);
    }

    handleClose();
  };

  // ブラウザが通知をサポートしていない場合は何も表示しない
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return null;
  }

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<NotificationsIcon />}
        onClick={handleOpen}
        sx={{ ml: 2 }}
      >
        通知設定
      </Button>

      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>バッチ完了通知</DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            マイリスト登録バッチが完了したときに通知を受け取ることができます。
          </Typography>
          {isSubscribed ? (
            <Typography variant="body2" color="success.main" sx={{ mt: 2 }}>
              ✓ 通知は既に有効になっています
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              通知を有効にするには、ブラウザの許可が必要です。
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>キャンセル</Button>
          {!isSubscribed && (
            <Button onClick={handleRequestPermission} variant="contained">
              通知を有効にする
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
