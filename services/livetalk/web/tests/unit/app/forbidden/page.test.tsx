import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ForbiddenPage from '@/app/forbidden/page';

/**
 * /forbidden ページのユニットテスト。
 *
 * AccessDeniedView の描画ロジックおよびクエリパラメータ `from` による
 * callbackUrl の解決を検証する。
 *
 * - `useSearchParams` は next/navigation からモック化
 * - `getOrigin` は @/lib/navigation からモック化（window.location.origin の代替）
 * - `AccessDeniedView` は @nagiyu/ui からモック化（UI ロジックは libs/ui 側でテスト済み）
 */

// next/navigation の useSearchParams をモック化
const mockSearchParamsGet = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({
    get: mockSearchParamsGet,
  })),
}));

// @/lib/navigation の getOrigin をモック化
jest.mock('@/lib/navigation', () => ({
  getOrigin: jest.fn(() => 'https://live-talk.nagiyu.com'),
}));

// @nagiyu/ui の AccessDeniedView をモック化
// Props を data-testid で露出し、受け取った値を検証できるようにする
jest.mock('@nagiyu/ui', () => ({
  AccessDeniedView: jest.fn(
    ({ authUrl, callbackUrl }: { authUrl: string; callbackUrl?: string }) => (
      <div data-testid="access-denied-view">
        <span data-testid="auth-url">{authUrl}</span>
        <span data-testid="callback-url">{callbackUrl ?? ''}</span>
      </div>
    )
  ),
}));

beforeEach(() => {
  // NEXT_PUBLIC_AUTH_URL をモック
  process.env.NEXT_PUBLIC_AUTH_URL = 'https://auth.nagiyu.com';
});

afterEach(() => {
  jest.clearAllMocks();
  delete process.env.NEXT_PUBLIC_AUTH_URL;
  // クエリなし状態に戻す
  mockSearchParamsGet.mockReturnValue(null);
});

describe('ForbiddenPage', () => {
  describe('AccessDeniedView への authUrl 受け渡し', () => {
    it('NEXT_PUBLIC_AUTH_URL を authUrl として渡す', async () => {
      mockSearchParamsGet.mockReturnValue(null);
      render(<ForbiddenPage />);

      await waitFor(() => {
        expect(screen.getByTestId('access-denied-view')).toBeInTheDocument();
      });

      expect(screen.getByTestId('auth-url')).toHaveTextContent('https://auth.nagiyu.com');
    });

    it('NEXT_PUBLIC_AUTH_URL が未設定のとき空文字列を渡す', async () => {
      delete process.env.NEXT_PUBLIC_AUTH_URL;
      mockSearchParamsGet.mockReturnValue(null);
      render(<ForbiddenPage />);

      await waitFor(() => {
        expect(screen.getByTestId('access-denied-view')).toBeInTheDocument();
      });

      expect(screen.getByTestId('auth-url')).toHaveTextContent('');
    });
  });

  describe('callbackUrl の解決（from クエリパラメータ）', () => {
    it('from がない場合は origin をそのまま callbackUrl にする', async () => {
      mockSearchParamsGet.mockReturnValue(null);
      render(<ForbiddenPage />);

      await waitFor(() => {
        expect(screen.getByTestId('callback-url')).toHaveTextContent(
          'https://live-talk.nagiyu.com'
        );
      });
    });

    it('from = "/notes" のとき origin + pathname を callbackUrl にする', async () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'from') return '/notes';
        return null;
      });

      render(<ForbiddenPage />);

      await waitFor(() => {
        expect(screen.getByTestId('callback-url')).toHaveTextContent(
          'https://live-talk.nagiyu.com/notes'
        );
      });
    });

    it('from = "/memory?page=2" のとき origin + pathname + search を callbackUrl にする', async () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'from') return '/memory?page=2';
        return null;
      });

      render(<ForbiddenPage />);

      await waitFor(() => {
        expect(screen.getByTestId('callback-url')).toHaveTextContent(
          'https://live-talk.nagiyu.com/memory?page=2'
        );
      });
    });

    it('from = "/" のとき origin + "/" を callbackUrl にする', async () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'from') return '/';
        return null;
      });

      render(<ForbiddenPage />);

      await waitFor(() => {
        expect(screen.getByTestId('callback-url')).toHaveTextContent(
          'https://live-talk.nagiyu.com/'
        );
      });
    });
  });

  describe('Suspense 境界', () => {
    it('AccessDeniedView がレンダリングされる', async () => {
      mockSearchParamsGet.mockReturnValue(null);
      render(<ForbiddenPage />);

      await waitFor(() => {
        expect(screen.getByTestId('access-denied-view')).toBeInTheDocument();
      });
    });
  });
});
