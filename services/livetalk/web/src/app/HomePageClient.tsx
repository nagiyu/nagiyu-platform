'use client';

import { Suspense, useState } from 'react';
import { Box, Container, Typography } from '@mui/material';
import ChatInput from '@/components/ChatInput';
import ResponseDisplay from '@/components/ResponseDisplay';
import CharacterCanvas from '@/components/CharacterCanvas';
import ConsentModal from '@/components/ConsentModal';
import SafetyModal from '@/components/SafetyModal';
import NotificationToggle from '@/components/NotificationToggle';
import InstallGuide from '@/components/InstallGuide';
import NotificationPermission from '@/components/NotificationPermission';
import CharacterSelectButton from '@/components/CharacterSelectButton';
import { useCharacter } from '@/lib/characters/CharacterContext';
import { getCharacterDisplay, hasCharacterProfile } from '@/lib/characters/client-profiles';
import { useAudioContext } from '@/lib/audio/useAudioContext';
import { useAudioQueue } from '@/lib/audio/useAudioQueue';
import { useConsent } from '@/lib/home/useConsent';
import { useOnboarding } from '@/lib/home/useOnboarding';
import { useFirstWord } from '@/lib/home/useFirstWord';
import { usePendingNotifications } from '@/lib/home/usePendingNotifications';
import { useLifecycle } from '@/lib/home/useLifecycle';
import { useCharacterQuerySync } from '@/lib/home/useCharacterQuerySync';
import { useChatStream } from '@/lib/home/useChatStream';
import type { ChatPhase } from '@/lib/home/types';

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
 * （App Router の prerender 要件。下部の HomePageClient でラップする）。
 *
 * ナビゲーション（私が覚えていること・ノート・ステータス）・サインアウト・退会の導線は
 * LiveTalkHeader（layout.tsx 経由）へ移設したため、本コンポーネントからは除去済み。
 */
function HomePageInner() {
  const { characterId } = useCharacter();

  // phase は HomePageInner の state のまま残す。
  // useAudioQueue の onDrained が setPhase('idle') を呼ぶため、
  // useChatStream 内に持たせると循環依存になる。
  const [phase, setPhase] = useState<ChatPhase>('idle');

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
  const { firstWordText, prefillText, clearFirstWordText } = useFirstWord(characterId);

  // 他キャラクターの未消化通知管理 hook
  const { pendingNotifications } = usePendingNotifications();

  // ライフサイクル状態管理 hook
  const { lifecycleState, setLifecycleState } = useLifecycle(characterId);

  // チャット送信フロー hook（handleSubmit + NDJSON parse + ストリームイベント分岐 + handlePlaybackError）
  const {
    userText,
    responseText,
    errorMessage,
    safetyOpen,
    safetyResources,
    closeSafety,
    handleSubmit,
    handlePlaybackError,
  } = useChatStream({
    characterId,
    setPhase,
    ensureUnlocked,
    getContext,
    enqueue,
    markStreamDone,
    resetAudioQueue: reset,
    advanceOnError,
    clearFirstWordText,
    clearOnboardingText,
    setLifecycleState,
  });

  const statusText =
    phase === 'loading' ? '考え中…' : phase === 'streaming' ? '話している' : '待機中';

  return (
    <>
      <ConsentModal open={consentPhase === 'required'} onConsented={markConsented} />
      <SafetyModal open={safetyOpen} resources={safetyResources} onClose={closeSafety} />
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
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            flex: '1 1 auto',
            minHeight: 0,
            width: '100%',
            maxWidth: '100%',
          }}
        >
          {/* スクロール領域：応答・エラー・onboarding・pending 通知はここに収める。
              minHeight: 0 は flex column 内の子で overflow スクロールを機能させるために必須。
              長文応答でもこの Box 内でスクロールし、下の固定領域（入力欄・通知トグル）を押し出さない。 */}
          <Box
            sx={{
              flex: '1 1 auto',
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
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
          </Box>
          {/* 固定領域：入力欄・通知トグルは常に下端に表示する（長文応答でスクロールしても位置が変わらない）。 */}
          <Box sx={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
            <ChatInput
              onSubmit={handleSubmit}
              disabled={phase !== 'idle' || consentPhase !== 'done'}
              prefillText={prefillText ?? undefined}
            />
            <NotificationToggle />
          </Box>
        </Box>
      </Container>
    </>
  );
}

/**
 * ページのエントリポイント（クライアントコンポーネント）。
 *
 * useSearchParams を含む HomePageInner を Suspense 境界でラップする
 * （App Router の prerender 要件を満たすため）。
 *
 * ナビゲーション・サインアウト・退会の導線は LiveTalkHeader（layout.tsx 経由）が担うため、
 * authUrl prop は不要になった。
 */
export function HomePageClient() {
  return (
    <Suspense fallback={null}>
      <HomePageInner />
    </Suspense>
  );
}
