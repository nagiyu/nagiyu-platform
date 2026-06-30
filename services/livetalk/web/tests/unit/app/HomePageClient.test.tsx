/**
 * HomePageClient のユニットテスト。
 *
 * ナビゲーション・サインアウト・退会の導線は LiveTalkHeader（layout.tsx 経由）へ
 * 移設されたため、これらに依存するテストは LiveTalkHeader.test.tsx へ移設した。
 *
 * 本テストでは HomePageClient（チャット本体）が authUrl を受け取らずに正常動作することと、
 * 移設したコンポーネントへの依存が残っていないことを確認する。
 */

// jsdom は TextEncoder / TextDecoder / ReadableStream を提供しない場合があるため補完
import { TextEncoder, TextDecoder } from 'util';
import { ReadableStream } from 'stream/web';
Object.assign(global, { TextEncoder, TextDecoder, ReadableStream });

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { HomePageClient } from '@/app/HomePageClient';

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
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'done' }) + '\n'));
        controller.close();
      },
    });
    return Promise.resolve({ ok: true, body: emptyStream });
  });
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('HomePageClient の基本動作', () => {
  it('props なしで正常にレンダリングされる（authUrl prop が不要になったことの確認）', async () => {
    setupMinimalFetchMocks();
    // authUrl prop を渡さずにレンダリングできることを確認
    render(<HomePageClient />);

    // キャラクターキャンバスが描画される
    await waitFor(() => expect(screen.getByTestId('character-canvas')).toBeInTheDocument());
  });

  it('移設済みのナビゲーションリンクが本体に含まれない', async () => {
    setupMinimalFetchMocks();
    render(<HomePageClient />);

    await waitFor(() => expect(screen.getByTestId('character-canvas')).toBeInTheDocument());

    // ナビゲーションリンクは LiveTalkHeader へ移設済みのため、チャット本体には存在しない
    expect(screen.queryByRole('link', { name: '私が覚えていること' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ノート' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ステータス' })).not.toBeInTheDocument();
  });

  it('移設済みのサインアウトボタンが本体に含まれない', async () => {
    setupMinimalFetchMocks();
    render(<HomePageClient />);

    await waitFor(() => expect(screen.getByTestId('character-canvas')).toBeInTheDocument());

    // サインアウトボタンは LiveTalkHeader へ移設済みのため、チャット本体には存在しない
    expect(screen.queryByTestId('sign-out-button')).not.toBeInTheDocument();
  });

  it('移設済みの退会ボタンが本体に含まれない', async () => {
    setupMinimalFetchMocks();
    render(<HomePageClient />);

    await waitFor(() => expect(screen.getByTestId('character-canvas')).toBeInTheDocument());

    // 退会ボタンは LiveTalkHeader へ移設済みのため、チャット本体には存在しない
    expect(screen.queryByTestId('open-deletion-modal')).not.toBeInTheDocument();
  });

  it('チャット入力欄が表示される', async () => {
    setupMinimalFetchMocks();
    render(<HomePageClient />);

    await waitFor(() =>
      expect(screen.getByPlaceholderText('メッセージを入力')).toBeInTheDocument()
    );
  });
});
