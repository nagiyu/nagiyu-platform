'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Box, Container, Stack } from '@mui/material';
import { Link } from '@nagiyu/ui';
import ChatInput from '@/components/ChatInput';
import LicenseFooter from '@/components/LicenseFooter';
import ResponseDisplay from '@/components/ResponseDisplay';
import { Live2DCanvasFallback } from '@/components/Live2DCanvas';
import ConsentModal from '@/components/ConsentModal';
import SafetyModal from '@/components/SafetyModal';
import type { LifecycleState, SafetyResource } from '@nagiyu/livetalk-core';

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
  | { type: 'lifecycle'; state: LifecycleState }
  | { type: 'done' }
  | { type: 'error'; message: string };

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Phase 2c のチャット画面（Phase 2f で Web Audio 再生に切替）。
 *
 * - LLM 応答を NDJSON ストリームで受信し、テキストを逐次表示
 * - 文単位の音声（base64 WAV）を AudioBuffer に decode して順番に再生
 * - iOS Safari 対策として AudioContext を user gesture で resume し、
 *   Live2DCanvas に AudioBuffer + AudioContext を渡して Web Audio で再生する
 *   （HTMLAudioElement の autoplay 制約を回避）
 */
export default function HomePage() {
  const [consentPhase, setConsentPhase] = useState<ConsentPhase>('checking');
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [userText, setUserText] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyResources, setSafetyResources] = useState<SafetyResource[]>([]);
  const [lifecycleState, setLifecycleState] = useState<LifecycleState>('awake');

  // キャラ第一声（未消化の通知から表示）
  const [firstWordText, setFirstWordText] = useState<string | null>(null);

  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const streamDoneRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  // AudioContext は子コンポーネント（Live2DCanvas）に prop で渡すため state で持つ。
  // 同期アクセス用に ref も併用する（callback 内で最新値を読むため）。
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

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

  // 起動時に未消化の通知があればキャラ第一声として表示する。
  useEffect(() => {
    fetch('/api/push/first-word')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { notifId: string; body: string } | null) => {
        if (!data) return;
        setFirstWordText(data.body);
        // 消化済みマーク
        fetch('/api/push/consumed', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notifId: data.notifId }),
        }).catch(() => {});
      })
      .catch(() => {});
  }, []);

  // 初回起動時に生活サイクル状態を取得し、初回発話を待たずに Live2D へ反映する。
  // 失敗時は現状維持（'awake'）。演出のための取得なので UI は止めない。
  useEffect(() => {
    fetch('/api/lifecycle')
      .then((res) => res.json())
      .then((data: { state: LifecycleState }) => {
        if (data.state === 'awake' || data.state === 'sleeping') {
          setLifecycleState(data.state);
        }
      })
      .catch(() => {
        // 取得失敗時は初期値 'awake' のまま
      });
  }, []);

  // iOS Safari の Web Audio autoplay 制約対策。
  // user gesture（handleSubmit）の同期スタックで AudioContext を作成・resume することで、
  // 以降の AudioBufferSourceNode.start() が transient activation token を消費せず
  // いつでも再生可能になる。HTMLAudioElement の per-element 制約は別系統で、
  // この対策では効かないため、再生は Web Audio API のみで完結させる（Live2DCanvas 参照）。
  const ensureAudioContextUnlocked = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtxRef.current) {
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;
      // 子コンポーネント（Live2DCanvas）に prop で渡すため state も更新
      setAudioContext(ctx);
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
  }, []);

  const clearAudioQueue = useCallback(() => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    streamDoneRef.current = false;
  }, []);

  // キューから次の音声を再生、またはストリーム完了済みならアイドルに戻る
  const advanceAudioQueue = useCallback(() => {
    if (isPlayingRef.current) return;

    const nextBuffer = audioQueueRef.current.shift();
    if (nextBuffer) {
      isPlayingRef.current = true;
      setAudioBuffer(nextBuffer);
    } else if (streamDoneRef.current) {
      setPhase('idle');
    }
  }, []);

  const handleSubmit = useCallback(
    async (text: string) => {
      // user gesture の同期スタック内で AudioContext を resume する（iOS Safari 対策）
      await ensureAudioContextUnlocked();
      const audioCtx = audioCtxRef.current;

      // 前回リクエストをキャンセル
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setUserText(text);
      setResponseText('');
      setFirstWordText(null);
      setErrorMessage(null);
      setPhase('loading');
      setAudioBuffer(null);
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

        const handleEvent = async (event: ChatStreamEvent) => {
          if (event.type === 'text') {
            setResponseText((prev) => (prev ?? '') + event.delta);
          } else if (event.type === 'sentence' && event.audio) {
            if (!audioCtx) {
              // AudioContext が無いブラウザ（極めて稀）: 音声をスキップしてテキストだけ表示
              return;
            }
            try {
              const arrayBuffer = base64ToArrayBuffer(event.audio);
              const decoded = await audioCtx.decodeAudioData(arrayBuffer);
              audioQueueRef.current.push(decoded);
              advanceAudioQueue();
            } catch (err) {
              console.error('[LiveTalk] 音声 decode に失敗しました', err);
            }
          } else if (event.type === 'lifecycle') {
            setLifecycleState(event.state);
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
              await handleEvent(JSON.parse(trimmed) as ChatStreamEvent);
            } catch {
              // malformed line はスキップ
            }
          }
        }

        // ストリーム終端の残余行
        if (lineBuffer.trim()) {
          try {
            await handleEvent(JSON.parse(lineBuffer.trim()) as ChatStreamEvent);
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
    [ensureAudioContextUnlocked, clearAudioQueue, advanceAudioQueue]
  );

  const handlePlaybackEnd = useCallback(() => {
    setAudioBuffer(null);
    isPlayingRef.current = false;
    advanceAudioQueue();
  }, [advanceAudioQueue]);

  const handlePlaybackError = useCallback(
    (error: Error) => {
      console.error('[LiveTalk] 音声再生エラー', error);
      setErrorMessage('音声再生中にエラーが発生しました。');
      setAudioBuffer(null);
      isPlayingRef.current = false;
      advanceAudioQueue();
    },
    [advanceAudioQueue]
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
            audioBuffer={audioBuffer}
            audioContext={audioContext}
            statusText={statusText}
            lifecycleState={lifecycleState}
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
          <ResponseDisplay text={firstWordText ?? responseText} userText={userText} />
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
          <Box sx={{ textAlign: 'center', display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Link href="/memory">私が覚えていること</Link>
            <Link href="/notes">ノート</Link>
          </Box>
        </Stack>
        <LicenseFooter />
      </Container>
    </>
  );
}
