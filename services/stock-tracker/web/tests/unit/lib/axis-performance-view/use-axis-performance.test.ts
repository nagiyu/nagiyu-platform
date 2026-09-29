/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import {
  resolveErrorMessage,
  useAxisPerformance,
} from '../../../../lib/axis-performance-view/use-axis-performance';
import { ERROR_MESSAGES } from '../../../../lib/axis-performance-view/constants';

describe('resolveErrorMessage', () => {
  it('ステータスに応じたメッセージを返す', () => {
    expect(resolveErrorMessage(401)).toBe(ERROR_MESSAGES.UNAUTHORIZED);
    expect(resolveErrorMessage(403)).toBe(ERROR_MESSAGES.UNAUTHORIZED);
    expect(resolveErrorMessage(400)).toBe(ERROR_MESSAGES.VALIDATION);
    expect(resolveErrorMessage(500)).toBe(ERROR_MESSAGES.SERVER);
    expect(resolveErrorMessage(302)).toBe(ERROR_MESSAGES.FETCH_FAILED);
  });
});

describe('useAxisPerformance', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('成功時にデータを返し、クエリを組み立てる', async () => {
    const body = { evaluatedCount: 1 };
    fetchMock.mockResolvedValue({ ok: true, json: async () => body });
    const { result } = renderHook(() => useAxisPerformance('VOL', '30d', 'JP'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(body);
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/axis-performance?question=VOL&period=30d&market=JP'
    );
  });

  it('HTTP エラーはメッセージにする', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const { result } = renderHook(() => useAxisPerformance('DIR', '90d', 'ALL'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(ERROR_MESSAGES.SERVER);
    expect(result.current.data).toBeNull();
  });

  it('通信失敗は取得失敗のメッセージにする', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useAxisPerformance('DIR', '90d', 'ALL'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(ERROR_MESSAGES.FETCH_FAILED);
  });

  it('中断は無視する', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const { result } = renderHook(() => useAxisPerformance('DIR', '90d', 'ALL'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('無効のときは取得しない', () => {
    renderHook(() => useAxisPerformance('DIR', '90d', 'ALL', false));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
