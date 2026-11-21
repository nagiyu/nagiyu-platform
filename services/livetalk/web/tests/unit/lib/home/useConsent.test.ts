import { renderHook, act, waitFor } from '@testing-library/react';
import { useConsent } from '@/lib/home/useConsent';

const REVISED_RESPONSE = {
  consented: false,
  requiredVersions: { terms: '1.1.0', privacy: '1.1.0' },
  current: {
    termsAgreed: { version: '1.0.0', agreedAt: 1 },
    privacyAgreed: { version: '1.0.0', agreedAt: 1 },
    ageVerified: { value: true, verifiedAt: 1 },
  },
};

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

    it('current が無ければ初回のお知らせになる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            consented: false,
            requiredVersions: { terms: '1.1.0', privacy: '1.1.0' },
            current: null,
          }),
      });
      const { result } = renderHook(() => useConsent());
      await waitFor(() => expect(result.current.consentPhase).toBe('required'));
      expect(result.current.consentNotice).toEqual({ kind: 'initial' });
    });

    it('前の版の同意記録があれば改定のお知らせになる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve(REVISED_RESPONSE),
      });
      const { result } = renderHook(() => useConsent());
      await waitFor(() => expect(result.current.consentPhase).toBe('required'));
      expect(result.current.consentNotice.kind).toBe('revision');
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

  describe('requireConsent', () => {
    it('同意済みから requireConsent を呼ぶと consentPhase が required に戻る', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ json: () => Promise.resolve({ consented: true }) })
        .mockResolvedValueOnce({ json: () => Promise.resolve({ consented: false }) });
      const { result } = renderHook(() => useConsent());
      await waitFor(() => expect(result.current.consentPhase).toBe('done'));

      await act(async () => {
        await result.current.requireConsent();
      });

      expect(result.current.consentPhase).toBe('required');
    });

    it('requireConsent は同意の状態を取り直して、改定のお知らせに切り替える', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ json: () => Promise.resolve({ consented: true }) })
        .mockResolvedValueOnce({ json: () => Promise.resolve(REVISED_RESPONSE) });
      const { result } = renderHook(() => useConsent());
      await waitFor(() => expect(result.current.consentPhase).toBe('done'));

      await act(async () => {
        await result.current.requireConsent();
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.current.consentNotice.kind).toBe('revision');
    });

    it('取り直した結果が同意済みなら、ダイアログを出さずに done へ戻す', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ consented: true }),
      });
      const { result } = renderHook(() => useConsent());
      await waitFor(() => expect(result.current.consentPhase).toBe('done'));

      let pending: Promise<void> = Promise.resolve();
      act(() => {
        pending = result.current.requireConsent();
      });
      // 取り直している間は送信できない
      expect(result.current.consentPhase).toBe('checking');
      await act(async () => {
        await pending;
      });

      expect(result.current.consentPhase).toBe('done');
    });

    it('requireConsent で取得に失敗したら初回のお知らせで開く', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ json: () => Promise.resolve(REVISED_RESPONSE) })
        .mockRejectedValueOnce(new Error('ネットワークエラー'));
      const { result } = renderHook(() => useConsent());
      await waitFor(() => expect(result.current.consentNotice.kind).toBe('revision'));

      await act(async () => {
        await result.current.requireConsent();
      });

      expect(result.current.consentPhase).toBe('required');
      expect(result.current.consentNotice).toEqual({ kind: 'initial' });
    });

    it('requireConsent は安定した関数参照を持つ', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ consented: true }),
      });
      const { result, rerender } = renderHook(() => useConsent());
      await waitFor(() => expect(result.current.consentPhase).toBe('done'));

      const firstRef = result.current.requireConsent;
      rerender();
      expect(result.current.requireConsent).toBe(firstRef);
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
