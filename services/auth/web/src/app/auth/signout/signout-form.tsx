'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCsrfToken } from 'next-auth/react';
import { Box, Container, Paper, Typography } from '@mui/material';
import { Button } from '@nagiyu/ui';

export const ERROR_MESSAGES = {
  CSRF_TOKEN_FETCH_FAILED:
    'サインアウトの準備に失敗しました。ページを再読み込みしてもう一度お試しください。',
} as const;

/** next-auth のサインアウトを受け付けるエンドポイント */
const SIGN_OUT_ACTION = '/api/auth/signout';

interface SignOutFormProps {
  /** キャンセル時の戻り先。サーバー側で検証済みの値を受け取る */
  cancelUrl: string;
}

/**
 * サインアウトの確認フォーム。
 *
 * next-auth のサインアウトは CSRF トークン付きの POST でしか受け付けないため、
 * 既定画面と同じくネイティブの form 送信にする。
 * callbackUrl は form に載せず、next-auth が Cookie に保持する検証済みの値を使わせる。
 */
export default function SignOutForm({ cancelUrl }: SignOutFormProps) {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    getCsrfToken()
      .then((token) => {
        if (token) {
          setCsrfToken(token);
        } else {
          setHasError(true);
        }
      })
      .catch(() => setHasError(true));
  }, []);

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
          <Typography variant="h5" component="h1" gutterBottom>
            サインアウト
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            サインアウトしますか?
          </Typography>
          {hasError && (
            <Typography variant="body2" color="error" role="alert" sx={{ mb: 2 }}>
              {ERROR_MESSAGES.CSRF_TOKEN_FETCH_FAILED}
            </Typography>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <form method="post" action={SIGN_OUT_ACTION}>
              <input type="hidden" name="csrfToken" value={csrfToken ?? ''} />
              <Box sx={{ '& > button': { width: '100%' } }}>
                <Button type="submit" variant="solid" size="lg" disabled={!csrfToken}>
                  サインアウト
                </Button>
              </Box>
            </form>
            <Button asChild variant="outline" size="lg">
              <Link href={cancelUrl}>キャンセル</Link>
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}
