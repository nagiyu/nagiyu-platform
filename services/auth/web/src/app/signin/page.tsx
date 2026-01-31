import { signIn, auth } from '@nagiyu/auth-core';
import { Box, Button, Container, Paper, Typography } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { redirect } from 'next/navigation';
import { validateCallbackUrl, DEFAULT_CALLBACK_URL } from '@/lib/validate-callback-url';

interface SignInPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const rawCallbackUrl = params.callbackUrl || DEFAULT_CALLBACK_URL;
  
  // callbackUrl を検証
  const baseUrl = process.env.NEXTAUTH_URL || 'https://dev-auth.nagiyu.com';
  const callbackUrl = validateCallbackUrl(rawCallbackUrl, baseUrl);

  // 既に認証済みの場合は callbackUrl にリダイレクト
  const session = await auth();
  if (session) {
    redirect(callbackUrl);
  }

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
          <form
            action={async () => {
              'use server';
              await signIn('google', {
                redirectTo: callbackUrl,
              });
            }}
          >
            <Button
              type="submit"
              variant="contained"
              size="large"
              startIcon={<GoogleIcon />}
              fullWidth
            >
              Google でサインイン
            </Button>
          </form>
        </Paper>
      </Box>
    </Container>
  );
}
