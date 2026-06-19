import { Box, Card, CardContent, Typography } from '@mui/material';
import { Button, Chip } from '@nagiyu/ui';
import { hasPermission } from '@nagiyu/common';
import { getSession } from '@/lib/auth/session';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import NotifyButton from '@/components/notify/NotifyButton';

export default async function DashboardPage() {
  const session = await getSession();

  // 通常は middleware が未認証時に Auth サービスの /signin へリダイレクトするが、
  // フォールバックとして同等のリダイレクトを行う
  if (!session) {
    const authUrl = process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXTAUTH_URL || '';
    redirect(`${authUrl}/signin`);
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
          <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {user.roles.map((role) => (
              <Chip key={role} size="sm" data-testid="user-role">
                {role}
              </Chip>
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

      {hasPermission(user.roles, 'notifications:write') && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              通知設定
            </Typography>
            <NotifyButton />
          </CardContent>
        </Card>
      )}

      {hasPermission(user.roles, 'errors:read') && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              エラー履歴
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              プラットフォーム上で発生したエラー通知の履歴を確認できます
            </Typography>
            <Button asChild variant="solid">
              <Link href="/errors">エラー履歴を表示</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ログアウトボタン */}
      {/* callbackUrl を付与してサインアウト後に admin へ戻れるようにする。
          server component のため @nagiyu/ui の barrel import を避け、インライン展開を採用。
          APP_URL が未設定の場合は callbackUrl を付与しないフォールバック。 */}
      <Button asChild variant="outline" color="primary">
        <a
          href={
            process.env.APP_URL
              ? `${process.env.NEXT_PUBLIC_AUTH_URL || ''}/api/auth/signout?callbackUrl=${encodeURIComponent(process.env.APP_URL)}`
              : `${process.env.NEXT_PUBLIC_AUTH_URL || ''}/api/auth/signout`
          }
        >
          ログアウト
        </a>
      </Button>
    </Box>
  );
}
