'use client';

import { useState } from 'react';
import { Container, Typography, Box, Button } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationPermissionDialog from './NotificationPermissionButton';
import { urlBase64ToUint8Array } from '@/lib/utils/push';

interface HomePageClientProps {
  userName?: string;
  isAuthenticated: boolean;
  appUrl: string;
}

export default function HomePageClient({ userName, isAuthenticated, appUrl }: HomePageClientProps) {
  const authUrl = process.env.NEXT_PUBLIC_AUTH_URL;
  const [openNotificationDialog, setOpenNotificationDialog] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const canUseNotificationApi = typeof window !== 'undefined' && 'Notification' in window;

  const handleOpenNotificationDialog = async () => {
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
    setOpenNotificationDialog(true);
  };

  const handleCloseNotificationDialog = () => {
    setOpenNotificationDialog(false);
  };

  const handleRequestNotificationPermission = async () => {
    try {
      if (
        !('Notification' in window) ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window)
      ) {
        throw new Error('この環境ではプッシュ通知を利用できません');
      }

      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        alert('通知の許可が必要です');
        return;
      }

      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await navigator.serviceWorker.register('/sw.js');
      }
      if (!registration.active) {
        registration = await navigator.serviceWorker.ready;
      }

      const vapidResponse = await fetch('/api/push/vapid-public-key');
      if (!vapidResponse.ok) {
        throw new Error('VAPID公開鍵の取得に失敗しました');
      }
      const { publicKey } = await vapidResponse.json();

      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        }));

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

    handleCloseNotificationDialog();
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          niconico-mylist-assistant
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          ニコニコ動画のマイリスト登録を自動化する補助ツールです。
        </Typography>
        {isAuthenticated ? (
          <Box sx={{ mt: 3 }}>
            <Typography variant="body1" gutterBottom>
              ようこそ、{userName} さん
            </Typography>
            <Button href="/register" variant="contained" color="primary" sx={{ mt: 2, mr: 2 }}>
              マイリスト登録
            </Button>
            <Button href="/import" variant="outlined" color="primary" sx={{ mt: 2, mr: 2 }}>
              動画インポート
            </Button>
            <Button href="/mylist" variant="outlined" color="primary" sx={{ mt: 2, mr: 2 }}>
              動画管理
            </Button>
            {canUseNotificationApi && (
              <>
                <Button
                  variant="outlined"
                  startIcon={<NotificationsIcon />}
                  onClick={handleOpenNotificationDialog}
                  sx={{ mt: 2, mr: 2 }}
                >
                  通知設定
                </Button>
                <NotificationPermissionDialog
                  open={openNotificationDialog}
                  isSubscribed={isSubscribed}
                  onClose={handleCloseNotificationDialog}
                  onRequestPermission={handleRequestNotificationPermission}
                />
              </>
            )}
          </Box>
        ) : (
          <Box sx={{ mt: 3 }}>
            <Typography variant="body1" paragraph>
              このサービスを利用するには、ログインが必要です。
            </Typography>
            <Button
              href={`${authUrl}/signin?callbackUrl=${encodeURIComponent(appUrl)}`}
              variant="contained"
              color="primary"
              size="large"
            >
              ログイン
            </Button>
          </Box>
        )}
      </Box>
    </Container>
  );
}
