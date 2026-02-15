'use client';

import { Container, Typography, Box, Button } from '@mui/material';
import NotificationPermissionButton from './NotificationPermissionButton';

interface HomePageClientProps {
  userName?: string;
  isAuthenticated: boolean;
  appUrl: string;
}

export default function HomePageClient({ userName, isAuthenticated, appUrl }: HomePageClientProps) {
  const authUrl = process.env.NEXT_PUBLIC_AUTH_URL;

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
            <Box
              component="span"
              sx={{ display: 'inline-block', mt: 2, mr: 2, '& .MuiButton-root': { ml: 0 } }}
            >
              <NotificationPermissionButton />
            </Box>
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
