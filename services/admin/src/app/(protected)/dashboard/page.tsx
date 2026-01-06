import { Box, Card, CardContent, Typography, Button, Chip } from '@mui/material';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await getSession();

  // Phase 2: JWT 検証実装後、session が null の場合にリダイレクト
  if (!session) {
    redirect('/');
  }

  const { user } = session;

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h4" component="h1" gutterBottom>
        ダッシュボード
      </Typography>

      {/* ユーザー情報カード */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            ユーザー情報
          </Typography>
          <Typography variant="body1">
            <strong>メールアドレス:</strong> {user.email}
          </Typography>
          <Typography variant="body1" sx={{ mt: 1 }}>
            <strong>ロール:</strong>
          </Typography>
          <Box sx={{ mt: 1 }}>
            {user.roles.map((role) => (
              <Chip key={role} label={role} size="small" sx={{ mr: 1 }} />
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* 認証ステータスカード */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            認証ステータス
          </Typography>
          <Typography variant="body1" color="success.main">
            ✓ Auth サービスとの SSO 連携が正常に動作しています
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            JWT トークンによる認証が有効です
          </Typography>
        </CardContent>
      </Card>

      {/* ログアウトボタン */}
      <Button
        variant="outlined"
        color="primary"
        href={`${process.env.NEXT_PUBLIC_AUTH_URL || ''}/api/auth/signout`}
        sx={{ mt: 2 }}
      >
        ログアウト
      </Button>
    </Box>
  );
}
