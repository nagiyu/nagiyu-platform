'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
import type { LifecycleState, SafetyResource } from '@nagiyu/livetalk-core';
import InstallGuide from '@/components/InstallGuide';
import NotificationPermission from '@/components/NotificationPermission';
import CharacterSelectButton from '@/components/CharacterSelectButton';
import { useCharacter } from '@/lib/characters/CharacterContext';
import { getCharacterDisplay, hasCharacterProfile } from '@/lib/characters/client-profiles';
import {
  isStandalone,
  isPushSupported,
  shouldShowInstallGuide,
  shouldShowNotificationPermission,
} from '@/lib/pwa/standalone';
import { PWA_MESSAGES } from '@/lib/pwa/messages';
import { reportClientError } from '@/lib/client-logger';
import { useAudioContext } from '@/lib/audio/useAudioContext';
import { useAudioQueue } from '@/lib/audio/useAudioQueue';

/**
 * pending API のレスポンス型（キャラクターごとの未消化通知）。
 */
interface PendingNotification {
  /** 通知元キャラクター ID */
  characterId: string;
  /** 通知 ID */
  notifId: string;
  /** 通知本文 */
  body: string;
}

type ChatPhase = 'idle' | 'loading' | 'streaming';
type ConsentPhase = 'checking' | 'required' | 'done';
type OnboardingPhase = 'install' | 'notification' | null;

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
 *   CharacterCanvas に AudioBuffer + AudioContext を渡して Web Audio で再生する
 *   （HTMLAudioElement の autoplay 制約を回避）
 *
 * useSearchParams を使うため、ページ本体は Suspense 境界の内側に置く
 * （App Router の prerender 要件。下部の default export でラップする）。
 */
function HomePageInner() {
  const { characterId, setCharacterId } = useCharacter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const isAdmin =
    !!session?.user &&
    'roles' in session.user &&
    Array.isArray(session.user.roles) &&
    hasPermission(session.user.roles, 'livetalk:admin');

  const [consentPhase, setConsentPhase] = useState<ConsentPhase>('checking');
  const [onboardingPhase, setOnboardingPhase] = useState<OnboardingPhase>(null);
  const [onboardingText, setOnboardingText] = useState<string | null>(null);
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [userText, setUserText] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // 通知タップ起動時に入力欄へプリフィルするサジェスト発話
  const [prefillText, setPrefillText] = useState<string | null>(null);

  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyResources, setSafetyResources] = useState<SafetyResource[]>([]);
  const [lifecycleState, setLifecycleState] = useState<LifecycleState>('awake');

  // キャラ第一声（未消化の通知から表示）
  const [firstWordText, setFirstWordText] = useState<string | null>(null);
  // 第一声の元となった KnowledgeID（次の chat 送信時に文脈として渡す）
  const firstWordKnowledgeIdRef = useRef<string | null>(null);
  // 第一声の通知元キャラクター ID（クロス汚染防止のためカレントと照合する）
  const firstWordCharacterIdRef = useRef<string | null>(null);
  // 他キャラクターの未消化通知（自前起動時に提示する）
  const [pendingNotifications, setPendingNotifications] = useState<PendingNotification[]>([]);

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

  // push クリック起動時: URL の ?character=<id> を読み、カレントキャラを切替える。
  // searchParams は Next.js の useSearchParams で取得。
  // 依存配列に searchParams を含めることで、SPA 遷移でも正しく動作する。
  useEffect(() => {
    const characterQuery = searchParams.get('character');
    if (characterQuery && hasCharacterProfile(characterQuery)) {
      setCharacterId(characterQuery);
    }
    // searchParams の変化のみに依存する（setCharacterId は安定した関数参照）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // カレント characterId の未消化通知を第一声として取得・表示する。
  // characterId が変わるたびに再取得し、前のキャラの knowledgeId をクリアする。
  useEffect(() => {
    // キャラクター切替時は前のキャラの第一声 knowledgeId をクリアする（クロス汚染防止）
    firstWordKnowledgeIdRef.current = null;
    firstWordCharacterIdRef.current = null;
    setFirstWordText(null);

    fetch(`/api/push/first-word?characterId=${encodeURIComponent(characterId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            notifId: string;
            body: string;
            knowledgeId?: string | null;
            characterId: string;
            suggestedReply?: string | null;
          } | null
        ) => {
          if (!data) return;
          setFirstWordText(data.body);
          firstWordKnowledgeIdRef.current = data.knowledgeId ?? null;
          // 通知元キャラクター ID を保存（クロス汚染防止のためカレントと照合する）
          firstWordCharacterIdRef.current = data.characterId;
          // 通知タップ起動時（from=push）かつ suggestedReply がある場合は入力欄へプリフィル
          if (searchParams.get('from') === 'push' && data.suggestedReply) {
            setPrefillText(data.suggestedReply);
          }
          // 消化済みマーク
          fetch('/api/push/consumed', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notifId: data.notifId }),
          }).catch(() => {});
        }
      )
      .catch(() => {});
  }, [characterId]);

  // 自前起動時: カレント以外に未消化通知があれば提示する。
  // このエフェクトはマウント時（初回起動）にのみ実行する。
  useEffect(() => {
    fetch('/api/push/pending')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PendingNotification[] | null) => {
        if (!data || data.length === 0) return;
        setPendingNotifications(data);
      })
      .catch(() => {});
    // マウント時のみ実行（依存配列は空）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 同意完了後にオンボーディング（ホーム画面追加・通知許可）の表示要否を判定する。
  useEffect(() => {
    if (consentPhase !== 'done') return;
    if (!isStandalone() && shouldShowInstallGuide()) {
      setOnboardingPhase('install');
      setOnboardingText(PWA_MESSAGES.INSTALL_PROMPT);
    } else if (
      isStandalone() &&
      isPushSupported() &&
      typeof window !== 'undefined' &&
      window.Notification.permission !== 'granted' &&
      shouldShowNotificationPermission()
    ) {
      setOnboardingPhase('notification');
      setOnboardingText(PWA_MESSAGES.NOTIFICATION_PROMPT);
    }
  }, [consentPhase]);

  // 起動時・キャラ切替時に生活サイクル状態を取得し、初回発話を待たずに Live2D へ反映する。
  // 失敗時は現状維持（'awake'）。演出のための取得なので UI は止めない。
  useEffect(() => {
    fetch(`/api/lifecycle?characterId=${encodeURIComponent(characterId)}`)
      .then((res) => res.json())
      .then((data: { state: LifecycleState }) => {
        if (data.state === 'awake' || data.state === 'sleeping') {
          setLifecycleState(data.state);
        }
      })
      .catch(() => {
        // 取得失敗時は初期値 'awake' のまま
      });
  }, [characterId]);

  const handleInstallSkip = useCallback(() => {
    setOnboardingPhase(null);
    setOnboardingText(null);
  }, []);

  const handleNotificationGranted = useCallback(() => {
    setOnboardingPhase(null);
    setOnboardingText(PWA_MESSAGES.NOTIFICATION_GRANTED);
    setTimeout(() => {
      setOnboardingText((current) =>
        current === PWA_MESSAGES.NOTIFICATION_GRANTED ? null : current
      );
    }, 4000);
  }, []);

  const handleNotificationSkip = useCallback(() => {
    setOnboardingPhase(null);
    setOnboardingText(null);
  }, []);

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
      const firstWordNotifCharId = firstWordCharacterIdRef.current;
      const rawKnowledgeId = firstWordKnowledgeIdRef.current;
      const notifKnowledgeId =
        rawKnowledgeId !== null && firstWordNotifCharId === characterId ? rawKnowledgeId : null;
      firstWordKnowledgeIdRef.current = null;
      firstWordCharacterIdRef.current = null;

      setUserText(text);
      setResponseText('');
      setFirstWordText(null);
      setOnboardingText(null);
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
    [ensureUnlocked, getContext, reset, enqueue, markStreamDone, characterId]
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
