import { Box, Container, Paper, Typography } from '@mui/material';
import { SignInButton } from '@/components/signin-button';

interface SignInPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl || '/dashboard';

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 4,
            width: '100%',
            textAlign: 'center',
          }}
        >
          <Typography variant="h4" component="h1" gutterBottom>
            Auth サービス
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            nagiyu プラットフォームにサインイン
          </Typography>
          <SignInButton callbackUrl={callbackUrl} />
        </Paper>
      </Box>
    </Container>
  );
}
