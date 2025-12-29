'use client';

import { Container, Typography, Button, Box, Paper } from '@mui/material';
import ErrorIcon from '@mui/icons-material/Error';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const errorMessages: Record<string, string> = {
    Configuration: '認証の設定に問題があります。管理者にお問い合わせください。',
    AccessDenied: 'アクセスが拒否されました。',
    Verification: '認証に失敗しました。もう一度お試しください。',
    Default: '認証中にエラーが発生しました。もう一度お試しください。',
  };

  const errorMessage = error
    ? errorMessages[error] || errorMessages.Default
    : errorMessages.Default;

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Paper elevation={3} sx={{ p: 4, textAlign: 'center' }}>
        <Box sx={{ mb: 3 }}>
          <ErrorIcon sx={{ fontSize: 64, color: 'error.main' }} />
        </Box>

        <Typography variant="h4" component="h1" gutterBottom>
          認証エラー
        </Typography>

        <Typography variant="body1" color="text.secondary" sx={{ mt: 3, mb: 4 }}>
          {errorMessage}
        </Typography>

        {error && (
          <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 4 }}>
            エラーコード: {error}
          </Typography>
        )}

        <Button variant="contained" href="/signin">
          サインインページへ戻る
        </Button>
      </Paper>
    </Container>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <Container maxWidth="sm" sx={{ py: 8 }}>
          <Paper elevation={3} sx={{ p: 4, textAlign: 'center' }}>
            <Typography>読み込み中...</Typography>
          </Paper>
        </Container>
      }
    >
      <AuthErrorContent />
    </Suspense>
  );
}
