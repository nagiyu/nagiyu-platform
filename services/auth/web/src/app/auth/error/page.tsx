'use client';

import { useSearchParams } from 'next/navigation';
import { Box, Container, Paper, Typography, Button } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import Link from 'next/link';
import { Suspense } from 'react';

const ERROR_MESSAGES: Record<string, string> = {
  Configuration: 'サーバー設定に問題があります。管理者にお問い合わせください。',
  AccessDenied: 'アクセスが拒否されました。',
  Verification: '認証トークンの有効期限が切れています。',
  Default: '認証中にエラーが発生しました。もう一度お試しください。',
};

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const errorMessage = ERROR_MESSAGES[error || ''] || ERROR_MESSAGES.Default;

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
          <ErrorOutlineIcon color="error" sx={{ fontSize: 60, mb: 2 }} />
          <Typography variant="h5" component="h1" gutterBottom>
            認証エラー
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            {errorMessage}
          </Typography>
          <Link href="/signin" style={{ textDecoration: 'none' }}>
            <Button variant="contained" size="large">
              サインインページへ戻る
            </Button>
          </Link>
        </Paper>
      </Box>
    </Container>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <ErrorContent />
    </Suspense>
  );
}
