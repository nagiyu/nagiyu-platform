import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth, signIn } from '@/lib/auth/auth';
import { SIGNED_IN_FALLBACK_PATH, resolveSignedInDestination } from '@/lib/callback-url';
import { resolveBaseUrl } from '@/lib/signout';
import { Box, Container, Paper, Typography } from '@mui/material';
import { Button } from '@nagiyu/ui';
import GoogleIcon from '@mui/icons-material/Google';

interface SignInPageProps {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}

/** 同じキーを重ねて配列になった値は、どれを採るかが決まらないため、無いものとして扱う */
function singleValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const rawCallbackUrl = singleValue(params.callbackUrl);

  // getSession() は SKIP_AUTH_CHECK のとき常にテストユーザーを返すため、使うと E2E と撮影で
  // サインイン画面が必ず移ってしまう。実の Cookie が無いときは null になる auth() を直接使う
  const session = await auth();
  if (session?.user) {
    // 画面からの redirect() は next-auth の redirect コールバックを通らないため、ここで検証する
    const baseUrl = resolveBaseUrl(await headers());
    redirect(resolveSignedInDestination(rawCallbackUrl, baseUrl));
  }

  const callbackUrl = rawCallbackUrl || SIGNED_IN_FALLBACK_PATH;

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
            <Box sx={{ '& > button': { width: '100%' } }}>
              <Button type="submit" variant="solid" size="lg" startIcon={<GoogleIcon />}>
                Google でサインイン
              </Button>
            </Box>
          </form>
        </Paper>
      </Box>
    </Container>
  );
}
