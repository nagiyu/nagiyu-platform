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

  const handleOpen = () => {
    // 既に通知許可が得られているかチェック
    if ('Notification' in window && Notification.permission === 'granted') {
      setIsSubscribed(true);
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleRequestPermission = async () => {
    try {
      // 通知許可をリクエスト
      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        alert('通知の許可が必要です');
        return;
      }

      // Service Worker を取得
      const registration = await navigator.serviceWorker.ready;

      // VAPID 公開鍵を取得
      const vapidResponse = await fetch('/api/push/vapid-public-key');
      if (!vapidResponse.ok) {
        throw new Error('VAPID公開鍵の取得に失敗しました');
      }
      const { publicKey } = await vapidResponse.json();

      // Push 通知をサブスクライブ
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

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
      alert('通知の有効化に失敗しました');
    }

    handleClose();
  };

  // ブラウザが通知をサポートしていない場合は何も表示しない
  if (!('Notification' in window)) {
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
