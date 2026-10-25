'use client';

import { useSearchParams } from 'next/navigation';
import { Box, Container, Paper, Typography } from '@mui/material';
import { Button } from '@nagiyu/ui';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import Link from 'next/link';
import { Suspense } from 'react';
import { resolveAuthErrorMessage } from '@/lib/auth-error-message';

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const errorMessage = resolveAuthErrorMessage(error);

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
            <Button variant="solid" size="lg">
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
