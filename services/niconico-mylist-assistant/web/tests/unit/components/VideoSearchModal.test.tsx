/**
 * VideoSearchModal のユニットテスト
 *
 * 検索前・検索済み0件・検索結果あり の3状態を検証する。
 * fetch をモック化して API レスポンスをシミュレートする。
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VideoSearchModal from '../../../src/components/VideoSearchModal';

// @nagiyu/ui をスタブ化（MUI 依存を最小化）
jest.mock('@nagiyu/ui', () => ({
  Button: ({
    children,
    onClick,
    loading,
    disabled,
    variant,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    loading?: boolean;
    disabled?: boolean;
    variant?: string;
    [key: string]: unknown;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled === true || loading === true}
      data-variant={variant}
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  ),
  TextField: ({
    label,
    value,
    onChange,
    onKeyDown,
    disabled,
    maxLength,
  }: {
    label: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    disabled?: boolean;
    maxLength?: number;
  }) => (
    <input
      aria-label={label}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      disabled={disabled}
      maxLength={maxLength}
    />
  ),
  ErrorAlert: ({ message }: { message: string }) => (
    <div role="alert" data-testid="error-alert">
      {message}
    </div>
  ),
}));

// @nagiyu/react の useEnterSubmit をスタブ化
jest.mock('@nagiyu/react', () => ({
  useEnterSubmit: jest.fn(
    (handler: () => void, options?: { disabled?: boolean }) => (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !options?.disabled) {
        handler();
      }
    }
  ),
}));

// MUI の Dialog コンポーネントをスタブ化（open prop に応じて中身を描画）
jest.mock('@mui/material', () => {
  const actual = jest.requireActual('@mui/material') as Record<string, unknown>;
  return {
    ...actual,
    Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
      open ? <div role="dialog">{children}</div> : null,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Stack: ({
      children,
      spacing,
      direction,
    }: {
      children: React.ReactNode;
      spacing?: number;
      direction?: object | string;
    }) => {
      void spacing;
      void direction;
      return <div>{children}</div>;
    },
    Box: ({ children, sx }: { children: React.ReactNode; sx?: object }) => {
      void sx;
      return <div>{children}</div>;
    },
    Typography: ({
      children,
      variant,
      color,
    }: {
      children: React.ReactNode;
      variant?: string;
      color?: string;
    }) => {
      void variant;
      void color;
      return <p>{children}</p>;
    },
    Card: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="video-card">{children}</div>
    ),
    CardContent: ({ children, sx }: { children: React.ReactNode; sx?: object }) => {
      void sx;
      return <div>{children}</div>;
    },
    CardMedia: ({
      image,
      alt,
      sx,
    }: {
      component?: string;
      image: string;
      alt: string;
      sx?: object;
    }) => {
      void sx;
      // CardMedia のモック描画。next/image ではなく素の img で十分なため警告を抑止する
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={image} alt={alt} />;
    },
  };
});

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * 検索結果レスポンスのモック
 */
function mockSearchResponse(videos: object[], status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve({ videos, total: videos.length }),
  });
}

/**
 * 検索エラーレスポンスのモック
 */
function mockSearchErrorResponse(error: string, status = 500) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ error }),
  });
}

describe('VideoSearchModal - 未検索状態', () => {
  it('初期表示で「キーワードを入力して検索してください」が表示される', () => {
    render(<VideoSearchModal open={true} onClose={jest.fn()} />);

    expect(screen.getByText('キーワードを入力して検索してください')).toBeInTheDocument();
  });

  it('「該当する動画が見つかりませんでした」は初期表示では出ない', () => {
    render(<VideoSearchModal open={true} onClose={jest.fn()} />);

    expect(screen.queryByText('該当する動画が見つかりませんでした')).not.toBeInTheDocument();
  });
});

describe('VideoSearchModal - 検索済み0件', () => {
  it('API が 0件を返したとき「該当する動画が見つかりませんでした」が表示される', async () => {
    mockFetch.mockReturnValueOnce(mockSearchResponse([]));

    render(<VideoSearchModal open={true} onClose={jest.fn()} />);

    // キーワードを入力して検索を実行
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '胡蝶の如く' } });
    fireEvent.click(screen.getByText('検索'));

    await waitFor(() => {
      expect(screen.getByText('該当する動画が見つかりませんでした')).toBeInTheDocument();
    });
  });

  it('検索済み0件のとき「キーワードを入力して検索してください」は表示されない', async () => {
    mockFetch.mockReturnValueOnce(mockSearchResponse([]));

    render(<VideoSearchModal open={true} onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '胡蝶の如く' } });
    fireEvent.click(screen.getByText('検索'));

    await waitFor(() => {
      expect(screen.queryByText('キーワードを入力して検索してください')).not.toBeInTheDocument();
    });
  });
});

describe('VideoSearchModal - 検索結果あり', () => {
  it('検索結果が返ったとき動画カードが表示される', async () => {
    const videos = [
      {
        videoId: 'sm9',
        title: 'テスト動画',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        description: '',
        duration: 120,
        viewCount: 100,
        commentCount: 10,
        mylistCount: 5,
        uploadedAt: '2020-01-01T00:00:00+09:00',
        tags: [],
        isRegistered: false,
      },
    ];
    mockFetch.mockReturnValueOnce(mockSearchResponse(videos));

    render(<VideoSearchModal open={true} onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'テスト' } });
    fireEvent.click(screen.getByText('検索'));

    await waitFor(() => {
      expect(screen.getByTestId('video-card')).toBeInTheDocument();
      expect(screen.getByText('テスト動画')).toBeInTheDocument();
    });
  });

  it('検索結果があるとき「キーワードを入力して検索してください」は表示されない', async () => {
    const videos = [
      {
        videoId: 'sm9',
        title: 'テスト動画',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        description: '',
        duration: 120,
        viewCount: 100,
        commentCount: 10,
        mylistCount: 5,
        uploadedAt: '2020-01-01T00:00:00+09:00',
        tags: [],
        isRegistered: false,
      },
    ];
    mockFetch.mockReturnValueOnce(mockSearchResponse(videos));

    render(<VideoSearchModal open={true} onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'テスト' } });
    fireEvent.click(screen.getByText('検索'));

    await waitFor(() => {
      expect(screen.queryByText('キーワードを入力して検索してください')).not.toBeInTheDocument();
    });
  });
});

describe('VideoSearchModal - エラー時', () => {
  it('検索でエラーが返ったとき ErrorAlert が表示される', async () => {
    mockFetch.mockReturnValueOnce(mockSearchErrorResponse('動画検索に失敗しました'));

    render(<VideoSearchModal open={true} onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'テスト' } });
    fireEvent.click(screen.getByText('検索'));

    await waitFor(() => {
      expect(screen.getByTestId('error-alert')).toBeInTheDocument();
    });
  });

  it('検索エラー後も「キーワードを入力して検索してください」が表示される', async () => {
    mockFetch.mockReturnValueOnce(mockSearchErrorResponse('動画検索に失敗しました'));

    render(<VideoSearchModal open={true} onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'テスト' } });
    fireEvent.click(screen.getByText('検索'));

    await waitFor(() => {
      // エラー発生時は hasSearched が false のまま（0件メッセージは出ない）
      expect(screen.getByText('キーワードを入力して検索してください')).toBeInTheDocument();
      expect(screen.queryByText('該当する動画が見つかりませんでした')).not.toBeInTheDocument();
    });
  });
});

describe('VideoSearchModal - 動画追加', () => {
  const singleVideo = [
    {
      videoId: 'sm9',
      title: 'テスト動画',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      description: '',
      duration: 120,
      viewCount: 100,
      commentCount: 10,
      mylistCount: 5,
      uploadedAt: '2020-01-01T00:00:00+09:00',
      tags: [],
      isRegistered: false,
    },
  ];

  it('追加ボタンをクリックすると bulk-import API が呼ばれる', async () => {
    // 検索結果を返す
    mockFetch.mockReturnValueOnce(mockSearchResponse(singleVideo));
    // 追加 API のレスポンス
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ added: 1, skipped: 0 }),
      })
    );

    render(<VideoSearchModal open={true} onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'テスト' } });
    fireEvent.click(screen.getByText('検索'));

    await waitFor(() => {
      expect(screen.getByText('追加')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('追加'));

    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find(
        (call: Parameters<typeof fetch>) => (call[1] as RequestInit | undefined)?.method === 'POST'
      );
      expect(postCall).toBeDefined();
    });
  });

  it('追加成功後にボタンが「追加済み」に変わる', async () => {
    mockFetch.mockReturnValueOnce(mockSearchResponse(singleVideo));
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ added: 1, skipped: 0 }),
      })
    );

    render(<VideoSearchModal open={true} onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'テスト' } });
    fireEvent.click(screen.getByText('検索'));

    await waitFor(() => {
      expect(screen.getByText('追加')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('追加'));

    await waitFor(() => {
      expect(screen.getByText('追加済み')).toBeInTheDocument();
    });
  });

  it('追加 API がエラーを返したとき ErrorAlert が表示される', async () => {
    mockFetch.mockReturnValueOnce(mockSearchResponse(singleVideo));
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: '動画の追加に失敗しました' }),
      })
    );

    render(<VideoSearchModal open={true} onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'テスト' } });
    fireEvent.click(screen.getByText('検索'));

    await waitFor(() => {
      expect(screen.getByText('追加')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('追加'));

    await waitFor(() => {
      expect(screen.getByTestId('error-alert')).toBeInTheDocument();
    });
  });

  it('既に登録済みの動画は「追加済み（登録済）」と表示される', async () => {
    const registeredVideo = [{ ...singleVideo[0], isRegistered: true }];
    mockFetch.mockReturnValueOnce(mockSearchResponse(registeredVideo));

    render(<VideoSearchModal open={true} onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'テスト' } });
    fireEvent.click(screen.getByText('検索'));

    await waitFor(() => {
      expect(screen.getByText('追加済み（登録済）')).toBeInTheDocument();
    });
  });

  it('skipped > 0 のとき追加後のボタンが「追加済み（登録済）」になる', async () => {
    mockFetch.mockReturnValueOnce(mockSearchResponse(singleVideo));
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ added: 0, skipped: 1 }),
      })
    );

    render(<VideoSearchModal open={true} onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'テスト' } });
    fireEvent.click(screen.getByText('検索'));

    await waitFor(() => {
      expect(screen.getByText('追加')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('追加'));

    await waitFor(() => {
      expect(screen.getByText('追加済み（登録済）')).toBeInTheDocument();
    });
  });
});

describe('VideoSearchModal - ダイアログ開閉', () => {
  it('open=false のとき何も表示されない', () => {
    render(<VideoSearchModal open={false} onClose={jest.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('閉じるボタンクリックで onClose が呼ばれる', () => {
    const onClose = jest.fn();
    render(<VideoSearchModal open={true} onClose={onClose} />);

    fireEvent.click(screen.getByText('閉じる'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
