import { renderHook, act, waitFor } from '@testing-library/react';
import { useConsent } from '@/lib/home/useConsent';

afterEach(() => {
  jest.clearAllMocks();
});

describe('useConsent', () => {
  describe('初期値', () => {
    it('初期状態は checking', () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ consented: true }),
      });
      const { result } = renderHook(() => useConsent());
      expect(result.current.consentPhase).toBe('checking');
    });
  });

  describe('/api/consent 取得', () => {
    it('consented: true のとき consentPhase が done になる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ consented: true }),
      });
      const { result } = renderHook(() => useConsent());
      await waitFor(() => expect(result.current.consentPhase).toBe('done'));
    });

    it('consented: false のとき consentPhase が required になる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ consented: false }),
      });
      const { result } = renderHook(() => useConsent());
      await waitFor(() => expect(result.current.consentPhase).toBe('required'));
    });

    it('取得失敗時は consentPhase が required になる', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ネットワークエラー'));
      const { result } = renderHook(() => useConsent());
      await waitFor(() => expect(result.current.consentPhase).toBe('required'));
    });

    it('/api/consent に fetch が呼ばれる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ consented: true }),
      });
      renderHook(() => useConsent());
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/consent'));
    });
  });

  describe('markConsented', () => {
    it('markConsented を呼ぶと consentPhase が done になる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ consented: false }),
      });
      const { result } = renderHook(() => useConsent());
      await waitFor(() => expect(result.current.consentPhase).toBe('required'));

      act(() => {
        result.current.markConsented();
      });

      expect(result.current.consentPhase).toBe('done');
    });

    it('markConsented は安定した関数参照を持つ', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ consented: true }),
      });
      const { result, rerender } = renderHook(() => useConsent());
      await waitFor(() => expect(result.current.consentPhase).toBe('done'));

      const firstRef = result.current.markConsented;
      rerender();
      expect(result.current.markConsented).toBe(firstRef);
    });
  });
});
