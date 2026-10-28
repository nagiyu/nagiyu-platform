/**
 * JobStatusPageClient のユニットテスト
 *
 * 通知 (Snackbar) は完了時だけ出し、失敗は JobStatusDisplay の画面内表示に任せることを検証する。
 * JobStatusDisplay は実物を使い、fetch のみモック化する。
 */

// モック: niconico-mylist-assistant-core は DB 層を含み jsdom で読み込めないため、使う値だけ差し替える
jest.mock('@nagiyu/niconico-mylist-assistant-core', () => ({
  TWO_FACTOR_AUTH_CODE_REGEX: /^\d{6}$/,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@nagiyu/ui', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  TextField: ({ label }: { label: string }) => <input aria-label={label} />,
  ErrorAlert: ({ message }: { message: string }) => <div data-testid="error-alert">{message}</div>,
  Chip: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import JobStatusPageClient from '../../../src/components/JobStatusPageClient';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const RESULT = { registeredCount: 3, failedCount: 1, totalCount: 4 };

function statusResponse(status: string, result?: object) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        jobId: 'job-1',
        status,
        result,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:01:00.000Z',
      }),
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('JobStatusPageClient - 通知', () => {
  it('ジョブが完了すると、件数入りの完了通知が出る', async () => {
    mockFetch.mockResolvedValue(statusResponse('SUCCEEDED', RESULT));

    render(<JobStatusPageClient jobId="job-1" />);
    await flush();

    expect(
      screen.getByText('マイリスト登録が完了しました！ (成功: 3件, 失敗: 1件)')
    ).toBeInTheDocument();
  });

  it('存在しないジョブでは、エラーが画面内に 1 回だけ出て通知は出ない', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({}) });

    render(<JobStatusPageClient jobId="job-1" />);
    await flush();

    expect(screen.getAllByText(COMMON_ERROR_MESSAGES.JOB_NOT_FOUND)).toHaveLength(1);
    expect(screen.getByTestId('error-alert')).toBeInTheDocument();
    expect(screen.queryByText(/エラーが発生しました/)).not.toBeInTheDocument();
  });

  it('ジョブが失敗しても通知は出ない', async () => {
    mockFetch.mockResolvedValue(statusResponse('FAILED', { ...RESULT, errorMessage: '失敗' }));

    render(<JobStatusPageClient jobId="job-1" />);
    await flush();

    expect(screen.queryByText(/エラーが発生しました/)).not.toBeInTheDocument();
    expect(screen.queryByText(/完了しました！/)).not.toBeInTheDocument();
  });

  it('通知の表示と自動クローズで親が再描画されても、取得は増えない', async () => {
    mockFetch.mockResolvedValue(statusResponse('SUCCEEDED', RESULT));

    render(<JobStatusPageClient jobId="job-1" />);
    await flush();
    // 通知の自動クローズ (6 秒) による再描画をまたぐ
    await act(async () => {
      await jest.advanceTimersByTimeAsync(7000);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
