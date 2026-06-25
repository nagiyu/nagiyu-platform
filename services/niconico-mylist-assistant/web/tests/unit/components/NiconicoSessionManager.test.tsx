/**
 * NiconicoSessionManager のユニットテスト
 *
 * fetch をモック化してセッション状態取得・保存・削除の挙動を検証する。
 * コンパクト表示とダイアログの開閉・操作を含む。
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
    form,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    loading?: boolean;
    disabled?: boolean;
    type?: string;
    form?: string;
    [key: string]: unknown;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      type={type as 'button' | 'submit' | 'reset'}
      form={form}
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
  Chip: ({
    children,
    color,
    size,
    variant,
    ...props
  }: {
    children: React.ReactNode;
    color?: string;
    size?: string;
    variant?: string;
    [key: string]: unknown;
  }) => (
    <span
      data-testid="session-chip"
      data-color={color}
      data-size={size}
      data-variant={variant}
      {...(props as React.HTMLAttributes<HTMLSpanElement>)}
    >
      {children}
    </span>
  ),
}));

// MUI の Dialog をスタブ化（open prop に応じて中身を描画する）
jest.mock('@mui/material', () => {
  const actual = jest.requireActual('@mui/material') as Record<string, unknown>;
  return {
    ...actual,
    Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
      open ? <div role="dialog">{children}</div> : null,
    DialogTitle: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="dialog-title">{children}</div>
    ),
    DialogContent: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="dialog-content">{children}</div>
    ),
    DialogActions: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="dialog-actions">{children}</div>
    ),
  };
});

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

describe('NiconicoSessionManager - コンパクト表示', () => {
  it('ローディング中は「確認中...」を表示する', () => {
    // fetch を pending のままにする
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    render(<NiconicoSessionManager />);

    expect(screen.getByText('確認中...')).toBeInTheDocument();
  });

  it('未登録状態をチップで表示する', async () => {
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));

    render(<NiconicoSessionManager />);

    await waitFor(() => {
      const chip = screen.getByTestId('session-chip');
      expect(chip).toHaveTextContent('未登録');
    });
  });

  it('有効セッションをチップで表示する', async () => {
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
      const chip = screen.getByTestId('session-chip');
      expect(chip).toHaveTextContent('有効');
      expect(chip).toHaveAttribute('data-color', 'success');
    });
  });

  it('無効セッションをチップで表示する', async () => {
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
      const chip = screen.getByTestId('session-chip');
      expect(chip).toHaveTextContent('無効');
      // @nagiyu/ui の Chip は ChipColor 型を使用するため 'danger' が正
      expect(chip).toHaveAttribute('data-color', 'danger');
    });
  });

  it('判定不能セッションをチップで表示する', async () => {
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
      const chip = screen.getByTestId('session-chip');
      expect(chip).toHaveTextContent('判定不能');
      expect(chip).toHaveAttribute('data-color', 'warning');
    });
  });

  it('セッション取得エラー時に「取得失敗」を表示する', async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ message: 'セッション状態の取得に失敗しました' }),
        headers: { get: () => 'application/json' },
      })
    );

    render(<NiconicoSessionManager />);

    await waitFor(() => {
      expect(screen.getByText('取得失敗')).toBeInTheDocument();
    });
  });

  it('「セッション管理」ボタンが常時表示されている', async () => {
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));

    render(<NiconicoSessionManager />);

    expect(screen.getByText('セッション管理')).toBeInTheDocument();
  });
});

describe('NiconicoSessionManager - ダイアログ開閉', () => {
  it('「セッション管理」ボタンクリックでダイアログが開く', async () => {
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));

    render(<NiconicoSessionManager />);

    // 初期状態ではダイアログが存在しない
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('セッション管理'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('「閉じる」ボタンクリックでダイアログが閉じる', async () => {
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));

    render(<NiconicoSessionManager />);

    // ダイアログを開く
    fireEvent.click(screen.getByText('セッション管理'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // 「閉じる」ボタンでダイアログを閉じる
    fireEvent.click(screen.getByText('閉じる'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ダイアログを開くたびに入力値がリセットされる', async () => {
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));

    render(<NiconicoSessionManager />);

    // ダイアログを開いて入力
    fireEvent.click(screen.getByText('セッション管理'));
    fireEvent.change(screen.getByLabelText('user_session'), {
      target: { value: 'some-session-value' },
    });
    expect(screen.getByLabelText('user_session')).toHaveValue('some-session-value');

    // ダイアログを閉じて再び開く
    fireEvent.click(screen.getByText('閉じる'));
    fireEvent.click(screen.getByText('セッション管理'));

    // 入力値がリセットされていることを確認
    expect(screen.getByLabelText('user_session')).toHaveValue('');
  });
});

describe('NiconicoSessionManager - ダイアログ内のセッション状態表示', () => {
  it('ダイアログ内で現在の状態が表示される', async () => {
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));

    render(<NiconicoSessionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('session-chip')).toBeInTheDocument();
    });

    // ダイアログを開く
    fireEvent.click(screen.getByText('セッション管理'));

    // ダイアログ内にも状態が表示される
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
  });
});

describe('NiconicoSessionManager - セッション保存', () => {
  it('ダイアログ内に user_session 入力フォームが表示される', async () => {
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));

    render(<NiconicoSessionManager />);

    fireEvent.click(screen.getByText('セッション管理'));

    expect(screen.getByLabelText('user_session')).toBeInTheDocument();
  });

  it('「セッションを保存」ボタンクリックで POST /api/niconico/session が呼ばれる', async () => {
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

    // ダイアログを開く
    fireEvent.click(screen.getByText('セッション管理'));

    // user_session を入力
    fireEvent.change(screen.getByLabelText('user_session'), {
      target: { value: 'test-session-value' },
    });

    // 「セッションを保存」ボタンをクリック
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

    fireEvent.click(screen.getByText('セッション管理'));

    // 空のまま「セッションを保存」ボタンをクリック
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

    fireEvent.click(screen.getByText('セッション管理'));

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

    fireEvent.click(screen.getByText('セッション管理'));

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
  it('セッション保存済みの場合にダイアログ内で削除ボタンが表示される', async () => {
    mockFetch.mockReturnValueOnce(
      mockSessionResponse({
        hasSession: true,
        validity: 'valid',
        acquiredAt: 1700000000000,
        estimatedExpiresAt: 1702592000000,
      })
    );

    render(<NiconicoSessionManager />);

    // ダイアログを開く
    fireEvent.click(screen.getByText('セッション管理'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'セッションを削除' })).toBeInTheDocument();
    });
  });

  it('未登録の場合はダイアログ内に削除ボタンが表示されない', async () => {
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));

    render(<NiconicoSessionManager />);

    // ダイアログを開く
    fireEvent.click(screen.getByText('セッション管理'));

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

    // ダイアログを開く
    fireEvent.click(screen.getByText('セッション管理'));

    // 削除ボタンが表示されるまで待機
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

  it('削除成功後にダイアログが閉じる', async () => {
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
        ok: true,
        json: () => Promise.resolve({ message: 'ニコニコセッションを削除しました' }),
        headers: { get: () => 'application/json' },
      })
    );
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));

    render(<NiconicoSessionManager />);

    fireEvent.click(screen.getByText('セッション管理'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'セッションを削除' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'セッションを削除' }));

    // 削除成功後にダイアログが閉じることを確認
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByText('セッション管理'));

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

  it('保存成功後に onStatusChange が再度呼ばれ状態が更新される', async () => {
    const onStatusChange = jest.fn();

    // 初回: 未登録状態
    mockFetch.mockReturnValueOnce(mockSessionResponse({ hasSession: false }));
    // POST: 保存成功
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            message: 'ニコニコセッションを保存しました',
          }),
        headers: { get: () => 'application/json' },
      })
    );
    // 状態再取得: 有効状態
    mockFetch.mockReturnValueOnce(
      mockSessionResponse({
        hasSession: true,
        validity: 'valid',
        acquiredAt: Date.now(),
        estimatedExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      })
    );

    render(<NiconicoSessionManager onStatusChange={onStatusChange} />);

    // 初回の onStatusChange 呼び出しを待機
    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledTimes(1);
    });

    // ダイアログを開いて保存
    fireEvent.click(screen.getByText('セッション管理'));
    fireEvent.change(screen.getByLabelText('user_session'), {
      target: { value: 'new-session-value' },
    });
    fireEvent.click(screen.getByText('セッションを保存'));

    // 保存後に onStatusChange が再呼び出されることを確認
    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledTimes(2);
    });

    const secondCall = onStatusChange.mock.calls[1][0] as {
      hasSession: boolean;
      validity: string;
    };
    expect(secondCall.hasSession).toBe(true);
    expect(secondCall.validity).toBe('valid');
  });
});
