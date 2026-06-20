'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Container, Typography, Box } from '@mui/material';
import { Button } from '@nagiyu/ui';
import { usePushSubscription } from '@nagiyu/react';
import { fetchVapidPublicKey } from '@nagiyu/browser';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationPermissionDialog from './NotificationPermissionButton';

interface HomePageClientProps {
  userName?: string;
  isAuthenticated: boolean;
  appUrl: string;
  /** サインイン URL のベース（サーバーコンポーネントでランタイム env を解決して渡す） */
  authUrl: string;
}

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

export default function HomePageClient({
  userName,
  isAuthenticated,
  appUrl,
  authUrl,
}: HomePageClientProps) {
  const [openNotificationDialog, setOpenNotificationDialog] = useState(false);
  const canUseNotificationApi = typeof window !== 'undefined' && 'Notification' in window;

  const { subscribed, subscribe } = usePushSubscription({
    getVapidPublicKey: fetchVapidPublicKey,
    onSubscribed: postSubscription,
  });

  const handleOpenNotificationDialog = () => {
    setOpenNotificationDialog(true);
  };

  const handleCloseNotificationDialog = () => {
    setOpenNotificationDialog(false);
  };

  const handleRequestNotificationPermission = async () => {
    try {
      await subscribe();
      alert('通知が有効になりました！');
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
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          ニコニコ動画のマイリスト登録を自動化する補助ツールです。
        </Typography>
        {isAuthenticated ? (
          <Box sx={{ mt: 3, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            <Typography variant="body1" gutterBottom sx={{ width: '100%' }}>
              ようこそ、{userName} さん
            </Typography>
            <Button asChild variant="solid" color="primary">
              <Link href="/mylist/register">マイリスト登録</Link>
            </Button>
            <Button asChild variant="outline" color="primary">
              <Link href="/import">動画インポート</Link>
            </Button>
            <Button asChild variant="outline" color="primary">
              <Link href="/mylist">動画管理</Link>
            </Button>
            {canUseNotificationApi && (
              <>
                <Button
                  variant="outline"
                  startIcon={<NotificationsIcon />}
                  onClick={handleOpenNotificationDialog}
                >
                  通知設定
                </Button>
                <NotificationPermissionDialog
                  open={openNotificationDialog}
                  isSubscribed={subscribed}
                  onClose={handleCloseNotificationDialog}
                  onRequestPermission={handleRequestNotificationPermission}
                />
              </>
            )}
          </Box>
        ) : (
          <Box sx={{ mt: 3 }}>
            <Typography variant="body1" sx={{ mb: 2 }}>
              このサービスを利用するには、ログインが必要です。
            </Typography>
            <Button asChild variant="solid" color="primary" size="lg">
              <a href={`${authUrl}/signin?callbackUrl=${encodeURIComponent(appUrl)}`}>ログイン</a>
            </Button>
          </Box>
        )}
      </Box>
    </Container>
  );
}
