import { Container, Typography } from '@mui/material';
import { getSession } from '@/lib/auth/session';

export default async function HomePage() {
  const session = await getSession();

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        管理画面
      </Typography>

      {session && (
        <Typography variant="body1" sx={{ mt: 2 }}>
          ようこそ、{session.user.email} さん
        </Typography>
      )}
    </Container>
  );
}
