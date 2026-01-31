import { signIn, auth } from '@nagiyu/auth-core';
import { Box, Button, Container, Paper, Typography } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { redirect } from 'next/navigation';

interface SignInPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

/**
 * callbackUrl を検証し、安全な URL のみを許可する
 * NextAuth の redirect callback と同じロジックを使用
 */
function validateCallbackUrl(callbackUrl: string, baseUrl: string): string {
  // 同じドメインへのリダイレクトを許可
  if (callbackUrl.startsWith(baseUrl)) {
    return callbackUrl;
  }
  // 相対パスを許可
  if (callbackUrl.startsWith('/')) {
    return callbackUrl;
  }
  // プラットフォーム内のサービス (*.nagiyu.com) へのリダイレクトを許可
  if (callbackUrl.match(/^https?:\/\/[^/]*\.nagiyu\.com/)) {
    return callbackUrl;
  }
  // 外部 URL は拒否して baseUrl にフォールバック
  return '/dashboard';
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const rawCallbackUrl = params.callbackUrl || '/dashboard';
  
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
