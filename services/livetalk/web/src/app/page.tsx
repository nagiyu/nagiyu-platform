'use client';

import { Suspense, useCallback, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Box, Container, Stack, Typography } from '@mui/material';
import { Link, buildSignOutUrl } from '@nagiyu/ui';
import { hasPermission } from '@nagiyu/common';
import ChatInput from '@/components/ChatInput';
import ResponseDisplay from '@/components/ResponseDisplay';
import CharacterCanvas from '@/components/CharacterCanvas';
import ConsentModal from '@/components/ConsentModal';
import SafetyModal from '@/components/SafetyModal';
import AccountDeletionModal from '@/components/AccountDeletionModal';
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
import { useAccountDeletion } from '@/lib/account/useAccountDeletion';
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

  // phase は page.tsx の state のまま残す。
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

  // 退会・データ削除 hook
  const {
    loading: deletionLoading,
    error: deletionError,
    requestDeletion,
    clearError: clearDeletionError,
  } = useAccountDeletion();
  const [deletionModalOpen, setDeletionModalOpen] = useState(false);

  // 退会モーダルを開く（前回の残留エラーをクリアしてから開く）
  const openDeletionModal = useCallback(() => {
    clearDeletionError();
    setDeletionModalOpen(true);
  }, [clearDeletionError]);

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
    consumeKnowledgeId,
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
      <AccountDeletionModal
        open={deletionModalOpen}
        loading={deletionLoading}
        error={deletionError}
        onConfirm={requestDeletion}
        onCancel={() => setDeletionModalOpen(false)}
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
            {/* チャット画面フッターの補助リンク群に退会入口を配置する。
                利用規約・プライバシーポリシー導線は下部の ServiceLayout 共有フッターに表示される（SCR-011）。 */}
            <Link asChild>
              <button type="button" onClick={openDeletionModal} data-testid="open-deletion-modal">
                退会・データ削除
              </button>
            </Link>
            {/* サインアウト導線。
                サインアウト処理は Cookie 発行元の auth サービスに集約する方針のため、
                自サービスの NextAuth signout POST ではなく auth サービスへリダイレクトする。
                callbackUrl に自サービスの origin を渡し、サインアウト後に戻れるようにする。 */}
            <Link asChild>
              <button
                type="button"
                onClick={() =>
                  window.location.assign(
                    buildSignOutUrl(
                      process.env.NEXT_PUBLIC_AUTH_URL ?? '',
                      window.location.origin
                    )
                  )
                }
                data-testid="sign-out-button"
              >
                サインアウト
              </button>
            </Link>
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
