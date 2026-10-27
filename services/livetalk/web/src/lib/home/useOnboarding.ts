'use client';

import { useCallback, useEffect, useState } from 'react';
import { isPushSupported } from '@nagiyu/browser';
import {
  isStandalone,
  shouldShowInstallGuide,
  shouldShowNotificationPermission,
} from '../pwa/standalone';
import { PWA_MESSAGES } from '../pwa/messages';
import type { ConsentPhase, OnboardingPhase } from './types';

/**
 * useOnboarding の戻り値型。
 */
export interface UseOnboardingResult {
  /** 現在のオンボーディングフェーズ */
  onboardingPhase: OnboardingPhase;
  /** オンボーディング表示テキスト（通知許可完了後の一時メッセージを含む） */
  onboardingText: string | null;
  /** handleSubmit からオンボーディングテキストをクリアするための関数 */
  clearOnboardingText: () => void;
  /**
   * その場の案内表示だけを閉じる (スヌーズは記録しない)。
   * 応答が届いたあとも案内が会話の領域の末尾に残ると、末尾までのスクロールで応答が押し出される。
   * 次回訪問では、これまでどおり案内を出す。
   */
  dismissOnboarding: () => void;
  /** ホーム画面追加ガイドをスキップするハンドラ */
  handleInstallSkip: () => void;
  /** 通知許可が完了したときのハンドラ（4 秒後に自動クリア） */
  handleNotificationGranted: () => void;
  /** 通知許可をスキップするハンドラ */
  handleNotificationSkip: () => void;
}

/**
 * オンボーディング（ホーム画面追加・通知許可）を管理するカスタム hook。
 *
 * 同意完了後（consentPhase === 'done'）にオンボーディング表示要否を判定する。
 */
export function useOnboarding(consentPhase: ConsentPhase): UseOnboardingResult {
  const [onboardingPhase, setOnboardingPhase] = useState<OnboardingPhase>(null);
  const [onboardingText, setOnboardingText] = useState<string | null>(null);

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

  const clearOnboardingText = useCallback(() => {
    setOnboardingText(null);
  }, []);

  const dismissOnboarding = useCallback(() => {
    setOnboardingPhase(null);
    setOnboardingText(null);
  }, []);

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

  return {
    onboardingPhase,
    onboardingText,
    clearOnboardingText,
    dismissOnboarding,
    handleInstallSkip,
    handleNotificationGranted,
    handleNotificationSkip,
  };
}
