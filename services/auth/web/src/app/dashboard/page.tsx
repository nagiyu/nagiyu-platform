import { redirect } from 'next/navigation';
import { hasPermission } from '@nagiyu/common';
import { Box, Container, Paper, Typography, Card, CardContent } from '@mui/material';
import { Button, Chip } from '@nagiyu/ui';
import Link from 'next/link';
import { getSession } from '@/lib/auth/session';

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect('/signin');
  }

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          ダッシュボード
        </Typography>

        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              ユーザー情報
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Typography variant="body1">
                <strong>名前:</strong> {session.user.name}
              </Typography>
              <Typography variant="body1" sx={{ mt: 1 }}>
                <strong>メール:</strong> {session.user.email}
              </Typography>
              <Typography variant="body1" sx={{ mt: 1 }}>
                <strong>ユーザーID:</strong> {session.user.id}
              </Typography>
              <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                <Typography variant="body1" component="span">
                  <strong>ロール:</strong>
                </Typography>
                {session.user.roles.length > 0 ? (
                  session.user.roles.map((role: string) => (
                    <Chip key={role} size="sm">
                      {role}
                    </Chip>
                  ))
                ) : (
                  <Chip size="sm">なし</Chip>
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>

        {hasPermission(session.user.roles, 'users:read') && (
          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                管理機能
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Button asChild variant="solid">
                  <Link href="/dashboard/users">ユーザー管理</Link>
                </Button>
              </Box>
            </CardContent>
          </Card>
        )}

        {process.env.NODE_ENV === 'development' && (
          <Paper sx={{ mt: 3, p: 2, bgcolor: 'grey.100' }}>
            <Typography variant="h6" gutterBottom>
              セッション情報 (デバッグ用)
            </Typography>
            <Box
              component="pre"
              sx={{
                overflow: 'auto',
                fontSize: '0.875rem',
                bgcolor: 'background.paper',
                p: 2,
                borderRadius: 1,
              }}
            >
              {JSON.stringify(session, null, 2)}
            </Box>
          </Paper>
        )}
      </Box>
    </Container>
  );
}
