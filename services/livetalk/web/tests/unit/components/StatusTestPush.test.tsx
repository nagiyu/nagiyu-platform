/**
 * StatusTestPush コンポーネントのユニットテスト（Issue #3491）。
 *
 * テスト観点:
 *   - 登録キャラクター分のボタンが表示される
 *   - クリックで /api/push/test が呼ばれる（fetch モック）
 *   - 成功 / 購読なし / エラー の各結果メッセージが表示される
 *   - 送信中は disabled になる
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StatusTestPush from '@/components/StatusTestPush';

// ---- fetch のモック設定 -----------------------------------------------

// グローバル fetch をモック化する
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ---- テスト用定数 -------------------------------------------------------

const characterIds = ['hiyori', 'ageha'];
const displayNames: Record<string, string> = {
  hiyori: '桃瀬ひより',
  ageha: '早瀬アゲハ',
};

// ---- ヘルパー -----------------------------------------------------------

/** 成功レスポンスのモック（sent > 0）を返す */
function mockFetchSuccess(sent: number, characterId: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ sent, characterId }),
  });
}

/** sent=0 レスポンス（購読なし）のモックを返す */
function mockFetchNoSubscription(characterId: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ sent: 0, characterId }),
  });
}

/** エラーレスポンスのモックを返す */
function mockFetchError(status: number, message: string) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({ message }),
  });
}

// ---- テスト -------------------------------------------------------

describe('StatusTestPush', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('描画', () => {
    it('登録キャラクター分のボタンが表示される', () => {
      render(<StatusTestPush characterIds={characterIds} displayNames={displayNames} />);
      expect(screen.getByRole('button', { name: '桃瀬ひより にテスト通知' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '早瀬アゲハ にテスト通知' })).toBeInTheDocument();
    });

    it('空の characterIds の場合はボタンが表示されない', () => {
      render(<StatusTestPush characterIds={[]} displayNames={{}} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('初期状態では結果メッセージが表示されない', () => {
      render(<StatusTestPush characterIds={characterIds} displayNames={displayNames} />);
      expect(screen.queryByText(/送信完了/)).not.toBeInTheDocument();
      expect(screen.queryByText(/購読なし/)).not.toBeInTheDocument();
      expect(screen.queryByText(/エラー/)).not.toBeInTheDocument();
    });
  });

  describe('クリックで /api/push/test を呼ぶ', () => {
    it('hiyori のボタンをクリックすると fetch が正しい引数で呼ばれる', async () => {
      mockFetchSuccess(1, 'hiyori');
      render(<StatusTestPush characterIds={characterIds} displayNames={displayNames} />);

      const button = screen.getByRole('button', { name: '桃瀬ひより にテスト通知' });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/push/test',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ characterId: 'hiyori' }),
          })
        );
      });
    });

    it('ageha のボタンをクリックすると characterId=ageha で fetch が呼ばれる', async () => {
      mockFetchSuccess(1, 'ageha');
      render(<StatusTestPush characterIds={characterIds} displayNames={displayNames} />);

      const button = screen.getByRole('button', { name: '早瀬アゲハ にテスト通知' });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/push/test',
          expect.objectContaining({
            body: JSON.stringify({ characterId: 'ageha' }),
          })
        );
      });
    });
  });

  describe('送信結果の表示', () => {
    it('送信成功（sent > 0）のとき「送信完了（N 件）」が表示される', async () => {
      mockFetchSuccess(2, 'hiyori');
      render(<StatusTestPush characterIds={characterIds} displayNames={displayNames} />);

      fireEvent.click(screen.getByRole('button', { name: '桃瀬ひより にテスト通知' }));

      await waitFor(() => {
        expect(screen.getByText('送信完了（2 件）')).toBeInTheDocument();
      });
    });

    it('purchased 0 件（sent=0）のとき「購読なし」メッセージが表示される', async () => {
      mockFetchNoSubscription('hiyori');
      render(<StatusTestPush characterIds={characterIds} displayNames={displayNames} />);

      fireEvent.click(screen.getByRole('button', { name: '桃瀬ひより にテスト通知' }));

      await waitFor(() => {
        expect(screen.getByText('購読なし（送信されませんでした）')).toBeInTheDocument();
      });
    });

    it('エラーレスポンスのとき「エラー:」メッセージが表示される', async () => {
      mockFetchError(500, 'テスト通知の送信に失敗しました');
      render(<StatusTestPush characterIds={characterIds} displayNames={displayNames} />);

      fireEvent.click(screen.getByRole('button', { name: '桃瀬ひより にテスト通知' }));

      await waitFor(() => {
        expect(screen.getByText('エラー: テスト通知の送信に失敗しました')).toBeInTheDocument();
      });
    });

    it('各キャラの結果は独立して表示される（hiyori の結果が ageha に影響しない）', async () => {
      mockFetchSuccess(1, 'hiyori');
      render(<StatusTestPush characterIds={characterIds} displayNames={displayNames} />);

      fireEvent.click(screen.getByRole('button', { name: '桃瀬ひより にテスト通知' }));

      await waitFor(() => {
        expect(screen.getByText('送信完了（1 件）')).toBeInTheDocument();
      });

      // ageha の結果は表示されていない
      // ボタンが 2 個あることを確認（ageha には結果がない）
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
    });
  });

  describe('送信中の状態', () => {
    it('送信中はボタンが disabled になり「送信中…」ラベルに変わる', async () => {
      // fetch が即時に解決しないようにする
      let resolveFetch!: (value: unknown) => void;
      mockFetch.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
      );

      render(<StatusTestPush characterIds={characterIds} displayNames={displayNames} />);
      const button = screen.getByRole('button', { name: '桃瀬ひより にテスト通知' });

      fireEvent.click(button);

      // 送信中: ボタンが disabled かつラベルが変わる
      await waitFor(() => {
        expect(screen.getByText('送信中…')).toBeInTheDocument();
      });

      // fetch を解決する
      resolveFetch({
        ok: true,
        json: async () => ({ sent: 1, characterId: 'hiyori' }),
      });

      // 送信完了後はボタンが復活する
      await waitFor(() => {
        expect(screen.getByRole('button', { name: '桃瀬ひより にテスト通知' })).not.toBeDisabled();
      });
    });
  });
});
