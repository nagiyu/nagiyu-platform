import { redirect } from 'next/navigation';
import { hasPermission } from '@nagiyu/common';
import { Box, Container, Typography, Paper } from '@mui/material';
import { AccessDeniedView, Button } from '@nagiyu/ui';
import Link from 'next/link';
import { UsersTable } from './users-table';
import { getSession } from '@/lib/auth/session';

export default async function UsersListPage() {
  const session = await getSession();

  if (!session) {
    redirect('/signin');
  }

  // users:read 権限がない場合は URL を変えずに権限なし画面を表示する。
  // auth 自身が auth サービスのため authUrl は空文字とし、/refresh 等を同一オリジンの相対 URL にする。
  if (!hasPermission(session.user.roles, 'users:read')) {
    return <AccessDeniedView authUrl="" />;
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" component="h1">
            ユーザー管理
          </Typography>
          <Button asChild variant="outline">
            <Link href="/dashboard">ダッシュボードに戻る</Link>
          </Button>
        </Box>

        <Paper sx={{ p: 3 }}>
          <UsersTable canAssignRoles={hasPermission(session.user.roles, 'roles:assign')} />
        </Paper>
      </Box>
    </Container>
  );
}
