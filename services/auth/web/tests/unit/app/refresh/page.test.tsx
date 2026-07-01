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
// テストごとに sessionStatus を差し替えられるよう変数で管理する
let mockSessionStatus = 'authenticated';
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({ update: mockUpdate, status: mockSessionStatus })),
  SessionProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

// next/navigation のモック
const mockGet = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({ get: mockGet })),
}));

// @nagiyu/ui の SessionProviderWrapper のモック（実体の SessionProvider 依存を回避）
jest.mock('@nagiyu/ui', () => ({
  __esModule: true,
  SessionProviderWrapper: ({ children }: { children: React.ReactNode }) =>
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
    // 既存テストは 'authenticated' 状態（読み込み完了）を前提にしているため、デフォルトで設定する
    mockSessionStatus = 'authenticated';
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

  /**
   * 回帰テスト: next-auth v5(beta.31) の loading 中 update() 即 return バグの再発防止
   *
   * next-auth の update() は SessionProvider が初期セッション読み込み中（loading === true）のとき
   * 冒頭で即 return し、POST も trigger:'update' も起きない。
   * これにより依存配列 [] で deps が固定されると、loading=true のクロージャが焼き込まれて
   * 以後も update() が空振りし続け、ロールの強制リフレッシュが起きない。
   * 修正後は sessionStatus が 'loading' の間は update を呼ばず、
   * 読み込み完了（非 loading）になってから一度だけ呼ぶことを検証する。
   */
  it('【回帰】sessionStatus が loading 中は update() も navigateTo も呼ばれない', async () => {
    // セッション読み込み中を模擬する
    mockSessionStatus = 'loading';
    mockUpdate.mockResolvedValue(undefined);
    mockGet.mockReturnValue(null);

    render(<RefreshPage />);

    // loading 中は処理を開始しないため、update・navigateTo ともに呼ばれないことを確認する
    // waitFor は使わず、非同期処理が走らないことを即時に検証する
    await Promise.resolve(); // マイクロタスクを一巡させて非同期副作用を消化する
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });

  it('【回帰】sessionStatus が authenticated になったとき update() が引数つきで一度だけ呼ばれる', async () => {
    // 読み込み完了状態（デフォルト）で検証する
    mockSessionStatus = 'authenticated';
    mockUpdate.mockResolvedValue(undefined);
    mockGet.mockReturnValue(null);

    render(<RefreshPage />);

    await waitFor(() => {
      // 一度だけ呼ばれることを確認する（二重実行防止の hasRefreshed.current が効いていること）
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      // 引数ありであること（next-auth v5 では引数なしだと POST でなく GET になり
      // trigger:'update' が発火せずロールが即時反映されないバグの再発を防ぐ）
      expect(mockUpdate.mock.calls[0][0]).toBeDefined();
    });
  });
});
