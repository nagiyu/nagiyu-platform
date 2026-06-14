import { renderHook, act } from '@testing-library/react';
import { useAudioContext } from '@/lib/audio/useAudioContext';

/** window.AudioContext をモック化し、cleanup 用のリストアを返す */
function setupMockAudioContext(state: 'suspended' | 'running' = 'suspended') {
  const mockResume = jest.fn().mockResolvedValue(undefined);
  const instance = { state, resume: mockResume };
  const MockAudioContext = jest.fn(() => instance);

  Object.defineProperty(window, 'AudioContext', {
    writable: true,
    configurable: true,
    value: MockAudioContext,
  });

  return { MockAudioContext, instance, mockResume };
}

/** window.AudioContext と window.webkitAudioContext を両方 undefined にする */
function removeAudioContext() {
  Object.defineProperty(window, 'AudioContext', {
    writable: true,
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(window, 'webkitAudioContext', {
    writable: true,
    configurable: true,
    value: undefined,
  });
}

afterEach(() => {
  jest.clearAllMocks();
  removeAudioContext();
});

describe('useAudioContext', () => {
  describe('AudioContext 作成と resume', () => {
    it('初期値は audioContext が null', () => {
      const { result } = renderHook(() => useAudioContext());
      expect(result.current.audioContext).toBeNull();
    });

    it('ensureUnlocked 呼び出しで AudioContext が作成される（suspended 状態）', async () => {
      const { MockAudioContext, mockResume } = setupMockAudioContext('suspended');
      const { result } = renderHook(() => useAudioContext());

      await act(async () => {
        await result.current.ensureUnlocked();
      });

      expect(MockAudioContext).toHaveBeenCalledTimes(1);
      expect(result.current.audioContext).not.toBeNull();
      // suspended 状態なので resume が呼ばれる
      expect(mockResume).toHaveBeenCalledTimes(1);
    });

    it('AudioContext が running 状態のとき resume は呼ばれない', async () => {
      const { MockAudioContext, mockResume } = setupMockAudioContext('running');
      const { result } = renderHook(() => useAudioContext());

      await act(async () => {
        await result.current.ensureUnlocked();
      });

      expect(MockAudioContext).toHaveBeenCalledTimes(1);
      expect(mockResume).not.toHaveBeenCalled();
    });

    it('2 回目の ensureUnlocked では AudioContext を再生成しない', async () => {
      const { MockAudioContext, mockResume } = setupMockAudioContext('suspended');
      const { result } = renderHook(() => useAudioContext());

      await act(async () => {
        await result.current.ensureUnlocked();
      });
      await act(async () => {
        await result.current.ensureUnlocked();
      });

      // インスタンスは 1 回だけ作成される
      expect(MockAudioContext).toHaveBeenCalledTimes(1);
      // 2 回とも suspended 状態として mockResume が呼ばれる（インスタンスの state は変化しないモック）
      expect(mockResume).toHaveBeenCalledTimes(2);
    });
  });

  describe('webkitAudioContext フォールバック', () => {
    it('window.AudioContext が undefined のとき webkitAudioContext を使用する', async () => {
      const mockResume = jest.fn().mockResolvedValue(undefined);
      const instance = { state: 'suspended', resume: mockResume };
      const MockWebkitAudioContext = jest.fn(() => instance);

      removeAudioContext();
      Object.defineProperty(window, 'webkitAudioContext', {
        writable: true,
        configurable: true,
        value: MockWebkitAudioContext,
      });

      const { result } = renderHook(() => useAudioContext());

      await act(async () => {
        await result.current.ensureUnlocked();
      });

      expect(MockWebkitAudioContext).toHaveBeenCalledTimes(1);
      expect(mockResume).toHaveBeenCalledTimes(1);
      expect(result.current.audioContext).not.toBeNull();
    });
  });

  describe('AudioContext 不在環境', () => {
    it('AudioContext が利用不可の環境でもクラッシュしない', async () => {
      removeAudioContext();
      const { result } = renderHook(() => useAudioContext());

      await expect(
        act(async () => {
          await result.current.ensureUnlocked();
        })
      ).resolves.toBeUndefined();

      expect(result.current.audioContext).toBeNull();
    });

    it('AudioContext 不在環境では getContext が null を返す', async () => {
      removeAudioContext();
      const { result } = renderHook(() => useAudioContext());

      await act(async () => {
        await result.current.ensureUnlocked();
      });

      expect(result.current.getContext()).toBeNull();
    });
  });

  describe('getContext（同期参照）', () => {
    it('ensureUnlocked 前は getContext が null を返す', () => {
      setupMockAudioContext('suspended');
      const { result } = renderHook(() => useAudioContext());
      expect(result.current.getContext()).toBeNull();
    });

    it('ensureUnlocked 後は getContext が AudioContext インスタンスを返す', async () => {
      setupMockAudioContext('suspended');
      const { result } = renderHook(() => useAudioContext());

      await act(async () => {
        await result.current.ensureUnlocked();
      });

      expect(result.current.getContext()).not.toBeNull();
    });

    it('getContext と audioContext state は同じインスタンスを指す', async () => {
      setupMockAudioContext('running');
      const { result } = renderHook(() => useAudioContext());

      await act(async () => {
        await result.current.ensureUnlocked();
      });

      expect(result.current.getContext()).toBe(result.current.audioContext);
    });
  });
});
