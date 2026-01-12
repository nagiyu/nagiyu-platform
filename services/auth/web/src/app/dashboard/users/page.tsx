import { redirect } from 'next/navigation';
import { hasPermission } from '@nagiyu/common';
import { Box, Container, Typography, Paper, Button } from '@mui/material';
import Link from 'next/link';
import { UsersTable } from './users-table';
import { getSession } from '@/lib/auth/session';

export default async function UsersListPage() {
  const session = await getSession();

  if (!session) {
    redirect('/signin');
  }

  // users:read 権限がない場合はダッシュボードにリダイレクト
  if (!hasPermission(session.user.roles, 'users:read')) {
    redirect('/dashboard');
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" component="h1">
            ユーザー管理
          </Typography>
          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <Button variant="outlined">ダッシュボードに戻る</Button>
          </Link>
        </Box>

        <Paper sx={{ p: 3 }}>
          <UsersTable canAssignRoles={hasPermission(session.user.roles, 'roles:assign')} />
        </Paper>
      </Box>
    </Container>
  );
}
