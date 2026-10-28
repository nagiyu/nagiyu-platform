/**
 * VideoDetailModal のユニットテスト
 *
 * 取得失敗と操作失敗でエラーの出し方が異なること (取得失敗は本体の代わり、操作失敗は本体の上) と、
 * 操作失敗後も編集中のメモが残って再保存できることを検証する。
 * fetch のみモック化し、共通 UI と MUI は実物を使う。
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VideoDetailModal from '../../../src/components/VideoDetailModal';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const baseVideo = {
  videoId: 'sm9',
  title: 'テスト動画',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  length: '5:00',
  createdAt: 1700000000000,
  userSetting: { isFavorite: false, isSkip: false, memo: '元のメモ' },
};

function jsonResponse(body: object, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
}

function renderModal(props: Partial<React.ComponentProps<typeof VideoDetailModal>> = {}) {
  return render(<VideoDetailModal videoId="sm9" open={true} onClose={jest.fn()} {...props} />);
}

/** 初回取得を成功させて本体が出るまで待つ */
async function renderLoaded(props: Partial<React.ComponentProps<typeof VideoDetailModal>> = {}) {
  mockFetch.mockReturnValueOnce(jsonResponse({ video: baseVideo }));
  const result = renderModal(props);
  await waitFor(() => {
    expect(screen.getByText('テスト動画')).toBeInTheDocument();
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('VideoDetailModal - 取得', () => {
  it('取得に成功すると動画情報とメモが表示される', async () => {
    await renderLoaded();

    expect(screen.getByRole('textbox')).toHaveValue('元のメモ');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('取得に失敗すると本体の代わりにエラーが表示される', async () => {
    mockFetch.mockReturnValueOnce(jsonResponse({}, false, 500));

    renderModal();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('動画情報の取得に失敗しました');
    });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText('動画を削除')).not.toBeInTheDocument();
  });

  it('通信エラーでも本体の代わりにエラーが表示される', async () => {
    mockFetch.mockReturnValueOnce(Promise.reject('network'));

    renderModal();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('videoId が null のときは何も取得しない', () => {
    renderModal({ videoId: null });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('videoId が変わると取得失敗のエラーがクリアされ、新しい動画が表示される', async () => {
    mockFetch.mockReturnValueOnce(jsonResponse({}, false, 500));
    const { rerender } = renderModal();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    mockFetch.mockReturnValueOnce(jsonResponse({ video: { ...baseVideo, videoId: 'sm10' } }));
    rerender(<VideoDetailModal videoId="sm10" open={true} onClose={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('テスト動画')).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('VideoDetailModal - 操作失敗', () => {
  it('メモ保存に失敗するとエラーが出て、本体と編集中のメモが残る', async () => {
    await renderLoaded();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '編集中のメモ' } });
    mockFetch.mockReturnValueOnce(jsonResponse({}, false, 500));
    fireEvent.click(screen.getByText('メモを保存'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('設定の更新に失敗しました');
    });
    expect(screen.getByText('テスト動画')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('編集中のメモ');
  });

  it('メモ保存に失敗した後、そのまま再保存でき、成功するとエラーが消える', async () => {
    const onUpdate = jest.fn();
    await renderLoaded({ onUpdate });

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '編集中のメモ' } });
    mockFetch.mockReturnValueOnce(jsonResponse({}, false, 500));
    fireEvent.click(screen.getByText('メモを保存'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    mockFetch.mockReturnValueOnce(
      jsonResponse({
        video: { ...baseVideo, userSetting: { ...baseVideo.userSetting, memo: '編集中のメモ' } },
      })
    );
    fireEvent.click(screen.getByText('メモを保存'));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('編集中のメモ');
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(JSON.parse((lastCall[1] as RequestInit).body as string)).toEqual({
      memo: '編集中のメモ',
    });
  });

  it('お気に入り更新に失敗してもエラーが出つつ本体が残る', async () => {
    await renderLoaded();

    mockFetch.mockReturnValueOnce(jsonResponse({}, false, 500));
    fireEvent.click(screen.getByText('お気に入りに追加'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('設定の更新に失敗しました');
    });
    expect(screen.getByText('テスト動画')).toBeInTheDocument();
    expect(screen.getByText('お気に入りに追加')).toBeInTheDocument();
  });

  it('スキップ更新に失敗してもエラーが出つつ本体が残る', async () => {
    await renderLoaded();

    mockFetch.mockReturnValueOnce(Promise.reject(new Error('通信エラー')));
    fireEvent.click(screen.getByText('スキップに設定'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('通信エラー');
    });
    expect(screen.getByText('テスト動画')).toBeInTheDocument();
  });

  it('スキップ更新が非 2xx で失敗した場合も更新失敗のエラーが出て本体が残る', async () => {
    await renderLoaded();

    mockFetch.mockReturnValueOnce(jsonResponse({}, false, 500));
    fireEvent.click(screen.getByText('スキップに設定'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('設定の更新に失敗しました');
    });
    expect(screen.getByText('テスト動画')).toBeInTheDocument();
  });

  it('削除に失敗してもエラーが出つつ本体が残り、onDelete と onClose は呼ばれない', async () => {
    const onDelete = jest.fn();
    const onClose = jest.fn();
    await renderLoaded({ onDelete, onClose });

    fireEvent.click(screen.getByText('動画を削除'));
    mockFetch.mockReturnValueOnce(jsonResponse({}, false, 500));
    fireEvent.click(screen.getByText('削除する'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('動画の削除に失敗しました');
    });
    expect(screen.getByText('テスト動画')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('メモが 1000 文字を超えると保存ボタンが無効になり、保存リクエストは送られない', async () => {
    await renderLoaded();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'あ'.repeat(1001) } });

    expect(screen.getByText('メモを保存').closest('button')).toBeDisabled();
    expect(screen.getByText('1001/1000文字')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('操作を開始すると前回の操作エラーがクリアされる', async () => {
    await renderLoaded();

    mockFetch.mockReturnValueOnce(jsonResponse({}, false, 500));
    fireEvent.click(screen.getByText('お気に入りに追加'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    let resolveSecond: (value: unknown) => void = () => undefined;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecond = resolve;
      })
    );
    fireEvent.click(screen.getByText('お気に入りに追加'));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    resolveSecond(
      jsonResponse({
        video: { ...baseVideo, userSetting: { ...baseVideo.userSetting, isFavorite: true } },
      })
    );
    await waitFor(() => {
      expect(screen.getByText('お気に入り解除')).toBeInTheDocument();
    });
  });
});

describe('VideoDetailModal - 操作成功', () => {
  it('削除に成功すると onDelete と onClose が呼ばれる', async () => {
    const onDelete = jest.fn();
    const onClose = jest.fn();
    await renderLoaded({ onDelete, onClose });

    fireEvent.click(screen.getByText('動画を削除'));
    mockFetch.mockReturnValueOnce(jsonResponse({}));
    fireEvent.click(screen.getByText('削除する'));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('スキップ設定に成功すると表示が切り替わる', async () => {
    await renderLoaded();

    mockFetch.mockReturnValueOnce(
      jsonResponse({
        video: { ...baseVideo, userSetting: { ...baseVideo.userSetting, isSkip: true } },
      })
    );
    fireEvent.click(screen.getByText('スキップに設定'));

    await waitFor(() => {
      expect(screen.getByText('スキップ解除')).toBeInTheDocument();
    });
  });
});

describe('VideoDetailModal - 未保存のメモ', () => {
  /** メモを編集して、未保存の変更がある状態にする */
  function editMemo(value = '編集したメモ') {
    fireEvent.change(screen.getByRole('textbox'), { target: { value } });
  }

  const closeRoutes: Array<[string, () => void]> = [
    ['タイトル右上の ×', () => fireEvent.click(screen.getAllByLabelText('閉じる')[0])],
    ['下部の「閉じる」ボタン', () => fireEvent.click(screen.getByText('閉じる'))],
    ['ESC キー', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
    [
      '背景クリック',
      () => {
        const backdrop = document.querySelector('.MuiBackdrop-root');
        if (!backdrop) throw new Error('背景が見つかりません');
        fireEvent.click(backdrop);
      },
    ],
  ];

  it.each(closeRoutes)('%s で閉じようとすると確認が出て、まだ閉じない', async (_name, close) => {
    const onClose = jest.fn();
    await renderLoaded({ onClose });
    editMemo();

    close();

    expect(await screen.findByText('保存していないメモがあります')).toBeInTheDocument();
    expect(
      screen.getByText('メモを保存せずに閉じると、編集した内容は破棄されます。')
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('「破棄して閉じる」で onClose が呼ばれる', async () => {
    const onClose = jest.fn();
    await renderLoaded({ onClose });
    editMemo();
    fireEvent.click(screen.getByText('閉じる'));

    fireEvent.click(await screen.findByText('破棄して閉じる'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('「キャンセル」では閉じず、編集中のメモが残る', async () => {
    const onClose = jest.fn();
    await renderLoaded({ onClose });
    editMemo();
    fireEvent.click(screen.getByText('閉じる'));

    // 確認ダイアログ内のキャンセルを押す (削除確認のキャンセルは表示されていない)
    fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }));

    await waitFor(() => {
      expect(screen.queryByText('保存していないメモがあります')).not.toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveValue('編集したメモ');
  });

  it('メモを変更していなければ、確認なしですぐ閉じる', async () => {
    const onClose = jest.fn();
    await renderLoaded({ onClose });

    fireEvent.click(screen.getByText('閉じる'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('保存していないメモがあります')).not.toBeInTheDocument();
  });

  it('編集してから元の値に戻した場合は、確認なしですぐ閉じる', async () => {
    const onClose = jest.fn();
    await renderLoaded({ onClose });
    editMemo();
    editMemo('元のメモ');

    fireEvent.click(screen.getByLabelText('閉じる', { selector: 'button' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('保存したあとは、確認なしですぐ閉じる', async () => {
    const onClose = jest.fn();
    const onUpdate = jest.fn();
    await renderLoaded({ onClose, onUpdate });
    editMemo();
    mockFetch.mockReturnValueOnce(
      jsonResponse({
        video: { ...baseVideo, userSetting: { ...baseVideo.userSetting, memo: '編集したメモ' } },
      })
    );
    fireEvent.click(screen.getByText('メモを保存'));
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText('閉じる'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('保存していないメモがあります')).not.toBeInTheDocument();
  });

  it('メモを編集していても、削除に成功したときは確認なしで閉じる', async () => {
    const onClose = jest.fn();
    await renderLoaded({ onClose });
    editMemo();

    fireEvent.click(screen.getByText('動画を削除'));
    mockFetch.mockReturnValueOnce(jsonResponse({}));
    fireEvent.click(screen.getByText('削除する'));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('保存していないメモがあります')).not.toBeInTheDocument();
  });
});
