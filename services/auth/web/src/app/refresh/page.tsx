'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Box, Container, CircularProgress, Typography } from '@mui/material';
import SessionProviderWrapper from '../../components/SessionProviderWrapper';
import { resolveRefreshCallbackUrl } from '../../lib/refresh-callback';
import { navigateTo } from '../../lib/navigate';

/**
 * アクセス権限のリフレッシュを行う内部コンポーネント。
 * useSession の update() を呼んで jwt callback を trigger:'update' で起動し、
 * ロールを強制再取得したうえで callbackUrl へリダイレクトする。
 */
function RefreshContent() {
  const { update } = useSession();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'refreshing' | 'done' | 'error'>('refreshing');

  useEffect(() => {
    const rawCallbackUrl = searchParams.get('callbackUrl');
    const baseUrl = window.location.origin;
    const callbackUrl = resolveRefreshCallbackUrl(rawCallbackUrl, baseUrl);

    update()
      .then(() => {
        setStatus('done');
        navigateTo(callbackUrl);
      })
      .catch(() => {
        setStatus('error');
        navigateTo(callbackUrl);
      });
    // update と searchParams は安定した参照のため依存配列に含めるが、
    // マウント時に一度だけ実行することが意図された処理。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '50vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        {status === 'refreshing' && (
          <>
            <CircularProgress />
            <Typography variant="body1" color="text.secondary">
              アクセス権限を更新しています…
            </Typography>
          </>
        )}
        {status === 'done' && (
          <Typography variant="body1" color="text.secondary">
            アクセス権限を更新しました。リダイレクト中…
          </Typography>
        )}
        {status === 'error' && (
          <Typography variant="body1" color="text.secondary">
            更新中にエラーが発生しましたが、リダイレクト先へ移動します…
          </Typography>
        )}
      </Box>
    </Container>
  );
}

/**
 * /refresh ページ。
 * クエリ callbackUrl を受け取り、ロールを強制再取得したうえで遷移する。
 * Phase 4 の 403 画面からバウンスされる想定。
 */
export default function RefreshPage() {
  return (
    <SessionProviderWrapper>
      <RefreshContent />
    </SessionProviderWrapper>
  );
}
