import { auth } from '@nagiyu/auth-core';
import { redirect } from 'next/navigation';
import { hasPermission } from '@nagiyu/common';
import { Box, Container, Typography, Paper, Button } from '@mui/material';
import Link from 'next/link';
import { UsersTable } from './users-table';

export default async function UsersListPage() {
  const session = await auth();

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
          <Button component={Link} href="/dashboard" variant="outlined">
            ダッシュボードに戻る
          </Button>
        </Box>

        <Paper sx={{ p: 3 }}>
          <UsersTable canAssignRoles={hasPermission(session.user.roles, 'roles:assign')} />
        </Paper>
      </Box>
    </Container>
  );
}
