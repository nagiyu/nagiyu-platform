/**
 * 一括インポートページのユニットテスト
 *
 * 結果表示後の「動画一覧を見る」が動画一覧 (/mylist) へ遷移することを検証する。
 * 検索モーダルはこのページの責務外なのでスタブ化する。
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImportPage from '../../../../src/app/import/page';
import { ERROR_MESSAGES } from '../../../../src/lib/constants/errors';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../../../../src/components/VideoSearchModal', () => ({
  __esModule: true,
  default: () => null,
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ImportPage - インポート結果', () => {
  it('「動画一覧を見る」で /mylist へ遷移する', async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: 1, failed: 0, skipped: 0, total: 1 }),
      })
    );

    render(<ImportPage />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sm9' } });
    fireEvent.click(screen.getByText('インポート実行'));

    await waitFor(() => {
      expect(screen.getByText('動画一覧を見る')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('動画一覧を見る'));

    expect(mockPush).toHaveBeenCalledWith('/mylist');
  });
});

describe('ImportPage - 入力の整形', () => {
  function respondOk() {
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: 3, failed: 0, skipped: 0, total: 3 }),
      })
    );
  }

  it('URL・大文字・読点区切りを整えて送る', async () => {
    respondOk();
    render(<ImportPage />);

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'https://www.nicovideo.jp/watch/sm9?ref=x、SO12345，https://nico.ms/nm1' },
    });
    fireEvent.click(screen.getByText('インポート実行'));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      videoIds: ['sm9', 'so12345', 'nm1'],
    });
  });
});

describe('ImportPage - 形式エラー', () => {
  function respondInvalid(invalidIds: string[]) {
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: ERROR_MESSAGES.INVALID_VIDEO_ID_FORMAT, invalidIds }),
      })
    );
  }

  it('不正な ID を一覧で表示する', async () => {
    respondInvalid(['abc', 'x-1']);
    render(<ImportPage />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abc x-1' } });
    fireEvent.click(screen.getByText('インポート実行'));

    expect(await screen.findByText(ERROR_MESSAGES.INVALID_VIDEO_ID_FORMAT)).toBeInTheDocument();
    expect(screen.getByText(/形式が正しくない動画 ID: abc, x-1/)).toBeInTheDocument();
  });

  it('多いときは先頭の 10 件と残りの件数を表示する', async () => {
    const ids = Array.from({ length: 13 }, (_, i) => `bad${i}`);
    respondInvalid(ids);
    render(<ImportPage />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: ids.join(' ') } });
    fireEvent.click(screen.getByText('インポート実行'));

    const text = await screen.findByText(/形式が正しくない動画 ID/);
    expect(text).toHaveTextContent(ids.slice(0, 10).join(', '));
    expect(text).toHaveTextContent('ほか 3 件');
    expect(text).not.toHaveTextContent('bad10');
  });

  it('次のインポート時に前回の不正 ID 表示を消す', async () => {
    respondInvalid(['abc']);
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: 1, failed: 0, skipped: 0, total: 1 }),
      })
    );
    render(<ImportPage />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByText('インポート実行'));
    await screen.findByText(/形式が正しくない動画 ID/);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sm9' } });
    fireEvent.click(screen.getByText('インポート実行'));

    await waitFor(() => expect(screen.getByText('動画一覧を見る')).toBeInTheDocument());
    expect(screen.queryByText(/形式が正しくない動画 ID/)).not.toBeInTheDocument();
  });

  it('入力が空(区切りのみ)なら送信せずエラーを表示する', async () => {
    render(<ImportPage />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '、，' } });
    fireEvent.click(screen.getByText('インポート実行'));

    expect(await screen.findByText(ERROR_MESSAGES.IMPORT_VIDEO_IDS_REQUIRED)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
