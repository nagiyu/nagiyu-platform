/**
 * 一括インポートページのユニットテスト
 *
 * 結果表示後の「動画一覧を見る」が動画一覧 (/mylist) へ遷移することを検証する。
 * 検索モーダルはこのページの責務外なのでスタブ化する。
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImportPage from '../../../../src/app/import/page';

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
