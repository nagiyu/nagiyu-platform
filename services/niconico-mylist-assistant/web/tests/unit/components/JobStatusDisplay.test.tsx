/**
 * JobStatusDisplay のユニットテスト
 *
 * fetch をモック化し、fake timers でポーリングを進めて、
 * 一時的な失敗からの復帰・回復しない失敗での停止・取得前の表示を検証する。
 */

// モック: niconico-mylist-assistant-core は DB 層を含み jsdom で読み込めないため、使う値だけ差し替える。正規表現は本物と同じ定義を使う
jest.mock('@nagiyu/niconico-mylist-assistant-core', () => ({
  TWO_FACTOR_AUTH_CODE_REGEX: /^\d{6}$/,
}));

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import JobStatusDisplay from '../../../src/components/JobStatusDisplay';
import { DEFAULT_POLLING_CONFIG } from '../../../src/types/job';

// @nagiyu/ui をスタブ化
jest.mock('@nagiyu/ui', () => ({
  Button: ({
    children,
    onClick,
    loading,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    loading?: boolean;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled || loading}>
      {children}
    </button>
  ),
  TextField: ({ label }: { label: string }) => <input aria-label={label} />,
  ErrorAlert: ({ message }: { message: string }) => (
    <div role="alert" data-testid="error-alert">
      {message}
    </div>
  ),
  Chip: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-chip">{children}</span>
  ),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

const RESULT = { registeredCount: 3, failedCount: 0, totalCount: 3 };

/**
 * ステータス取得の成功レスポンスを作る
 */
function statusResponse(status: string, result?: typeof RESULT) {
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
        completedAt: result ? '2024-01-01T00:02:00.000Z' : undefined,
      }),
  };
}

/**
 * 非 OK レスポンスを作る
 */
function errorResponse(status: number) {
  return { ok: false, status, json: () => Promise.resolve({}) };
}

/**
 * 保留中の非同期処理を流す
 */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * ポーリング 1 回分の時間を進める
 */
async function advancePolling() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(DEFAULT_POLLING_CONFIG.intervalMs);
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

describe('JobStatusDisplay - 取得前の表示', () => {
  it('取得前はステータスチップ・待機文言・日時を表示しない', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(<JobStatusDisplay jobId="job-1" />);

    expect(screen.getByText('ジョブID: job-1')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByTestId('status-chip')).not.toBeInTheDocument();
    expect(screen.queryByText('投入済み')).not.toBeInTheDocument();
    expect(screen.queryByText('ジョブの実行を待機中...')).not.toBeInTheDocument();
    expect(screen.queryByText(/作成日時/)).not.toBeInTheDocument();
    expect(screen.queryByText(/更新日時/)).not.toBeInTheDocument();
  });

  it('初回取得に失敗しても、ステータス・待機文言・日時・プログレスバーを表示しない', async () => {
    mockFetch.mockResolvedValue(errorResponse(500));

    render(<JobStatusDisplay jobId="job-1" />);
    await flush();

    expect(screen.getByTestId('error-alert')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('status-chip')).not.toBeInTheDocument();
    expect(screen.queryByText('投入済み')).not.toBeInTheDocument();
    expect(screen.queryByText('ジョブの実行を待機中...')).not.toBeInTheDocument();
    expect(screen.queryByText(/作成日時/)).not.toBeInTheDocument();
    expect(screen.queryByText(/更新日時/)).not.toBeInTheDocument();
  });

  it('取得成功後はステータスと日時を表示する', async () => {
    mockFetch.mockResolvedValue(statusResponse('SUBMITTED'));

    render(<JobStatusDisplay jobId="job-1" />);
    await flush();

    expect(screen.getByText('投入済み')).toBeInTheDocument();
    expect(screen.getByText('ジョブの実行を待機中...')).toBeInTheDocument();
    expect(screen.getByText(/作成日時/)).toBeInTheDocument();
    expect(screen.getByText(/更新日時/)).toBeInTheDocument();
  });
});

describe('JobStatusDisplay - 一時的な取得失敗', () => {
  it('ネットワークエラーのあと、次の取得で復帰してエラー表示が消える', async () => {
    const onError = jest.fn();
    mockFetch
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(statusResponse('RUNNING'));

    render(<JobStatusDisplay jobId="job-1" onError={onError} />);
    await flush();

    expect(screen.getByTestId('error-alert')).toHaveTextContent('network down');

    await advancePolling();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('error-alert')).not.toBeInTheDocument();
    expect(screen.getByText('実行中')).toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
  });

  it('404 以外の非 OK 応答でもポーリングを続け、onError を呼ばない', async () => {
    const onError = jest.fn();
    mockFetch.mockResolvedValue(errorResponse(500));

    render(<JobStatusDisplay jobId="job-1" onError={onError} />);
    await flush();
    await advancePolling();
    await advancePolling();

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('error-alert')).toHaveTextContent(
      'ジョブステータスの取得に失敗しました'
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('取得できたあとの一時的な失敗では、最後の状態の表示を残す', async () => {
    mockFetch
      .mockResolvedValueOnce(statusResponse('RUNNING'))
      .mockResolvedValueOnce(errorResponse(503));

    render(<JobStatusDisplay jobId="job-1" />);
    await flush();
    await advancePolling();

    expect(screen.getByTestId('error-alert')).toBeInTheDocument();
    expect(screen.getByText('実行中')).toBeInTheDocument();
    expect(screen.getByText(/作成日時/)).toBeInTheDocument();
  });
});

describe('JobStatusDisplay - 404', () => {
  it('ポーリングを停止してエラーを表示し、onError を 1 回だけ呼ぶ', async () => {
    const onError = jest.fn();
    mockFetch.mockResolvedValue(errorResponse(404));

    render(<JobStatusDisplay jobId="job-1" onError={onError} />);
    await flush();

    expect(screen.getByTestId('error-alert')).toHaveTextContent(
      COMMON_ERROR_MESSAGES.JOB_NOT_FOUND
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(COMMON_ERROR_MESSAGES.JOB_NOT_FOUND);

    await advancePolling();
    await advancePolling();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('JobStatusDisplay - 完了時のコールバック', () => {
  it('SUCCEEDED で onComplete を 1 回呼び、ポーリングを停止する', async () => {
    const onComplete = jest.fn();
    const onError = jest.fn();
    mockFetch.mockResolvedValue(statusResponse('SUCCEEDED', RESULT));

    render(<JobStatusDisplay jobId="job-1" onComplete={onComplete} onError={onError} />);
    await flush();
    await advancePolling();

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(RESULT);
    expect(onError).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('FAILED で onError を 1 回呼び、ポーリングを停止する', async () => {
    const onComplete = jest.fn();
    const onError = jest.fn();
    mockFetch.mockResolvedValue(statusResponse('FAILED', RESULT));

    render(<JobStatusDisplay jobId="job-1" onComplete={onComplete} onError={onError} />);
    await flush();
    await advancePolling();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('ジョブが失敗しました');
    expect(onComplete).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('JobStatusDisplay - タイムアウト', () => {
  it('最大試行回数に達したらポーリングを停止してタイムアウトを表示する', async () => {
    const onError = jest.fn();
    mockFetch.mockResolvedValue(statusResponse('RUNNING'));

    render(<JobStatusDisplay jobId="job-1" onError={onError} />);
    await flush();

    const maxAttempts = DEFAULT_POLLING_CONFIG.maxAttempts as number;
    for (let i = 0; i < maxAttempts; i++) {
      await advancePolling();
    }

    expect(screen.getByTestId('error-alert')).toHaveTextContent(
      'ジョブステータスの取得がタイムアウトしました'
    );
    const callCount = mockFetch.mock.calls.length;
    await advancePolling();
    expect(mockFetch).toHaveBeenCalledTimes(callCount);
  });
});
