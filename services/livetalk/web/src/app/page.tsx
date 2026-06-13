'use client';

import { Suspense, useCallback, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Box, Container, Stack, Typography } from '@mui/material';
import { Link } from '@nagiyu/ui';
import { hasPermission } from '@nagiyu/common';
import ChatInput from '@/components/ChatInput';
import ResponseDisplay from '@/components/ResponseDisplay';
import CharacterCanvas from '@/components/CharacterCanvas';
import ConsentModal from '@/components/ConsentModal';
import SafetyModal from '@/components/SafetyModal';
import NotificationToggle from '@/components/NotificationToggle';
import type { SafetyResource } from '@nagiyu/livetalk-core';
import InstallGuide from '@/components/InstallGuide';
import NotificationPermission from '@/components/NotificationPermission';
import CharacterSelectButton from '@/components/CharacterSelectButton';
import { useCharacter } from '@/lib/characters/CharacterContext';
import { getCharacterDisplay, hasCharacterProfile } from '@/lib/characters/client-profiles';
import { reportClientError } from '@/lib/client-logger';
import { useAudioContext } from '@/lib/audio/useAudioContext';
import { useAudioQueue } from '@/lib/audio/useAudioQueue';
import { useConsent } from '@/lib/home/useConsent';
import { useOnboarding } from '@/lib/home/useOnboarding';
import { useFirstWord } from '@/lib/home/useFirstWord';
import { usePendingNotifications } from '@/lib/home/usePendingNotifications';
import { useLifecycle } from '@/lib/home/useLifecycle';
import { useCharacterQuerySync } from '@/lib/home/useCharacterQuerySync';

type ChatPhase = 'idle' | 'loading' | 'streaming';

type ChatStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'sentence'; index: number; text: string; audio: string }
  | {
      type: 'safety';
      trigger: 'input_keyword' | 'output_moderation';
      resources: SafetyResource[];
      replacementText?: string;
    }
  | { type: 'lifecycle'; state: import('@nagiyu/livetalk-core').LifecycleState }
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
 *   CharacterCanvas に AudioBuffer + AudioContext を渡して Web Audio で再生する
 *   （HTMLAudioElement の autoplay 制約を回避）
 *
 * useSearchParams を使うため、ページ本体は Suspense 境界の内側に置く
 * （App Router の prerender 要件。下部の default export でラップする）。
 */
function HomePageInner() {
  const { characterId } = useCharacter();
  const { data: session } = useSession();
  const isAdmin =
    !!session?.user &&
    'roles' in session.user &&
    Array.isArray(session.user.roles) &&
    hasPermission(session.user.roles, 'livetalk:admin');

  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [userText, setUserText] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyResources, setSafetyResources] = useState<SafetyResource[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const sentenceReceivedRef = useRef(0);

  // AudioContext 管理 hook（iOS Safari の autoplay 制約対策）
  const { audioContext, ensureUnlocked, getContext } = useAudioContext();

  // 音声キュー管理 hook（再生待ちバッファ列と再生状態の state machine）
  const {
    audioBuffer,
    enqueue,
    markStreamDone,
    reset,
    handlePlaybackEnd,
    handlePlaybackError: advanceOnError,
  } = useAudioQueue({ onDrained: () => setPhase('idle') });

  // URL クエリパラメータ ?character=<id> をカレントキャラクターに反映する
  useCharacterQuerySync();

  // 同意状態管理 hook
  const { consentPhase, markConsented } = useConsent();

  // オンボーディング管理 hook（consentPhase 依存）
  const {
    onboardingPhase,
    onboardingText,
    clearOnboardingText,
    handleInstallSkip,
    handleNotificationGranted,
    handleNotificationSkip,
  } = useOnboarding(consentPhase);

  // カレントキャラの第一声（未消化通知）管理 hook
  const { firstWordText, prefillText, consumeKnowledgeId, clearFirstWordText } =
    useFirstWord(characterId);

  // 他キャラクターの未消化通知管理 hook
  const { pendingNotifications } = usePendingNotifications();

  // ライフサイクル状態管理 hook
  const { lifecycleState, setLifecycleState } = useLifecycle(characterId);

  const handleSubmit = useCallback(
    async (text: string) => {
      // user gesture の同期スタック内で AudioContext を resume する（iOS Safari 対策）
      await ensureUnlocked();
      const audioCtx = getContext();

      // 前回リクエストをキャンセル
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // 送信前に第一声 knowledgeId を取り出してクリア（1 ターン限り有効）。
      // クロス汚染防止: カレントキャラ == 通知元キャラのときのみ渡す（C3-3）。
      const notifKnowledgeId = consumeKnowledgeId(characterId);

      setUserText(text);
      setResponseText('');
      clearFirstWordText();
      clearOnboardingText();
      setErrorMessage(null);
      setPhase('loading');
      // キューをリセット（setAudioBuffer(null) + clearAudioQueue() 相当）
      reset();
      sentenceReceivedRef.current = 0;

      try {
        const chatBody: { text: string; characterId?: string; knowledgeId?: string } = {
          text,
          characterId,
        };
        if (notifKnowledgeId) chatBody.knowledgeId = notifKnowledgeId;

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chatBody),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          setErrorMessage('応答の取得に失敗しました。時間を置いて再度お試しください。');
          setPhase('idle');
          reportClientError('error', 'チャット fetch 失敗', `HTTP ${response.status}`, {
            screen: 'chat',
            audioContextState: getContext()?.state,
          });
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
            sentenceReceivedRef.current++;
            if (!audioCtx) {
              // AudioContext が無いブラウザ（極めて稀）: 音声をスキップしてテキストだけ表示
              return;
            }
            try {
              const arrayBuffer = base64ToArrayBuffer(event.audio);
              const decoded = await audioCtx.decodeAudioData(arrayBuffer);
              // decode 済みバッファをキューに追加（空きなら即再生開始）
              enqueue(decoded);
            } catch (err) {
              console.error('[LiveTalk] 音声 decode に失敗しました', err);
              reportClientError(
                'warning',
                '音声 decode 失敗',
                err instanceof Error ? err.message : '不明なエラー',
                {
                  screen: 'chat',
                  audioContextState: getContext()?.state,
                  sentenceReceived: sentenceReceivedRef.current,
                }
              );
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
            // ストリーム完了をマーク（キューと current が空なら onDrained → setPhase('idle')）
            markStreamDone();
          } else if (event.type === 'error') {
            setErrorMessage(event.message ?? '内部エラーが発生しました。');
            // ストリームエラー時もストリーム完了扱い（advance のみ hook に委譲）
            markStreamDone();
            reportClientError(
              'error',
              'チャット stream エラー',
              event.message ?? '内部エラーが発生しました',
              {
                screen: 'chat',
                audioContextState: getContext()?.state,
                sentenceReceived: sentenceReceivedRef.current,
                // markStreamDone 後なので streamDone は true
                streamDone: true,
              }
            );
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
        reportClientError(
          'error',
          'チャット通信エラー',
          error instanceof Error ? error.message : '不明なエラー',
          {
            screen: 'chat',
            audioContextState: getContext()?.state,
            sentenceReceived: sentenceReceivedRef.current,
            stack: error instanceof Error ? error.stack : undefined,
          }
        );
      }
    },
    [
      ensureUnlocked,
      getContext,
      reset,
      enqueue,
      markStreamDone,
      characterId,
      consumeKnowledgeId,
      clearFirstWordText,
      clearOnboardingText,
      setLifecycleState,
    ]
  );

  const handlePlaybackError = useCallback(
    (error: Error) => {
      console.error('[LiveTalk] 音声再生エラー', error);
      setErrorMessage('音声再生中にエラーが発生しました。');
      // advance のみ hook に委譲（ログ・setErrorMessage・reportClientError はここで処理）
      advanceOnError();
      reportClientError('warning', '音声再生エラー', error.message, {
        screen: 'chat',
        audioContextState: getContext()?.state,
        sentenceReceived: sentenceReceivedRef.current,
      });
    },
    [advanceOnError, getContext]
  );

  const statusText =
    phase === 'loading' ? '考え中…' : phase === 'streaming' ? '話している' : '待機中';

  return (
    <>
      <ConsentModal open={consentPhase === 'required'} onConsented={markConsented} />
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
        <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 0.5 }}>
          <CharacterSelectButton disabled={phase !== 'idle'} />
        </Box>
        <Box sx={{ flex: '0 1 60%', minHeight: 240, mb: 1 }}>
          <CharacterCanvas
            characterId={characterId}
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
          <ResponseDisplay
            text={onboardingText ?? firstWordText ?? responseText}
            userText={userText}
            characterId={characterId}
          />
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
          {onboardingPhase === 'install' && <InstallGuide onSkip={handleInstallSkip} />}
          {onboardingPhase === 'notification' && (
            <NotificationPermission
              onGranted={handleNotificationGranted}
              onSkip={handleNotificationSkip}
            />
          )}
          {/* 他キャラクターの未消化通知をヒントとして提示する（consume はしない）。
              ユーザーがそのキャラに切替えると first-word effect が走り第一声が表示・consume される。 */}
          {pendingNotifications
            .filter((n) => n.characterId !== characterId)
            .map((n) => {
              const display = hasCharacterProfile(n.characterId)
                ? getCharacterDisplay(n.characterId)
                : null;
              const name = display?.shortName ?? n.characterId;
              return (
                <Typography
                  key={n.characterId}
                  variant="caption"
                  color="text.secondary"
                  sx={{ textAlign: 'center', display: 'block' }}
                  data-testid={`pending-notification-${n.characterId}`}
                >
                  {name}から連絡が来てるよ
                </Typography>
              );
            })}
          <ChatInput
            onSubmit={handleSubmit}
            disabled={phase !== 'idle' || consentPhase !== 'done'}
            prefillText={prefillText ?? undefined}
          />
          <Box sx={{ textAlign: 'center', display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Link href="/memory">私が覚えていること</Link>
            <Link href="/notes">ノート</Link>
            {isAdmin && <Link href="/status">ステータス</Link>}
          </Box>
          <NotificationToggle />
        </Stack>
      </Container>
    </>
  );
}

/**
 * ページのエントリポイント。
 * useSearchParams を含む HomePageInner を Suspense 境界でラップする
 * （App Router の prerender 要件を満たすため）。
 */
export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageInner />
    </Suspense>
  );
}
