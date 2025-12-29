import { Container, Typography, Box, Paper, Button } from '@mui/material';
import { auth, signOut } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect('/signin');
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          ダッシュボード
        </Typography>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            ユーザー情報
          </Typography>

          <Box sx={{ mt: 2 }}>
            <Typography variant="body1">
              <strong>名前:</strong> {session.user.name}
            </Typography>
            <Typography variant="body1">
              <strong>メール:</strong> {session.user.email}
            </Typography>
            <Typography variant="body1">
              <strong>ユーザーID:</strong> {session.user.id}
            </Typography>
            <Typography variant="body1">
              <strong>ロール:</strong> {session.user.roles.join(', ') || 'なし'}
            </Typography>
          </Box>

          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom>
              セッション情報
            </Typography>
            <Paper variant="outlined" sx={{ p: 2, mt: 2, bgcolor: 'grey.100' }}>
              <pre style={{ overflow: 'auto' }}>{JSON.stringify(session, null, 2)}</pre>
            </Paper>
          </Box>

          <Box sx={{ mt: 4 }}>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/signin' });
              }}
            >
              <Button type="submit" variant="outlined" color="error">
                サインアウト
              </Button>
            </form>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}
