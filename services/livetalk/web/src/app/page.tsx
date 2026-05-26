'use client';

import { useCallback, useState } from 'react';
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
 */
export default function HomePage() {
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [userText, setUserText] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = useCallback(async (text: string) => {
    setUserText(text);
    setResponseText(null);
    setErrorMessage(null);
    setPhase('loading');

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
      const audioUrl = URL.createObjectURL(blob);

      setResponseText(text);
      setPhase('playing');

      await playAudioWithLipSync(audioUrl, setAudioLevel);
      URL.revokeObjectURL(audioUrl);
      setAudioLevel(0);
      setPhase('idle');
    } catch (error) {
      console.error('[LiveTalk] エコー再生に失敗しました', error);
      setErrorMessage('音声再生中にエラーが発生しました。');
      setAudioLevel(0);
      setPhase('idle');
    }
  }, []);

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
        <Live2DCanvas audioLevel={audioLevel} statusText={statusText} />
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

/**
 * HTML5 Audio + Web Audio API で音声を再生しつつ、
 * AnalyserNode で振幅を取得して onLevelChange に通知する。
 * 再生終了時に resolve、エラー時に reject。
 */
async function playAudioWithLipSync(
  audioUrl: string,
  onLevelChange: (level: number) => void
): Promise<void> {
  const AudioContextCtor =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;

  // Web Audio API が使えない環境では音量解析を諦め、再生のみ行う。
  if (!AudioContextCtor) {
    return playAudioOnly(audioUrl);
  }

  const audio = new Audio(audioUrl);
  audio.crossOrigin = 'anonymous';

  const ctx = new AudioContextCtor();
  const source = ctx.createMediaElementSource(audio);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  analyser.connect(ctx.destination);

  const data = new Uint8Array(analyser.frequencyBinCount);
  let rafId: number | null = null;
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    onLevelChange(Math.min(1, rms * 4));
    rafId = requestAnimationFrame(tick);
  };

  return new Promise<void>((resolve, reject) => {
    audio.addEventListener('ended', () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ctx.close().catch(() => {});
      resolve();
    });
    audio.addEventListener('error', () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ctx.close().catch(() => {});
      reject(new Error('Audio playback failed'));
    });
    audio
      .play()
      .then(() => {
        tick();
      })
      .catch(reject);
  });
}

async function playAudioOnly(audioUrl: string): Promise<void> {
  const audio = new Audio(audioUrl);
  return new Promise<void>((resolve, reject) => {
    audio.addEventListener('ended', () => resolve());
    audio.addEventListener('error', () => reject(new Error('Audio playback failed')));
    audio.play().catch(reject);
  });
}
