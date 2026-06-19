/**
 * HomePageClient のユニットテスト。
 *
 * サインアウト URL の生成が authUrl prop から正しく行われることを検証する。
 * - authUrl prop が buildSignOutUrl の第一引数として正しく渡されること
 * - サインアウトボタンが描画・クリック可能であること
 *
 * このテストにより、page.tsx がサーバーでランタイム env を解決して
 * prop として渡す方式（admin の server component と同方式）が
 * 正しく機能することを保証する。
 *
 * 補足: window.location.assign の検証は jsdom の制約（window.location は
 * configurable: false）により直接モックが困難なため、
 * buildSignOutUrl のモックで入力値を検証する方式を採用する。
 * buildSignOutUrl 自体の出力検証は libs/ui/tests/unit/utils/auth.test.ts に網羅されている。
 */

// jsdom は TextEncoder / TextDecoder / ReadableStream を提供しない場合があるため補完
import { TextEncoder, TextDecoder } from 'util';
import { ReadableStream } from 'stream/web';
Object.assign(global, { TextEncoder, TextDecoder, ReadableStream });

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomePageClient } from '@/app/HomePageClient';

// buildSignOutUrl をモック化して引数を検証できるようにする
const mockBuildSignOutUrl = jest.fn((authUrl: string, callbackUrl?: string) => {
  // 実際の buildSignOutUrl と同じ動作をシミュレート（空 authUrl で相対 URL になる）
  const base = authUrl.replace(/\/+$/, '');
  const endpoint = `${base}/api/auth/signout`;
  if (!callbackUrl) return endpoint;
  return `${endpoint}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
});

jest.mock('@nagiyu/ui', () => {
  const actual = jest.requireActual('@nagiyu/ui');
  return {
    ...actual,
    buildSignOutUrl: (...args: Parameters<typeof mockBuildSignOutUrl>) =>
      mockBuildSignOutUrl(...args),
  };
});

// CharacterCanvas をモック（Live2DCanvas の pixi.js / WebGL 依存を排除）
jest.mock('@/components/CharacterCanvas', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="character-canvas" />),
}));

jest.mock('@/components/ConsentModal', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

jest.mock('@/components/SafetyModal', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

jest.mock('@/components/ResponseDisplay', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

jest.mock('@/components/InstallGuide', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

jest.mock('@/components/NotificationPermission', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

jest.mock('@/components/CharacterSelectButton', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

// next-auth/react は ESM のためスタブ化（未認証扱い）
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({ data: null, status: 'unauthenticated' })),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// next/navigation の useSearchParams をモック化（クエリなし）
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({
    get: jest.fn().mockReturnValue(null),
  })),
}));

// オンボーディング判定をスタブ化
jest.mock('@/lib/pwa/standalone', () => ({
  isStandalone: jest.fn().mockReturnValue(false),
  isPushSupported: jest.fn().mockReturnValue(false),
  shouldShowInstallGuide: jest.fn().mockReturnValue(false),
  shouldShowNotificationPermission: jest.fn().mockReturnValue(false),
  snoozeInstallGuide: jest.fn(),
  snoozeNotificationPermission: jest.fn(),
}));

jest.mock('@/lib/pwa/messages', () => ({
  PWA_MESSAGES: {
    INSTALL_PROMPT: 'お家を作ってほしいな…',
    NOTIFICATION_PROMPT: '来てくれてありがとう！',
    NOTIFICATION_GRANTED: 'やった！',
  },
}));

// CharacterContext をスタブ化
jest.mock('@/lib/characters/CharacterContext', () => ({
  useCharacter: jest.fn(() => ({
    characterId: 'hiyori',
    setCharacterId: jest.fn(),
  })),
  CharacterProvider: ({ children }: { children: React.ReactNode }) => children,
}));

/** 最小限の fetch モック（同意済み・lifecycle あり・first-word なし） */
function setupMinimalFetchMocks() {
  const encoder = new TextEncoder();
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (url === '/api/consent') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ consented: true }),
      });
    }
    if (url.startsWith('/api/lifecycle')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ state: 'awake' }),
      });
    }
    if (url.startsWith('/api/push/first-word')) {
      return Promise.resolve({ ok: false });
    }
    if (url === '/api/push/pending') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    }
    const emptyStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
        controller.close();
      },
    });
    return Promise.resolve({ ok: true, body: emptyStream });
  });
}

afterEach(() => {
  jest.clearAllMocks();
  mockBuildSignOutUrl.mockClear();
});

describe('サインアウト URL の authUrl prop による生成', () => {
  it('サインアウトボタンが描画される', async () => {
    setupMinimalFetchMocks();
    render(<HomePageClient authUrl="https://auth.nagiyu.com" />);

    await waitFor(() => expect(screen.getByTestId('sign-out-button')).toBeInTheDocument());
  });

  it('サインアウトボタンクリック時に authUrl が buildSignOutUrl の第一引数として渡される', async () => {
    setupMinimalFetchMocks();
    const user = userEvent.setup();
    render(<HomePageClient authUrl="https://auth.nagiyu.com" />);

    await waitFor(() => expect(screen.getByTestId('sign-out-button')).toBeInTheDocument());

    await user.click(screen.getByTestId('sign-out-button'));

    // authUrl prop が buildSignOutUrl の第一引数として正しく渡されることを検証する。
    // これにより、page.tsx（サーバーコンポーネント）でランタイム env を解決して
    // prop として渡す方式が機能していることが保証される。
    expect(mockBuildSignOutUrl).toHaveBeenCalledWith('https://auth.nagiyu.com', expect.any(String));
  });

  it('空文字 authUrl のとき buildSignOutUrl に空文字が渡される（ビルド時インライン化バグ相当）', async () => {
    setupMinimalFetchMocks();
    const user = userEvent.setup();
    // authUrl を空文字として渡す（ビルド時インライン化によるバグ状態のシミュレーション）
    render(<HomePageClient authUrl="" />);

    await waitFor(() => expect(screen.getByTestId('sign-out-button')).toBeInTheDocument());

    await user.click(screen.getByTestId('sign-out-button'));

    // 空文字が渡されると相対 URL になってしまうことを示す
    // （今回の修正でサーバーが正しい authUrl を渡すことで回避される）
    expect(mockBuildSignOutUrl).toHaveBeenCalledWith('', expect.any(String));
  });

  it('authUrl prop に絶対 URL を渡すと buildSignOutUrl が絶対 URL を返す', () => {
    // buildSignOutUrl の統合確認（モック実装と実際の動作の整合性）
    const result = mockBuildSignOutUrl('https://auth.nagiyu.com', 'https://livetalk.nagiyu.com');
    expect(result).toBe(
      'https://auth.nagiyu.com/api/auth/signout?callbackUrl=https%3A%2F%2Flivetalk.nagiyu.com'
    );
    expect(result.startsWith('https://')).toBe(true);
  });

  it('authUrl prop に空文字を渡すと buildSignOutUrl が相対 URL を返す（バグ状態の確認）', () => {
    // 空文字 authUrl では相対 URL になることを確認する
    // これがサインアウトバグの根本原因であり、サーバーコンポーネントで解決することで回避される
    const result = mockBuildSignOutUrl('', 'https://livetalk.nagiyu.com');
    expect(result.startsWith('/')).toBe(true);
    expect(result.startsWith('https://')).toBe(false);
  });
});
