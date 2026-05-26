'use client';

import { useCallback, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Box, Container, Stack } from '@mui/material';
import ChatInput from '@/components/ChatInput';
import LicenseFooter from '@/components/LicenseFooter';
import ResponseDisplay from '@/components/ResponseDisplay';
import { Live2DCanvasFallback } from '@/components/Live2DCanvas';

// PixiJS は browser API (WebGL, Canvas) を使うため SSR 不可。
const Live2DCanvas = dynamic(() => import('@/components/Live2DCanvas'), {
  ssr: false,
  loading: ({ error }) => (error ? null : <Live2DCanvasFallback statusText="読み込み中…" />),
});

type ChatPhase = 'idle' | 'loading' | 'playing';

/**
 * Phase 1g のチャット画面。
 * - 上部: 桃瀬ひより（Live2D）+ リップシンク
 * - 中央: 応答テキスト
 * - 下部: 入力欄
 * - 最下部: VOICEVOX / Live2D ライセンス表記
 *
 * 音声再生 + リップシンクは Live2DCanvas が model.speak() 経由で内部処理する。
 */
export default function HomePage() {
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [userText, setUserText] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Blob URL の revoke 用に現在再生中の URL を保持する
  const audioUrlRef = useRef<string | null>(null);

  const releaseAudioUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const handleSubmit = useCallback(
    async (text: string) => {
      setUserText(text);
      setResponseText(null);
      setErrorMessage(null);
      setPhase('loading');
      releaseAudioUrl();
      setAudioUrl(null);

      try {
        const response = await fetch('/api/echo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });

        if (!response.ok) {
          setErrorMessage('音声合成に失敗しました。時間を置いて再度お試しください。');
          setPhase('idle');
          return;
        }

        const audioBuffer = await response.arrayBuffer();
        const blob = new Blob([audioBuffer], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);

        audioUrlRef.current = url;
        setResponseText(text);
        setAudioUrl(url);
        setPhase('playing');
      } catch (error) {
        console.error('[LiveTalk] エコー再生に失敗しました', error);
        setErrorMessage('音声再生中にエラーが発生しました。');
        setPhase('idle');
      }
    },
    [releaseAudioUrl]
  );

  const handlePlaybackEnd = useCallback(() => {
    releaseAudioUrl();
    setAudioUrl(null);
    setPhase('idle');
  }, [releaseAudioUrl]);

  const handlePlaybackError = useCallback(() => {
    setErrorMessage('音声再生中にエラーが発生しました。');
    releaseAudioUrl();
    setAudioUrl(null);
    setPhase('idle');
  }, [releaseAudioUrl]);

  const statusText =
    phase === 'loading' ? '考え中…' : phase === 'playing' ? '話している' : '待機中';

  return (
    <Container
      maxWidth="sm"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 128px)',
        py: 1,
      }}
    >
      <Box sx={{ flex: '0 1 60%', minHeight: 240, mb: 1 }}>
        <Live2DCanvas
          audioUrl={audioUrl}
          statusText={statusText}
          onPlaybackEnd={handlePlaybackEnd}
          onPlaybackError={handlePlaybackError}
        />
      </Box>
      <Stack
        spacing={1}
        sx={{
          flex: '1 1 auto',
          width: '100%',
          maxWidth: '100%',
          alignItems: 'stretch',
        }}
      >
        <ResponseDisplay text={responseText} userText={userText} />
        {errorMessage && (
          <Box
            sx={{
              color: 'error.main',
              fontSize: '0.875rem',
              textAlign: 'center',
            }}
            role="alert"
          >
            {errorMessage}
          </Box>
        )}
        <ChatInput onSubmit={handleSubmit} disabled={phase !== 'idle'} />
      </Stack>
      <LicenseFooter />
    </Container>
  );
}
