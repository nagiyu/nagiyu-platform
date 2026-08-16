import { Card, CardContent, Typography } from '@mui/material';
import { Button } from '@nagiyu/ui';
import Link from 'next/link';
import NotifyButton from '@/components/notify/NotifyButton';

interface DashboardRoleCardsProps {
  canManageNotifications: boolean;
  canReadErrors: boolean;
}

/**
 * ダッシュボードのロール条件付きカード（通知設定・エラー履歴）。
 *
 * 権限判定は page.tsx（Server Component）側に寄せ、このコンポーネントは
 * その判定結果（boolean）だけを props で受け取って表示を出し分ける。
 * docs/development/testing.md の「権限判定をサーバー側へ寄せ、結果を props で渡す」
 * 推奨に沿った設計であり、hasPermission はこのコンポーネントからは呼ばない。
 */
export default function DashboardRoleCards({
  canManageNotifications,
  canReadErrors,
}: DashboardRoleCardsProps) {
  return (
    <>
      {canManageNotifications && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              通知設定
            </Typography>
            <NotifyButton />
          </CardContent>
        </Card>
      )}

      {canReadErrors && (
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
    </>
  );
}
