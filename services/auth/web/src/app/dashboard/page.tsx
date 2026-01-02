import { auth } from '@nagiyu/auth-core';
import { redirect } from 'next/navigation';
import { Box, Container, Paper, Typography, Card, CardContent, Chip } from '@mui/material';

export default async function DashboardPage() {
  const session = await auth();

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
              <Box sx={{ mt: 2 }}>
                <Typography variant="body1" component="span" sx={{ mr: 1 }}>
                  <strong>ロール:</strong>
                </Typography>
                {session.user.roles.length > 0 ? (
                  session.user.roles.map((role) => (
                    <Chip key={role} label={role} size="small" sx={{ mr: 1 }} />
                  ))
                ) : (
                  <Chip label="なし" size="small" color="default" />
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>

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
