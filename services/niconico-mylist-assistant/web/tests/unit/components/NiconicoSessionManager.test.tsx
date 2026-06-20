/**
 * NiconicoSessionManager のユニットテスト
 *
 * fetch をモック化してセッション状態取得・保存・削除の挙動を検証する。
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NiconicoSessionManager from '../../../src/components/NiconicoSessionManager';

// MUI と @nagiyu/ui をスタブ化
jest.mock('@nagiyu/ui', () => ({
  Button: ({
    children,
    onClick,
    loading,
    disabled,
    type,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    loading?: boolean;
    disabled?: boolean;
    type?: string;
    [key: string]: unknown;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      type={type as 'button' | 'submit' | 'reset'}
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  ),
  TextField: ({
    label,
    value,
    onChange,
    helperText,
    type,
  }: {
    label: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    helperText?: string;
    type?: string;
  }) => (
    <div>
      <label>{label}</label>
      <input type={type || 'text'} value={value} onChange={onChange} aria-label={label} />
      {helperText && <span>{helperText}</span>}
    </div>
  ),
  ErrorAlert: ({ message }: { message: string }) => (
    <div role="alert" data-testid="error-alert">
      {message}
    </div>
  ),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

/**
 * セッション状態レスポンスのモック
 */
function mockSessionResponse(status: {
  hasSession: boolean;
  validity?: 'valid' | 'invalid' | 'unknown';
  acquiredAt?: number;
  estimatedExpiresAt?: number;
}) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(status),
    headers: { get: () => 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NiconicoSessionManager - 状態表示', () => {
  it('未登録状態を表示する', async () => {
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));

    render(<NiconicoSessionManager />);

    // 状態確認中は「確認中」テキストが表示される
    expect(screen.getByText('状態を確認中...')).toBeInTheDocument();

    // 未登録状態が表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText('未登録')).toBeInTheDocument();
    });
  });

  it('有効セッションを表示する', async () => {
    mockFetch.mockReturnValueOnce(
      mockSessionResponse({
        hasSession: true,
        validity: 'valid',
        acquiredAt: 1700000000000,
        estimatedExpiresAt: Date.now() + 10 * 24 * 60 * 60 * 1000, // 10日後
      })
    );

    render(<NiconicoSessionManager />);

    await waitFor(() => {
      expect(screen.getByText('有効')).toBeInTheDocument();
    });
  });

  it('無効セッションを表示する', async () => {
    mockFetch.mockReturnValueOnce(
      mockSessionResponse({
        hasSession: true,
        validity: 'invalid',
        acquiredAt: 1700000000000,
        estimatedExpiresAt: 1702592000000,
      })
    );

    render(<NiconicoSessionManager />);

    await waitFor(() => {
      expect(screen.getByText('無効')).toBeInTheDocument();
    });
  });

  it('判定不能セッションを表示する', async () => {
    mockFetch.mockReturnValueOnce(
      mockSessionResponse({
        hasSession: true,
        validity: 'unknown',
        acquiredAt: 1700000000000,
        estimatedExpiresAt: 1702592000000,
      })
    );

    render(<NiconicoSessionManager />);

    await waitFor(() => {
      expect(screen.getByText('判定不能')).toBeInTheDocument();
    });
  });

  it('セッション取得エラー時にエラーメッセージを表示する', async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ message: 'セッション状態の取得に失敗しました' }),
        headers: { get: () => 'application/json' },
      })
    );

    render(<NiconicoSessionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('error-alert')).toBeInTheDocument();
    });
  });
});

describe('NiconicoSessionManager - セッション保存', () => {
  it('user_session 入力フォームが表示される', async () => {
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));

    render(<NiconicoSessionManager />);

    await waitFor(() => {
      expect(screen.getByLabelText('user_session')).toBeInTheDocument();
    });
  });

  it('フォーム送信で POST /api/niconico/session が呼ばれる', async () => {
    // 初回: GET でセッション状態
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));
    // 二回目: POST でセッション保存
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            message: 'ニコニコセッションを保存しました',
            acquiredAt: Date.now(),
            estimatedExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          }),
        headers: { get: () => 'application/json' },
      })
    );
    // 三回目: 状態再取得
    mockFetch.mockReturnValueOnce(
      mockSessionResponse({
        hasSession: true,
        validity: 'valid',
        acquiredAt: Date.now(),
        estimatedExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      })
    );

    render(<NiconicoSessionManager />);

    // フォームが表示されるのを待つ
    await waitFor(() => {
      expect(screen.getByLabelText('user_session')).toBeInTheDocument();
    });

    // user_session を入力
    fireEvent.change(screen.getByLabelText('user_session'), {
      target: { value: 'test-session-value' },
    });

    // フォームを送信
    fireEvent.click(screen.getByText('セッションを保存'));

    await waitFor(() => {
      // POST が呼ばれたことを確認
      const postCall = mockFetch.mock.calls.find(
        (call: Parameters<typeof fetch>) => call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      expect(postCall?.[0]).toBe('/api/niconico/session');
    });
  });

  it('空文字入力でバリデーションエラーが表示される', async () => {
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));

    render(<NiconicoSessionManager />);

    await waitFor(() => {
      expect(screen.getByLabelText('user_session')).toBeInTheDocument();
    });

    // 空のまま送信
    fireEvent.click(screen.getByText('セッションを保存'));

    await waitFor(() => {
      expect(screen.getByTestId('error-alert')).toBeInTheDocument();
    });
  });

  it('保存成功後に成功メッセージが表示される', async () => {
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            message: 'ニコニコセッションを保存しました',
            acquiredAt: Date.now(),
            estimatedExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          }),
        headers: { get: () => 'application/json' },
      })
    );
    mockFetch.mockReturnValueOnce(
      mockSessionResponse({
        hasSession: true,
        validity: 'valid',
        acquiredAt: Date.now(),
        estimatedExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      })
    );

    render(<NiconicoSessionManager />);

    await waitFor(() => {
      expect(screen.getByLabelText('user_session')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('user_session'), {
      target: { value: 'valid-session' },
    });

    fireEvent.click(screen.getByText('セッションを保存'));

    await waitFor(() => {
      expect(screen.getByText('セッションを保存しました')).toBeInTheDocument();
    });
  });

  it('保存失敗時にエラーメッセージが表示される', async () => {
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        json: () =>
          Promise.resolve({
            message: 'user_session が無効です。',
          }),
        headers: { get: () => 'application/json' },
      })
    );

    render(<NiconicoSessionManager />);

    await waitFor(() => {
      expect(screen.getByLabelText('user_session')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('user_session'), {
      target: { value: 'invalid-session' },
    });

    fireEvent.click(screen.getByText('セッションを保存'));

    await waitFor(() => {
      expect(screen.getByTestId('error-alert')).toBeInTheDocument();
    });
  });
});

describe('NiconicoSessionManager - セッション削除', () => {
  it('セッション保存済みの場合に削除ボタンが表示される', async () => {
    mockFetch.mockReturnValueOnce(
      mockSessionResponse({
        hasSession: true,
        validity: 'valid',
        acquiredAt: 1700000000000,
        estimatedExpiresAt: 1702592000000,
      })
    );

    render(<NiconicoSessionManager />);

    // ボタン要素（role=button）として削除ボタンを探す
    await waitFor(() => {
      const deleteButtons = screen.getAllByText('セッションを削除');
      // h6 と button の両方がある場合、button 要素の方を探す
      const deleteButton = deleteButtons.find((el) => el.tagName.toLowerCase() === 'button');
      expect(deleteButton).toBeDefined();
    });
  });

  it('未登録の場合は削除ボタンが表示されない', async () => {
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));

    render(<NiconicoSessionManager />);

    await waitFor(() => {
      // 削除ボタン（button 要素）が存在しないことを確認
      const deleteButton = screen.queryByRole('button', { name: /セッションを削除/ });
      expect(deleteButton).not.toBeInTheDocument();
    });
  });

  it('削除ボタンクリックで DELETE /api/niconico/session が呼ばれる', async () => {
    // 初回: GET でセッション状態（保存済み）
    mockFetch.mockReturnValueOnce(
      mockSessionResponse({
        hasSession: true,
        validity: 'valid',
        acquiredAt: 1700000000000,
        estimatedExpiresAt: 1702592000000,
      })
    );
    // 二回目: DELETE でセッション削除
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ message: 'ニコニコセッションを削除しました' }),
        headers: { get: () => 'application/json' },
      })
    );
    // 三回目: 削除後の状態再取得
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));

    render(<NiconicoSessionManager />);

    // ボタン要素として削除ボタンを探す
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'セッションを削除' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'セッションを削除' }));

    await waitFor(() => {
      const deleteCall = mockFetch.mock.calls.find(
        (call: Parameters<typeof fetch>) => call[1]?.method === 'DELETE'
      );
      expect(deleteCall).toBeDefined();
      expect(deleteCall?.[0]).toBe('/api/niconico/session');
    });
  });

  it('削除失敗時にエラーメッセージが表示される', async () => {
    mockFetch.mockReturnValueOnce(
      mockSessionResponse({
        hasSession: true,
        validity: 'valid',
        acquiredAt: 1700000000000,
        estimatedExpiresAt: 1702592000000,
      })
    );
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ message: 'セッションの削除に失敗しました' }),
        headers: { get: () => 'application/json' },
      })
    );

    render(<NiconicoSessionManager />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'セッションを削除' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'セッションを削除' }));

    await waitFor(() => {
      expect(screen.getByTestId('error-alert')).toBeInTheDocument();
    });
  });
});

describe('NiconicoSessionManager - onStatusChange コールバック', () => {
  it('未登録状態取得後に onStatusChange が呼ばれる', async () => {
    const onStatusChange = jest.fn();

    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));

    render(<NiconicoSessionManager onStatusChange={onStatusChange} />);

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          hasSession: false,
        })
      );
    });
  });

  it('有効セッション取得後に onStatusChange が valid で呼ばれる', async () => {
    const onStatusChange = jest.fn();

    mockFetch.mockReturnValueOnce(
      mockSessionResponse({
        hasSession: true,
        validity: 'valid',
        acquiredAt: 1700000000000,
        estimatedExpiresAt: Date.now() + 10 * 24 * 60 * 60 * 1000,
      })
    );

    render(<NiconicoSessionManager onStatusChange={onStatusChange} />);

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledTimes(1);
    });

    const calledWith = onStatusChange.mock.calls[0][0] as { hasSession: boolean; validity: string };
    expect(calledWith.hasSession).toBe(true);
    expect(calledWith.validity).toBe('valid');
  });
});
