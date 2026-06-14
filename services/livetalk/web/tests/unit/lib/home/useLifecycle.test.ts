import { renderHook, act, waitFor } from '@testing-library/react';
import { useLifecycle } from '@/lib/home/useLifecycle';

afterEach(() => {
  jest.clearAllMocks();
});

describe('useLifecycle', () => {
  describe('初期値', () => {
    it('初期状態は lifecycleState が awake', () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ state: 'awake' }),
      });
      const { result } = renderHook(() => useLifecycle('hiyori'));
      expect(result.current.lifecycleState).toBe('awake');
    });
  });

  describe('/api/lifecycle 取得', () => {
    it('characterId 付きで /api/lifecycle を取得する', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ state: 'awake' }),
      });
      renderHook(() => useLifecycle('hiyori'));

      await waitFor(() => {
        const calls = (global.fetch as jest.Mock).mock.calls.map(([url]: [string]) => url);
        expect(calls.some((url) => url.includes('/api/lifecycle?characterId=hiyori'))).toBe(true);
      });
    });

    it('state: sleeping が返ったとき lifecycleState が sleeping になる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ state: 'sleeping' }),
      });

      const { result } = renderHook(() => useLifecycle('hiyori'));
      await waitFor(() => expect(result.current.lifecycleState).toBe('sleeping'));
    });

    it('state: awake が返ったとき lifecycleState が awake になる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ state: 'sleeping' }),
      });

      const { result } = renderHook(() => useLifecycle('hiyori'));
      await waitFor(() => expect(result.current.lifecycleState).toBe('sleeping'));

      // awake に戻る fetch
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ state: 'awake' }),
      });
    });

    it('fetch 失敗時は初期値 awake を維持する', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ネットワークエラー'));
      const { result } = renderHook(() => useLifecycle('hiyori'));
      await act(async () => {});
      expect(result.current.lifecycleState).toBe('awake');
    });

    it('不明な state 値が返ってきた場合は state を更新しない', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ state: 'unknown-state' }),
      });
      const { result } = renderHook(() => useLifecycle('hiyori'));
      await act(async () => {});
      // 有効な state 以外は無視して初期値 awake のまま
      expect(result.current.lifecycleState).toBe('awake');
    });
  });

  describe('characterId が変わったとき', () => {
    it('characterId が変わると再 fetch する', async () => {
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ state: 'awake' }),
        });
      });

      const { rerender } = renderHook(({ characterId }) => useLifecycle(characterId), {
        initialProps: { characterId: 'hiyori' },
      });
      await waitFor(() => expect(callCount).toBe(1));

      rerender({ characterId: 'ageha' });
      await waitFor(() => expect(callCount).toBe(2));
    });
  });

  describe('setLifecycleState（公開）', () => {
    it('setLifecycleState を呼ぶと lifecycleState が更新される', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ state: 'awake' }),
      });

      const { result } = renderHook(() => useLifecycle('hiyori'));
      await waitFor(() => expect(result.current.lifecycleState).toBe('awake'));

      act(() => {
        result.current.setLifecycleState('sleeping');
      });
      expect(result.current.lifecycleState).toBe('sleeping');
    });

    it('setLifecycleState は安定した関数参照を持つ', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ state: 'awake' }),
      });
      const { result, rerender } = renderHook(() => useLifecycle('hiyori'));
      await waitFor(() => expect(result.current.lifecycleState).toBe('awake'));

      const firstRef = result.current.setLifecycleState;
      rerender();
      expect(result.current.setLifecycleState).toBe(firstRef);
    });
  });
});
