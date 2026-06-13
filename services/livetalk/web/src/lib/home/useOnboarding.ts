'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  isStandalone,
  isPushSupported,
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
    handleInstallSkip,
    handleNotificationGranted,
    handleNotificationSkip,
  };
}
