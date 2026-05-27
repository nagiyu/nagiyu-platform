'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Box, Container, Stack } from '@mui/material';
import ChatInput from '@/components/ChatInput';
import LicenseFooter from '@/components/LicenseFooter';
import ResponseDisplay from '@/components/ResponseDisplay';
import { Live2DCanvasFallback } from '@/components/Live2DCanvas';
import ConsentModal from '@/components/ConsentModal';
import SafetyModal from '@/components/SafetyModal';
import type { SafetyResource } from '@nagiyu/livetalk-core';

const Live2DCanvas = dynamic(() => import('@/components/Live2DCanvas'), {
  ssr: false,
  loading: ({ error }) => (error ? null : <Live2DCanvasFallback statusText="読み込み中…" />),
});

type ChatPhase = 'idle' | 'loading' | 'streaming';
type ConsentPhase = 'checking' | 'required' | 'done';

type ChatStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'sentence'; index: number; text: string; audio: string }
  | {
      type: 'safety';
      trigger: 'input_keyword' | 'output_moderation';
      resources: SafetyResource[];
      replacementText?: string;
    }
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

  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyResources, setSafetyResources] = useState<SafetyResource[]>([]);

  const audioUrlRef = useRef<string | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const streamDoneRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isAudioUnlockedRef = useRef(false);

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

  // iOS Safari の AudioContext autoplay 制約対策。
  // user gesture（handleSubmit）の同期スタックで呼ぶことで suspended 状態を解除し、
  // その後の model.speak() 内部の AudioContext が音声を出力できる状態にする。
  const ensureAudioContextUnlocked = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContextClass();
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
  }, []);

  // iOS Safari の HTMLAudioElement.play() autoplay 制約対策（Plan A+）。
  // user gesture 中に無音 audio の play() を 1 度だけ呼ぶと、同一ページ内の以降の
  // audio.play() が user gesture 外でも許可される（pixi-live2d-display-lipsyncpatch の
  // model.speak() 内部 audio がこれで unlock される）。
  //
  // 重要: await しない。iOS Safari は 0 サンプル無音 WAV の play() Promise が
  // resolve しない場合があり、await すると handleSubmit が stall して送信処理が
  // 進まなくなる。unlock 効果は play() を「呼んだ」時点で発生するので fire-and-forget で OK。
  const ensureAudioElementUnlocked = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (isAudioUnlockedRef.current) return;
    if (!silentAudioRef.current) {
      const audio = new Audio();
      // 1 サンプル分の無音 WAV（PCM, 8kHz, mono, 8bit, 0 サンプル）
      audio.src =
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
      audio.preload = 'auto';
      silentAudioRef.current = audio;
    }
    const playPromise = silentAudioRef.current.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          silentAudioRef.current?.pause();
          if (silentAudioRef.current) {
            silentAudioRef.current.currentTime = 0;
          }
          isAudioUnlockedRef.current = true;
        })
        .catch(() => {
          // play 拒否時は次回 user gesture でリトライ。silentAudioRef は維持。
        });
    }
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
      // user gesture の同期スタック内で HTMLAudioElement の unlock を発火する。
      // await の前に呼ぶことで iOS Safari の user gesture context を確実に保持する。
      ensureAudioElementUnlocked();
      // AudioContext の resume は await が必要だが Edge/Chrome では即時 resolve、
      // iOS Safari でも安全に完了する。
      await ensureAudioContextUnlocked();

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
          } else if (event.type === 'safety') {
            if (event.trigger === 'output_moderation' && event.replacementText) {
              setResponseText(event.replacementText);
            }
            setSafetyResources(event.resources);
            setSafetyOpen(true);
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
    [
      ensureAudioContextUnlocked,
      ensureAudioElementUnlocked,
      revokeCurrentAudio,
      clearAudioQueue,
      advanceAudioQueue,
    ]
  );

  const handlePlaybackEnd = useCallback(() => {
    revokeCurrentAudio();
    setAudioUrl(null);
    isPlayingRef.current = false;
    advanceAudioQueue();
  }, [revokeCurrentAudio, advanceAudioQueue]);

  const handlePlaybackError = useCallback(
    (error: Error) => {
      console.error('[LiveTalk] 音声再生エラー', error);
      // iOS Safari 実機デバッグ用に画面にエラー詳細を表示する（#3260 対応中の一時措置、
      // 解決後は元の汎用メッセージに戻す）。error が Error でない値で渡される可能性に
      // 備え、name / message を defensive に取り出す。
      const errorName = (error as { name?: unknown })?.name
        ? String((error as { name: unknown }).name)
        : 'Unknown';
      const errorMessageDetail = (error as { message?: unknown })?.message
        ? String((error as { message: unknown }).message)
        : String(error);
      setErrorMessage(`音声再生中にエラーが発生しました。[${errorName}] ${errorMessageDetail}`);
      revokeCurrentAudio();
      setAudioUrl(null);
      isPlayingRef.current = false;
      advanceAudioQueue();
    },
    [revokeCurrentAudio, advanceAudioQueue]
  );

  const statusText =
    phase === 'loading' ? '考え中…' : phase === 'streaming' ? '話している' : '待機中';

  return (
    <>
      <ConsentModal
        open={consentPhase === 'required'}
        onConsented={() => setConsentPhase('done')}
      />
      <SafetyModal
        open={safetyOpen}
        resources={safetyResources}
        onClose={() => setSafetyOpen(false)}
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
