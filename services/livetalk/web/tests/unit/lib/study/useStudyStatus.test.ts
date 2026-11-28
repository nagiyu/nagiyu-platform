import { renderHook, waitFor } from '@testing-library/react';
import { useStudyStatus } from '@/lib/study/useStudyStatus';

afterEach(() => jest.clearAllMocks());

describe('useStudyStatus', () => {
  it('取得した状態を返す', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ state: 'trial', remainingDays: 2 }),
    });
    const { result } = renderHook(() => useStudyStatus(true));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual({ state: 'trial', remainingDays: 2 }));
    expect(global.fetch).toHaveBeenCalledWith('/api/study-status');
  });

  it('ok でない応答は null のまま', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    const { result } = renderHook(() => useStudyStatus(true));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('通信が失敗しても null のまま', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useStudyStatus(true));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('アンマウント後に届いた応答は反映しない', async () => {
    let resolveJson: (v: unknown) => void = () => undefined;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => new Promise((r) => (resolveJson = r)),
    });
    const { result, unmount } = renderHook(() => useStudyStatus(true));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    unmount();
    resolveJson({ state: 'ended' });
    await Promise.resolve();
    expect(result.current).toBeNull();
  });

  it('有効になるまでは取得せず、有効になったら取得する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ state: 'trial', remainingDays: 7 }),
    });
    const { result, rerender } = renderHook(({ enabled }) => useStudyStatus(enabled), {
      initialProps: { enabled: false },
    });
    await Promise.resolve();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current).toBeNull();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current).toEqual({ state: 'trial', remainingDays: 7 }));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
