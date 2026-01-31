import { Container, Typography, Box, Button } from '@mui/material';
import Link from 'next/link';
import { auth } from '@/auth';

export default async function Home() {
  const session = await auth();

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          niconico-mylist-assistant
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          ニコニコ動画のマイリスト登録を自動化する補助ツールです。
        </Typography>
        {session ? (
          <Box sx={{ mt: 3 }}>
            <Typography variant="body1" gutterBottom>
              ようこそ、{session.user.name} さん
            </Typography>
            <Button
              component={Link}
              href="/register"
              variant="contained"
              color="primary"
              sx={{ mt: 2, mr: 2 }}
            >
              マイリスト登録
            </Button>
            <Button
              component={Link}
              href="/import"
              variant="outlined"
              color="primary"
              sx={{ mt: 2, mr: 2 }}
            >
              動画インポート
            </Button>
            <Button
              component={Link}
              href="/mylist"
              variant="outlined"
              color="primary"
              sx={{ mt: 2 }}
            >
              動画管理
            </Button>
          </Box>
        ) : (
          <Box sx={{ mt: 3 }}>
            <Typography variant="body1" paragraph>
              このサービスを利用するには、ログインが必要です。
            </Typography>
            <Button
              component={Link}
              href={`${process.env.NEXT_PUBLIC_AUTH_URL}/signin?callbackUrl=${encodeURIComponent(process.env.APP_URL || 'http://localhost:3000')}/register`}
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
