import { renderHook, act, waitFor } from '@testing-library/react';
import { usePendingNotifications } from '@/lib/home/usePendingNotifications';

afterEach(() => {
  jest.clearAllMocks();
});

describe('usePendingNotifications', () => {
  describe('初期値', () => {
    it('初期状態は pendingNotifications が空配列', () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      const { result } = renderHook(() => usePendingNotifications());
      expect(result.current.pendingNotifications).toEqual([]);
    });
  });

  describe('/api/push/pending 取得', () => {
    it('マウント時に /api/push/pending を取得する', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      renderHook(() => usePendingNotifications());

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/push/pending');
      });
    });

    it('通知データがある場合は pendingNotifications が更新される', async () => {
      const pendingData = [
        { characterId: 'ageha', notifId: 'n1', body: 'アゲハより' },
        { characterId: 'koharu', notifId: 'n2', body: '小春より' },
      ];
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(pendingData),
      });

      const { result } = renderHook(() => usePendingNotifications());
      await waitFor(() => expect(result.current.pendingNotifications).toHaveLength(2));
      expect(result.current.pendingNotifications[0].characterId).toBe('ageha');
      expect(result.current.pendingNotifications[1].characterId).toBe('koharu');
    });

    it('空配列のとき pendingNotifications が空のまま', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      const { result } = renderHook(() => usePendingNotifications());
      await act(async () => {});
      expect(result.current.pendingNotifications).toEqual([]);
    });

    it('ok: false のとき pendingNotifications が空のまま', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false });
      const { result } = renderHook(() => usePendingNotifications());
      await act(async () => {});
      expect(result.current.pendingNotifications).toEqual([]);
    });

    it('fetch 失敗時はクラッシュせず pendingNotifications が空のまま', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ネットワークエラー'));
      const { result } = renderHook(() => usePendingNotifications());
      await act(async () => {});
      expect(result.current.pendingNotifications).toEqual([]);
    });

    it('マウント後の再レンダリングでは再 fetch しない', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      const { rerender } = renderHook(() => usePendingNotifications());
      await act(async () => {});
      rerender();
      rerender();
      // マウント時の 1 回のみ
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
