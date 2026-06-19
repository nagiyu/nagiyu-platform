/**
 * /refresh ページのユニットテスト
 *
 * callbackUrl 解決ロジックは refresh-callback.test.ts でテスト済みのため、
 * ここでは「update() が呼ばれ、その後 navigateTo が正しい URL で呼ばれる」
 * 呼び出し順と引数を検証する。
 *
 * jsdom の navigation 制約: window.location は configurable: false のため
 * Object.defineProperty での置き換えが不可能。navigateTo モジュールをモックし、
 * テスト内では jsdom の実際の origin（'http://localhost'）を期待値に使う。
 */

import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// navigateTo のモック（window.location.assign のラッパー。jsdom では assign を直接モックできないため分離）
const mockNavigateTo = jest.fn();
jest.mock('../../../../src/lib/navigate', () => ({
  navigateTo: (url: string) => mockNavigateTo(url),
}));

// next-auth/react のモック
const mockUpdate = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({ update: mockUpdate })),
  SessionProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

// next/navigation のモック
const mockGet = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({ get: mockGet })),
}));

// SessionProviderWrapper のモック（実体の SessionProvider 依存を回避）
jest.mock('../../../../src/components/SessionProviderWrapper', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

// MUI コンポーネントのモック（jsdom でのレンダリングを簡略化）
jest.mock('@mui/material', () => ({
  Box: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  Container: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  CircularProgress: () => React.createElement('div', { role: 'progressbar' }),
  Typography: ({ children }: { children: React.ReactNode }) =>
    React.createElement('p', null, children),
}));

// jsdom での window.location.origin（テスト内で baseUrl として利用される値）
const JSDOM_ORIGIN = 'http://localhost';

// ページコンポーネントのインポートはモック設定後に行う
let RefreshPage: React.ComponentType;

describe('/refresh ページ', () => {
  beforeAll(async () => {
    ({ default: RefreshPage } = await import('../../../../src/app/refresh/page'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('マウント時に「アクセス権限を更新しています」テキストを表示する', () => {
    mockUpdate.mockImplementation(() => new Promise(() => {})); // 永続的に pending
    mockGet.mockReturnValue(null);

    render(<RefreshPage />);

    expect(screen.getByText('アクセス権限を更新しています…')).toBeInTheDocument();
  });

  it('マウント時に update() が呼ばれる', async () => {
    mockUpdate.mockResolvedValue(undefined);
    mockGet.mockReturnValue(null);

    render(<RefreshPage />);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      // next-auth v5 では引数なしの update() は GET になり、
      // サーバ側 jwt callback の trigger:'update' が発火せずロールが即時反映されない。
      // 引数ありであることを検証して、このバグの再発を防ぐ。
      expect(mockUpdate.mock.calls[0][0]).toBeDefined();
    });
  });

  it('update() 完了後、*.nagiyu.com の callbackUrl へ navigateTo を呼ぶ', async () => {
    mockUpdate.mockResolvedValue(undefined);
    // *.nagiyu.com は許可 URL のため、そのまま使われる
    const callbackUrl = 'https://admin.nagiyu.com/dashboard';
    mockGet.mockReturnValue(callbackUrl);

    render(<RefreshPage />);

    await waitFor(() => {
      expect(mockNavigateTo).toHaveBeenCalledWith(callbackUrl);
    });
  });

  it('callbackUrl が null のとき jsdom origin（baseUrl）へ navigateTo を呼ぶ', async () => {
    mockUpdate.mockResolvedValue(undefined);
    mockGet.mockReturnValue(null);

    render(<RefreshPage />);

    await waitFor(() => {
      // callbackUrl が null → resolveRefreshCallbackUrl は baseUrl（window.location.origin）を返す
      expect(mockNavigateTo).toHaveBeenCalledWith(JSDOM_ORIGIN);
    });
  });

  it('外部 URL の callbackUrl は origin（baseUrl）へフォールバックして navigateTo を呼ぶ', async () => {
    mockUpdate.mockResolvedValue(undefined);
    mockGet.mockReturnValue('https://evil.example.com/');

    render(<RefreshPage />);

    await waitFor(() => {
      // 外部 URL → resolveRefreshCallbackUrl は baseUrl（window.location.origin）を返す
      expect(mockNavigateTo).toHaveBeenCalledWith(JSDOM_ORIGIN);
    });
  });

  it('update() がエラーを返しても navigateTo は呼ばれる（エラー時もリダイレクトする）', async () => {
    mockUpdate.mockRejectedValue(new Error('セッション更新エラー'));
    mockGet.mockReturnValue(null);

    render(<RefreshPage />);

    await waitFor(() => {
      expect(mockNavigateTo).toHaveBeenCalled();
    });
  });

  it('update() の後に navigateTo が呼ばれる（呼び出し順の検証）', async () => {
    const callOrder: string[] = [];
    mockUpdate.mockImplementation(async () => {
      callOrder.push('update');
    });
    mockNavigateTo.mockImplementation(() => {
      callOrder.push('navigate');
    });
    mockGet.mockReturnValue(null);

    render(<RefreshPage />);

    await waitFor(() => {
      expect(callOrder).toEqual(['update', 'navigate']);
    });
  });
});
