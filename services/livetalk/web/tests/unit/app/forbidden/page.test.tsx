import React from 'react';
import { render, screen } from '@testing-library/react';
import ForbiddenPage from '@/app/forbidden/page';

/**
 * /forbidden ページのユニットテスト。
 *
 * AccessDeniedView は @nagiyu/ui からモック化する（UI ロジックと戻り先の解決は libs/ui 側でテスト済み）。
 * ここでは authUrl をランタイム env から渡していること、callbackUrl を渡さず
 * AccessDeniedView の既定（現在の URL）に任せていることを検証する。
 */

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
  process.env.NEXT_PUBLIC_AUTH_URL = 'https://auth.nagiyu.com';
});

afterEach(() => {
  jest.clearAllMocks();
  delete process.env.NEXT_PUBLIC_AUTH_URL;
});

describe('ForbiddenPage', () => {
  it('NEXT_PUBLIC_AUTH_URL を authUrl として渡す', () => {
    render(<ForbiddenPage />);

    expect(screen.getByTestId('access-denied-view')).toBeInTheDocument();
    expect(screen.getByTestId('auth-url')).toHaveTextContent('https://auth.nagiyu.com');
  });

  it('NEXT_PUBLIC_AUTH_URL が未設定のとき空文字列を渡す', () => {
    delete process.env.NEXT_PUBLIC_AUTH_URL;
    render(<ForbiddenPage />);

    expect(screen.getByTestId('auth-url')).toHaveTextContent('');
  });

  it('callbackUrl は渡さず AccessDeniedView の既定（現在の URL）に任せる', () => {
    render(<ForbiddenPage />);

    expect(screen.getByTestId('callback-url')).toBeEmptyDOMElement();
  });
});
