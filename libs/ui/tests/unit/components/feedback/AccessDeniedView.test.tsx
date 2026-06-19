import { fireEvent, render, screen } from '@testing-library/react';
import AccessDeniedView, {
  ACCESS_DENIED_VIEW_MESSAGES,
} from '../../../../src/components/feedback/AccessDeniedView';

/**
 * AccessDeniedView のユニットテスト。
 *
 * `window.location.assign` は jsdom 環境では再定義不可のため、コンポーネントは
 * `onRefresh`/`onSignOut` コールバック props でナビゲーション処理を注入可能にしている。
 * テストではこれらのモック関数を渡し、ボタン押下時に正しい URL で遷移が試みられることを検証する。
 * URL 生成ロジック（buildRefreshUrl / buildSignOutUrl）自体は `utils/auth.test.ts` でテスト済み。
 */

describe('AccessDeniedView', () => {
  describe('デフォルト表示', () => {
    it('デフォルトのタイトルが表示される', () => {
      render(<AccessDeniedView authUrl="https://auth.nagiyu.com" />);
      expect(screen.getByText(ACCESS_DENIED_VIEW_MESSAGES.DEFAULT_TITLE)).toBeInTheDocument();
    });

    it('デフォルトの説明文が表示される', () => {
      render(<AccessDeniedView authUrl="https://auth.nagiyu.com" />);
      expect(screen.getByText(ACCESS_DENIED_VIEW_MESSAGES.DEFAULT_DESCRIPTION)).toBeInTheDocument();
    });

    it('「アクセスを更新」ボタンが表示される', () => {
      render(<AccessDeniedView authUrl="https://auth.nagiyu.com" />);
      expect(
        screen.getByRole('button', { name: ACCESS_DENIED_VIEW_MESSAGES.REFRESH_BUTTON })
      ).toBeInTheDocument();
    });

    it('「再ログイン」ボタンが表示される', () => {
      render(<AccessDeniedView authUrl="https://auth.nagiyu.com" />);
      expect(
        screen.getByRole('button', { name: ACCESS_DENIED_VIEW_MESSAGES.SIGN_OUT_BUTTON })
      ).toBeInTheDocument();
    });
  });

  describe('カスタム Props', () => {
    it('title prop でタイトルを上書きできる', () => {
      render(<AccessDeniedView authUrl="https://auth.nagiyu.com" title="カスタムタイトル" />);
      expect(screen.getByText('カスタムタイトル')).toBeInTheDocument();
      expect(screen.queryByText(ACCESS_DENIED_VIEW_MESSAGES.DEFAULT_TITLE)).not.toBeInTheDocument();
    });

    it('description prop で説明文を上書きできる', () => {
      render(<AccessDeniedView authUrl="https://auth.nagiyu.com" description="カスタム説明文" />);
      expect(screen.getByText('カスタム説明文')).toBeInTheDocument();
      expect(
        screen.queryByText(ACCESS_DENIED_VIEW_MESSAGES.DEFAULT_DESCRIPTION)
      ).not.toBeInTheDocument();
    });
  });

  describe('「アクセスを更新」ボタンの遷移（onRefresh）', () => {
    it('callbackUrl なしのとき /refresh エンドポイント URL で onRefresh が呼ばれる', () => {
      const mockOnRefresh = jest.fn();
      render(<AccessDeniedView authUrl="https://auth.nagiyu.com" onRefresh={mockOnRefresh} />);
      fireEvent.click(
        screen.getByRole('button', { name: ACCESS_DENIED_VIEW_MESSAGES.REFRESH_BUTTON })
      );
      expect(mockOnRefresh).toHaveBeenCalledTimes(1);
      expect(mockOnRefresh).toHaveBeenCalledWith('https://auth.nagiyu.com/refresh');
    });

    it('callbackUrl あり のとき encodeURIComponent 済みクエリ付き URL で onRefresh が呼ばれる', () => {
      const mockOnRefresh = jest.fn();
      render(
        <AccessDeniedView
          authUrl="https://auth.nagiyu.com"
          callbackUrl="https://live-talk.nagiyu.com"
          onRefresh={mockOnRefresh}
        />
      );
      fireEvent.click(
        screen.getByRole('button', { name: ACCESS_DENIED_VIEW_MESSAGES.REFRESH_BUTTON })
      );
      expect(mockOnRefresh).toHaveBeenCalledWith(
        'https://auth.nagiyu.com/refresh?callbackUrl=https%3A%2F%2Flive-talk.nagiyu.com'
      );
    });

    it('callbackUrl にパスが含まれる場合も正しく encode した URL で onRefresh が呼ばれる', () => {
      const mockOnRefresh = jest.fn();
      render(
        <AccessDeniedView
          authUrl="https://auth.nagiyu.com"
          callbackUrl="https://live-talk.nagiyu.com/notes"
          onRefresh={mockOnRefresh}
        />
      );
      fireEvent.click(
        screen.getByRole('button', { name: ACCESS_DENIED_VIEW_MESSAGES.REFRESH_BUTTON })
      );
      expect(mockOnRefresh).toHaveBeenCalledWith(
        'https://auth.nagiyu.com/refresh?callbackUrl=https%3A%2F%2Flive-talk.nagiyu.com%2Fnotes'
      );
    });

    it('authUrl の末尾スラッシュを正規化した URL で onRefresh が呼ばれる', () => {
      const mockOnRefresh = jest.fn();
      render(<AccessDeniedView authUrl="https://auth.nagiyu.com/" onRefresh={mockOnRefresh} />);
      fireEvent.click(
        screen.getByRole('button', { name: ACCESS_DENIED_VIEW_MESSAGES.REFRESH_BUTTON })
      );
      expect(mockOnRefresh).toHaveBeenCalledWith('https://auth.nagiyu.com/refresh');
    });
  });

  describe('「再ログイン」ボタンの遷移（onSignOut）', () => {
    it('callbackUrl なしのとき /api/auth/signout エンドポイント URL で onSignOut が呼ばれる', () => {
      const mockOnSignOut = jest.fn();
      render(<AccessDeniedView authUrl="https://auth.nagiyu.com" onSignOut={mockOnSignOut} />);
      fireEvent.click(
        screen.getByRole('button', { name: ACCESS_DENIED_VIEW_MESSAGES.SIGN_OUT_BUTTON })
      );
      expect(mockOnSignOut).toHaveBeenCalledTimes(1);
      expect(mockOnSignOut).toHaveBeenCalledWith('https://auth.nagiyu.com/api/auth/signout');
    });

    it('callbackUrl あり のとき encodeURIComponent 済みクエリ付き URL で onSignOut が呼ばれる', () => {
      const mockOnSignOut = jest.fn();
      render(
        <AccessDeniedView
          authUrl="https://auth.nagiyu.com"
          callbackUrl="https://live-talk.nagiyu.com"
          onSignOut={mockOnSignOut}
        />
      );
      fireEvent.click(
        screen.getByRole('button', { name: ACCESS_DENIED_VIEW_MESSAGES.SIGN_OUT_BUTTON })
      );
      expect(mockOnSignOut).toHaveBeenCalledWith(
        'https://auth.nagiyu.com/api/auth/signout?callbackUrl=https%3A%2F%2Flive-talk.nagiyu.com'
      );
    });

    it('callbackUrl にパスが含まれる場合も正しく encode した URL で onSignOut が呼ばれる', () => {
      const mockOnSignOut = jest.fn();
      render(
        <AccessDeniedView
          authUrl="https://auth.nagiyu.com"
          callbackUrl="https://live-talk.nagiyu.com/notes"
          onSignOut={mockOnSignOut}
        />
      );
      fireEvent.click(
        screen.getByRole('button', { name: ACCESS_DENIED_VIEW_MESSAGES.SIGN_OUT_BUTTON })
      );
      expect(mockOnSignOut).toHaveBeenCalledWith(
        'https://auth.nagiyu.com/api/auth/signout?callbackUrl=https%3A%2F%2Flive-talk.nagiyu.com%2Fnotes'
      );
    });

    it('authUrl の末尾スラッシュを正規化した URL で onSignOut が呼ばれる', () => {
      const mockOnSignOut = jest.fn();
      render(<AccessDeniedView authUrl="https://auth.nagiyu.com/" onSignOut={mockOnSignOut} />);
      fireEvent.click(
        screen.getByRole('button', { name: ACCESS_DENIED_VIEW_MESSAGES.SIGN_OUT_BUTTON })
      );
      expect(mockOnSignOut).toHaveBeenCalledWith('https://auth.nagiyu.com/api/auth/signout');
    });
  });

  describe('ボタンの独立性', () => {
    it('「アクセスを更新」と「再ログイン」はそれぞれ異なる URL でコールバックを呼ぶ', () => {
      const mockOnRefresh = jest.fn();
      const mockOnSignOut = jest.fn();
      render(
        <AccessDeniedView
          authUrl="https://auth.nagiyu.com"
          callbackUrl="https://live-talk.nagiyu.com"
          onRefresh={mockOnRefresh}
          onSignOut={mockOnSignOut}
        />
      );

      fireEvent.click(
        screen.getByRole('button', { name: ACCESS_DENIED_VIEW_MESSAGES.REFRESH_BUTTON })
      );
      expect(mockOnRefresh).toHaveBeenCalledWith(
        'https://auth.nagiyu.com/refresh?callbackUrl=https%3A%2F%2Flive-talk.nagiyu.com'
      );
      expect(mockOnSignOut).not.toHaveBeenCalled();

      fireEvent.click(
        screen.getByRole('button', { name: ACCESS_DENIED_VIEW_MESSAGES.SIGN_OUT_BUTTON })
      );
      expect(mockOnSignOut).toHaveBeenCalledWith(
        'https://auth.nagiyu.com/api/auth/signout?callbackUrl=https%3A%2F%2Flive-talk.nagiyu.com'
      );
      expect(mockOnRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('アクセシビリティ', () => {
    it('「アクセスを更新」ボタンに aria-label が設定されている', () => {
      render(<AccessDeniedView authUrl="https://auth.nagiyu.com" />);
      const refreshButton = screen.getByRole('button', {
        name: ACCESS_DENIED_VIEW_MESSAGES.REFRESH_BUTTON,
      });
      expect(refreshButton).toHaveAttribute(
        'aria-label',
        ACCESS_DENIED_VIEW_MESSAGES.REFRESH_BUTTON
      );
    });

    it('「再ログイン」ボタンに aria-label が設定されている', () => {
      render(<AccessDeniedView authUrl="https://auth.nagiyu.com" />);
      const signOutButton = screen.getByRole('button', {
        name: ACCESS_DENIED_VIEW_MESSAGES.SIGN_OUT_BUTTON,
      });
      expect(signOutButton).toHaveAttribute(
        'aria-label',
        ACCESS_DENIED_VIEW_MESSAGES.SIGN_OUT_BUTTON
      );
    });

    it('main コンテンツに role="main" が設定されている', () => {
      render(<AccessDeniedView authUrl="https://auth.nagiyu.com" />);
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('タイトルが h1 要素として描画されている', () => {
      render(<AccessDeniedView authUrl="https://auth.nagiyu.com" />);
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
  });
});
