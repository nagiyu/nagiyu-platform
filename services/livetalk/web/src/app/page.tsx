'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Box, Container, Stack } from '@mui/material';
import ChatInput from '@/components/ChatInput';
import LicenseFooter from '@/components/LicenseFooter';
import ResponseDisplay from '@/components/ResponseDisplay';
import { Live2DCanvasFallback } from '@/components/Live2DCanvas';
import ConsentModal from '@/components/ConsentModal';

const Live2DCanvas = dynamic(() => import('@/components/Live2DCanvas'), {
  ssr: false,
  loading: ({ error }) => (error ? null : <Live2DCanvasFallback statusText="読み込み中…" />),
});

type ChatPhase = 'idle' | 'loading' | 'streaming';
type ConsentPhase = 'checking' | 'required' | 'done';

type ChatStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'sentence'; index: number; text: string; audio: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * Phase 2c のチャット画面。
 *
 * - LLM 応答を NDJSON ストリームで受信し、テキストを逐次表示
 * - 文単位の音声（base64 WAV）を受け取り、キューで順番に再生
 * - Live2D の lipsync は既存 model.speak() を流用
 */
export default function HomePage() {
  const [consentPhase, setConsentPhase] = useState<ConsentPhase>('checking');
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [userText, setUserText] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioUrlRef = useRef<string | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const streamDoneRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch('/api/consent')
      .then((res) => res.json())
      .then((data: { consented: boolean }) => {
        setConsentPhase(data.consented ? 'done' : 'required');
      })
      .catch(() => {
        // 取得失敗時はモーダルを表示してユーザーに同意を促す
        setConsentPhase('required');
      });
  }, []);

  const revokeCurrentAudio = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const clearAudioQueue = useCallback(() => {
    for (const url of audioQueueRef.current) {
      URL.revokeObjectURL(url);
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    streamDoneRef.current = false;
  }, []);

  // キューから次の音声を再生、またはストリーム完了済みならアイドルに戻る
  const advanceAudioQueue = useCallback(() => {
    if (isPlayingRef.current) return;

    const nextUrl = audioQueueRef.current.shift();
    if (nextUrl) {
      isPlayingRef.current = true;
      audioUrlRef.current = nextUrl;
      setAudioUrl(nextUrl);
    } else if (streamDoneRef.current) {
      setPhase('idle');
    }
  }, []);

  const handleSubmit = useCallback(
    async (text: string) => {
      // 前回リクエストをキャンセル
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setUserText(text);
      setResponseText('');
      setErrorMessage(null);
      setPhase('loading');
      revokeCurrentAudio();
      setAudioUrl(null);
      clearAudioQueue();

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          setErrorMessage('応答の取得に失敗しました。時間を置いて再度お試しください。');
          setPhase('idle');
          return;
        }

        setPhase('streaming');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let lineBuffer = '';

        const handleEvent = (event: ChatStreamEvent) => {
          if (event.type === 'text') {
            setResponseText((prev) => (prev ?? '') + event.delta);
          } else if (event.type === 'sentence' && event.audio) {
            const blob = base64ToBlob(event.audio, 'audio/wav');
            const url = URL.createObjectURL(blob);
            audioQueueRef.current.push(url);
            advanceAudioQueue();
          } else if (event.type === 'done') {
            streamDoneRef.current = true;
            advanceAudioQueue();
          } else if (event.type === 'error') {
            setErrorMessage(event.message ?? '内部エラーが発生しました。');
            streamDoneRef.current = true;
            advanceAudioQueue();
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              handleEvent(JSON.parse(trimmed) as ChatStreamEvent);
            } catch {
              // malformed line はスキップ
            }
          }
        }

        // ストリーム終端の残余行
        if (lineBuffer.trim()) {
          try {
            handleEvent(JSON.parse(lineBuffer.trim()) as ChatStreamEvent);
          } catch {
            // skip
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('[LiveTalk] チャット応答の取得に失敗しました', error);
        setErrorMessage('エラーが発生しました。時間を置いて再度お試しください。');
        setPhase('idle');
      }
    },
    [revokeCurrentAudio, clearAudioQueue, advanceAudioQueue]
  );

  const handlePlaybackEnd = useCallback(() => {
    revokeCurrentAudio();
    setAudioUrl(null);
    isPlayingRef.current = false;
    advanceAudioQueue();
  }, [revokeCurrentAudio, advanceAudioQueue]);

  const handlePlaybackError = useCallback(() => {
    setErrorMessage('音声再生中にエラーが発生しました。');
    revokeCurrentAudio();
    setAudioUrl(null);
    isPlayingRef.current = false;
    advanceAudioQueue();
  }, [revokeCurrentAudio, advanceAudioQueue]);

  const statusText =
    phase === 'loading' ? '考え中…' : phase === 'streaming' ? '話している' : '待機中';

  return (
    <>
      <ConsentModal
        open={consentPhase === 'required'}
        onConsented={() => setConsentPhase('done')}
      />
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
          <ChatInput
            onSubmit={handleSubmit}
            disabled={phase !== 'idle' || consentPhase !== 'done'}
          />
        </Stack>
        <LicenseFooter />
      </Container>
    </>
  );
}
