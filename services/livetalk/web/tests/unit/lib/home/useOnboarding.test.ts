import { renderHook, act, waitFor } from '@testing-library/react';
import { useOnboarding } from '@/lib/home/useOnboarding';

// オンボーディング判定関数をモック
jest.mock('@/lib/pwa/standalone', () => ({
  isStandalone: jest.fn().mockReturnValue(false),
  isPushSupported: jest.fn().mockReturnValue(false),
  shouldShowInstallGuide: jest.fn().mockReturnValue(false),
  shouldShowNotificationPermission: jest.fn().mockReturnValue(false),
}));

jest.mock('@/lib/pwa/messages', () => ({
  PWA_MESSAGES: {
    INSTALL_PROMPT: 'お家を作ってほしいな…',
    NOTIFICATION_PROMPT: '来てくれてありがとう！',
    NOTIFICATION_GRANTED: 'やった！',
  },
}));

import {
  isStandalone,
  isPushSupported,
  shouldShowInstallGuide,
  shouldShowNotificationPermission,
} from '@/lib/pwa/standalone';
import { PWA_MESSAGES } from '@/lib/pwa/messages';

afterEach(() => {
  jest.clearAllMocks();
  // モックを既定値（表示なし）に戻す
  (isStandalone as jest.Mock).mockReturnValue(false);
  (isPushSupported as jest.Mock).mockReturnValue(false);
  (shouldShowInstallGuide as jest.Mock).mockReturnValue(false);
  (shouldShowNotificationPermission as jest.Mock).mockReturnValue(false);
});

describe('useOnboarding', () => {
  describe('初期値', () => {
    it('初期状態は onboardingPhase が null, onboardingText が null', () => {
      const { result } = renderHook(() => useOnboarding('checking'));
      expect(result.current.onboardingPhase).toBeNull();
      expect(result.current.onboardingText).toBeNull();
    });
  });

  describe('consentPhase が done のとき', () => {
    it('スタンドアロンでなく shouldShowInstallGuide が true なら install フェーズになる', async () => {
      (isStandalone as jest.Mock).mockReturnValue(false);
      (shouldShowInstallGuide as jest.Mock).mockReturnValue(true);

      const { result } = renderHook(() => useOnboarding('done'));
      await waitFor(() => expect(result.current.onboardingPhase).toBe('install'));
      expect(result.current.onboardingText).toBe(PWA_MESSAGES.INSTALL_PROMPT);
    });

    it('スタンドアロン + push サポート + 通知未許可 + shouldShowNotificationPermission が true なら notification フェーズになる', async () => {
      (isStandalone as jest.Mock).mockReturnValue(true);
      (isPushSupported as jest.Mock).mockReturnValue(true);
      (shouldShowNotificationPermission as jest.Mock).mockReturnValue(true);
      // window.Notification.permission を 'default' に設定
      Object.defineProperty(window, 'Notification', {
        writable: true,
        configurable: true,
        value: { permission: 'default' },
      });

      const { result } = renderHook(() => useOnboarding('done'));
      await waitFor(() => expect(result.current.onboardingPhase).toBe('notification'));
      expect(result.current.onboardingText).toBe(PWA_MESSAGES.NOTIFICATION_PROMPT);
    });

    it('通知が granted 済みなら notification フェーズにならない', async () => {
      (isStandalone as jest.Mock).mockReturnValue(true);
      (isPushSupported as jest.Mock).mockReturnValue(true);
      (shouldShowNotificationPermission as jest.Mock).mockReturnValue(true);
      Object.defineProperty(window, 'Notification', {
        writable: true,
        configurable: true,
        value: { permission: 'granted' },
      });

      const { result } = renderHook(() => useOnboarding('done'));
      // consentPhase=done でも notification にならない
      await act(async () => {});
      expect(result.current.onboardingPhase).toBeNull();
    });

    it('すべての条件が false なら onboardingPhase は null のまま', async () => {
      const { result } = renderHook(() => useOnboarding('done'));
      await act(async () => {});
      expect(result.current.onboardingPhase).toBeNull();
      expect(result.current.onboardingText).toBeNull();
    });
  });

  describe('consentPhase が done でない場合', () => {
    it('checking のときはオンボーディング判定が走らない', async () => {
      (shouldShowInstallGuide as jest.Mock).mockReturnValue(true);
      const { result } = renderHook(() => useOnboarding('checking'));
      await act(async () => {});
      expect(result.current.onboardingPhase).toBeNull();
    });

    it('required のときはオンボーディング判定が走らない', async () => {
      (shouldShowInstallGuide as jest.Mock).mockReturnValue(true);
      const { result } = renderHook(() => useOnboarding('required'));
      await act(async () => {});
      expect(result.current.onboardingPhase).toBeNull();
    });
  });

  describe('ハンドラ', () => {
    it('handleInstallSkip で onboardingPhase と onboardingText がクリアされる', async () => {
      (isStandalone as jest.Mock).mockReturnValue(false);
      (shouldShowInstallGuide as jest.Mock).mockReturnValue(true);

      const { result } = renderHook(() => useOnboarding('done'));
      await waitFor(() => expect(result.current.onboardingPhase).toBe('install'));

      act(() => {
        result.current.handleInstallSkip();
      });

      expect(result.current.onboardingPhase).toBeNull();
      expect(result.current.onboardingText).toBeNull();
    });

    it('handleNotificationSkip で onboardingPhase と onboardingText がクリアされる', async () => {
      (isStandalone as jest.Mock).mockReturnValue(true);
      (isPushSupported as jest.Mock).mockReturnValue(true);
      (shouldShowNotificationPermission as jest.Mock).mockReturnValue(true);
      Object.defineProperty(window, 'Notification', {
        writable: true,
        configurable: true,
        value: { permission: 'default' },
      });

      const { result } = renderHook(() => useOnboarding('done'));
      await waitFor(() => expect(result.current.onboardingPhase).toBe('notification'));

      act(() => {
        result.current.handleNotificationSkip();
      });

      expect(result.current.onboardingPhase).toBeNull();
      expect(result.current.onboardingText).toBeNull();
    });

    it('handleNotificationGranted で onboardingPhase がクリアされ NOTIFICATION_GRANTED テキストが設定される', async () => {
      (isStandalone as jest.Mock).mockReturnValue(true);
      (isPushSupported as jest.Mock).mockReturnValue(true);
      (shouldShowNotificationPermission as jest.Mock).mockReturnValue(true);
      Object.defineProperty(window, 'Notification', {
        writable: true,
        configurable: true,
        value: { permission: 'default' },
      });

      const { result } = renderHook(() => useOnboarding('done'));
      await waitFor(() => expect(result.current.onboardingPhase).toBe('notification'));

      act(() => {
        result.current.handleNotificationGranted();
      });

      expect(result.current.onboardingPhase).toBeNull();
      expect(result.current.onboardingText).toBe(PWA_MESSAGES.NOTIFICATION_GRANTED);
    });

    it('handleNotificationGranted から 4 秒後に onboardingText が自動クリアされる', async () => {
      jest.useFakeTimers();
      (isStandalone as jest.Mock).mockReturnValue(true);
      (isPushSupported as jest.Mock).mockReturnValue(true);
      (shouldShowNotificationPermission as jest.Mock).mockReturnValue(true);
      Object.defineProperty(window, 'Notification', {
        writable: true,
        configurable: true,
        value: { permission: 'default' },
      });

      const { result } = renderHook(() => useOnboarding('done'));
      await waitFor(() => expect(result.current.onboardingPhase).toBe('notification'));

      act(() => {
        result.current.handleNotificationGranted();
      });
      expect(result.current.onboardingText).toBe(PWA_MESSAGES.NOTIFICATION_GRANTED);

      act(() => {
        jest.advanceTimersByTime(4000);
      });
      expect(result.current.onboardingText).toBeNull();

      jest.useRealTimers();
    });

    it('clearOnboardingText で onboardingText が null になる', async () => {
      (isStandalone as jest.Mock).mockReturnValue(false);
      (shouldShowInstallGuide as jest.Mock).mockReturnValue(true);

      const { result } = renderHook(() => useOnboarding('done'));
      await waitFor(() => expect(result.current.onboardingText).toBe(PWA_MESSAGES.INSTALL_PROMPT));

      act(() => {
        result.current.clearOnboardingText();
      });

      expect(result.current.onboardingText).toBeNull();
      // onboardingPhase はそのまま
      expect(result.current.onboardingPhase).toBe('install');
    });
  });
});
