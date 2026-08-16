import { Card, CardContent, Typography } from '@mui/material';
import { Button } from '@nagiyu/ui';
import { hasPermission } from '@nagiyu/common';
import Link from 'next/link';
import NotifyButton from '@/components/notify/NotifyButton';

interface DashboardRoleCardsProps {
  roles: string[];
}

/**
 * ダッシュボードのロール条件付きカード（通知設定・エラー履歴）。
 *
 * `page.tsx`（Server Component）から抽出したロール分岐を、このコンポーネントに閉じる。
 * `hasPermission` の呼び出しはここに限定し、page.tsx 側からは import しない。
 */
export default function DashboardRoleCards({ roles }: DashboardRoleCardsProps) {
  return (
    <>
      {hasPermission(roles, 'notifications:write') && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              通知設定
            </Typography>
            <NotifyButton />
          </CardContent>
        </Card>
      )}

      {hasPermission(roles, 'errors:read') && (
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
