// jsdom は TextEncoder / TextDecoder / ReadableStream を提供しない場合があるため補完
import { TextEncoder, TextDecoder } from 'util';
import { ReadableStream } from 'stream/web';
Object.assign(global, { TextEncoder, TextDecoder, ReadableStream });

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HomePage from '@/app/page';

// CharacterCanvas をモック（Live2DCanvas の pixi.js / WebGL 依存、PlaceholderCanvas の Web Audio 依存を排除）
jest.mock('@/components/CharacterCanvas', () => ({
  __esModule: true,
  default: jest.fn(
    ({
      onPlaybackEnd,
      onPlaybackError,
    }: {
      characterId?: string;
      audioBuffer?: AudioBuffer | null;
      audioContext?: AudioContext | null;
      statusText?: string;
      lifecycleState?: string;
      onPlaybackEnd?: () => void;
      onPlaybackError?: (error: Error) => void;
    }) => (
      <div data-testid="character-canvas">
        <button data-testid="trigger-playback-end" onClick={onPlaybackEnd}>
          end
        </button>
        <button
          data-testid="trigger-playback-error"
          onClick={() => onPlaybackError?.(new Error('再生エラー'))}
        >
          error
        </button>
      </div>
    )
  ),
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

// next-auth/react は ESM のため jest が transform できない。
// HomePage は useSession で livetalk:admin 判定のみに使うため、未認証扱いでスタブ化する。
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({ data: null, status: 'unauthenticated' })),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// next/navigation の useSearchParams をモック化する。
// デフォルトはクエリなし（自前起動）として設定する。
const mockSearchParamsGet = jest.fn().mockReturnValue(null);
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({
    get: mockSearchParamsGet,
  })),
}));

// オンボーディング判定がチャットテストに干渉しないようにスタブ化する
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

// CharacterContext: useCharacter を hiyori 固定でスタブ化する。
// setCharacterId のスパイを外部から差し替えられるよう、モジュール変数として保持する。
const mockSetCharacterId = jest.fn();
jest.mock('@/lib/characters/CharacterContext', () => ({
  useCharacter: jest.fn(() => ({
    characterId: 'hiyori',
    setCharacterId: mockSetCharacterId,
  })),
  CharacterProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// CharacterSelectButton: DOM 描画のみで動作確認に不要
jest.mock('@/components/CharacterSelectButton', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

/** /api/consent が同意済みを返す fetch モックを設定する */
function setupFetchMocks(chatOk = false, sentenceAudio?: string) {
  const encoder = new TextEncoder();
  const chatStream = new ReadableStream({
    start(controller) {
      if (chatOk) {
        if (sentenceAudio) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'sentence',
                index: 0,
                text: 'こんにちは',
                audio: sentenceAudio,
              }) + '\n'
            )
          );
        }
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
      }
      controller.close();
    },
  });

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
    // first-word は characterId クエリ付きで呼ばれる（Phase C 対応）
    if (url.startsWith('/api/push/first-word')) {
      return Promise.resolve({ ok: false });
    }
    // pending は空配列を返す（デフォルト）
    if (url === '/api/push/pending') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    }
    return Promise.resolve({ ok: chatOk, body: chatStream });
  });
}

/** window.AudioContext をモック AudioContext クラスで上書きし、cleanup を返す */
function setupMockAudioContext(state: 'suspended' | 'running' = 'suspended') {
  const mockResume = jest.fn().mockResolvedValue(undefined);
  const mockDecodeAudioData = jest.fn().mockResolvedValue({} as AudioBuffer);
  const instance = { state, resume: mockResume, decodeAudioData: mockDecodeAudioData };
  const MockAudioContext = jest.fn(() => instance);

  Object.defineProperty(window, 'AudioContext', {
    writable: true,
    configurable: true,
    value: MockAudioContext,
  });

  return { MockAudioContext, instance, mockResume, mockDecodeAudioData };
}

function removeAudioContext() {
  Object.defineProperty(window, 'AudioContext', {
    writable: true,
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(window, 'webkitAudioContext', {
    writable: true,
    configurable: true,
    value: undefined,
  });
}

afterEach(() => {
  jest.clearAllMocks();
  removeAudioContext();
  // デフォルトのクエリなし状態に戻す
  mockSearchParamsGet.mockReturnValue(null);
});

/** 同意チェック完了を待ち、有効化された入力欄を返す */
async function waitForInputEnabled() {
  await waitFor(() => expect(screen.getByPlaceholderText('メッセージを入力')).toBeEnabled());
  return screen.getByPlaceholderText('メッセージを入力');
}

describe('AudioContext unlock（iOS Safari autoplay 制約対策）', () => {
  it('handleSubmit 時に AudioContext が作成され resume() が呼ばれる（suspended 状態）', async () => {
    setupFetchMocks();
    const { MockAudioContext, mockResume } = setupMockAudioContext('suspended');
    const user = userEvent.setup();

    render(<HomePage />);
    const input = await waitForInputEnabled();

    await user.type(input, 'こんにちは');
    await user.click(screen.getByRole('button', { name: '送信' }));

    expect(MockAudioContext).toHaveBeenCalledTimes(1);
    expect(mockResume).toHaveBeenCalledTimes(1);
  });

  it('AudioContext が running 状態のとき resume() は呼ばれない', async () => {
    setupFetchMocks();
    const { MockAudioContext, mockResume } = setupMockAudioContext('running');
    const user = userEvent.setup();

    render(<HomePage />);
    const input = await waitForInputEnabled();

    await user.type(input, 'テスト');
    await user.click(screen.getByRole('button', { name: '送信' }));

    expect(MockAudioContext).toHaveBeenCalledTimes(1);
    expect(mockResume).not.toHaveBeenCalled();
  });

  it('2 回目の submit では AudioContext を再生成しない（インスタンスを再利用）', async () => {
    setupFetchMocks(true);
    const { MockAudioContext, mockResume } = setupMockAudioContext('suspended');
    const user = userEvent.setup();

    render(<HomePage />);
    const input = await waitForInputEnabled();

    // 1 回目
    await user.type(input, 'テスト1');
    await user.click(screen.getByRole('button', { name: '送信' }));
    await waitFor(() => expect(input).toBeEnabled(), { timeout: 5000 });

    // 2 回目
    await user.type(input, 'テスト2');
    await user.click(screen.getByRole('button', { name: '送信' }));

    expect(MockAudioContext).toHaveBeenCalledTimes(1);
    expect(mockResume).toHaveBeenCalledTimes(2);
  });

  it('window.AudioContext が undefined のとき webkitAudioContext をフォールバックで使う', async () => {
    setupFetchMocks();
    const mockResume = jest.fn().mockResolvedValue(undefined);
    const mockDecodeAudioData = jest.fn().mockResolvedValue({} as AudioBuffer);
    const MockWebkitAudioContext = jest.fn(() => ({
      state: 'suspended',
      resume: mockResume,
      decodeAudioData: mockDecodeAudioData,
    }));

    removeAudioContext();
    Object.defineProperty(window, 'webkitAudioContext', {
      writable: true,
      configurable: true,
      value: MockWebkitAudioContext,
    });

    const user = userEvent.setup();
    render(<HomePage />);
    const input = await waitForInputEnabled();

    await user.type(input, 'テスト');
    await user.click(screen.getByRole('button', { name: '送信' }));

    expect(MockWebkitAudioContext).toHaveBeenCalledTimes(1);
    expect(mockResume).toHaveBeenCalledTimes(1);
  });

  it('AudioContext が利用不可の環境でもクラッシュしない', async () => {
    setupFetchMocks();
    removeAudioContext();

    const user = userEvent.setup();
    render(<HomePage />);
    const input = await waitForInputEnabled();

    await user.type(input, 'テスト');
    await expect(user.click(screen.getByRole('button', { name: '送信' }))).resolves.toBeUndefined();
  });
});

describe('音声 decode と queue 管理', () => {
  it('sentence event を受け取ったら decodeAudioData が呼ばれる', async () => {
    // 短い base64 文字列を sentence audio として送る
    const base64Audio = 'AAAAAA=='; // 任意の base64
    setupFetchMocks(true, base64Audio);
    const { mockDecodeAudioData } = setupMockAudioContext('running');
    const user = userEvent.setup();

    render(<HomePage />);
    const input = await waitForInputEnabled();

    await user.type(input, 'テスト');
    await user.click(screen.getByRole('button', { name: '送信' }));

    await waitFor(() => expect(mockDecodeAudioData).toHaveBeenCalledTimes(1));
  });

  it('decodeAudioData が失敗してもクラッシュしない（テキストは出る）', async () => {
    const base64Audio = 'AAAAAA==';
    setupFetchMocks(true, base64Audio);
    const { mockDecodeAudioData } = setupMockAudioContext('running');
    mockDecodeAudioData.mockRejectedValueOnce(new Error('decode failure'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();

    render(<HomePage />);
    const input = await waitForInputEnabled();

    await user.type(input, 'テスト');
    await expect(user.click(screen.getByRole('button', { name: '送信' }))).resolves.toBeUndefined();

    await waitFor(() => expect(mockDecodeAudioData).toHaveBeenCalledTimes(1));
    expect(consoleSpy).toHaveBeenCalledWith(
      '[LiveTalk] 音声 decode に失敗しました',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});

describe('handlePlaybackError のデバッグログ', () => {
  it('onPlaybackError 発火時に console.error でエラーを出力する', async () => {
    setupFetchMocks();
    setupMockAudioContext('running');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<HomePage />);
    await waitForInputEnabled();

    const triggerError = screen.getByTestId('trigger-playback-error');
    await userEvent.click(triggerError);

    expect(consoleSpy).toHaveBeenCalledWith('[LiveTalk] 音声再生エラー', expect.any(Error));
    consoleSpy.mockRestore();
  });
});

describe('Phase C: push クリック起動（URL ?character=<id> あり）', () => {
  it('URL に ?character=ageha があるとき setCharacterId(ageha) が呼ばれる', async () => {
    // searchParams の get('character') が 'ageha' を返すように設定
    mockSearchParamsGet.mockImplementation((key: string) => {
      if (key === 'character') return 'ageha';
      return null;
    });

    const encoder = new TextEncoder();
    const chatStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
        controller.close();
      },
    });

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url === '/api/consent') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ consented: true }) });
      }
      if (url.startsWith('/api/lifecycle')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ state: 'awake' }) });
      }
      if (url.startsWith('/api/push/first-word')) {
        return Promise.resolve({ ok: false });
      }
      if (url === '/api/push/pending') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, body: chatStream });
    });

    render(<HomePage />);
    await waitForInputEnabled();

    // searchParams の 'character' が 'ageha' なので setCharacterId('ageha') が呼ばれる
    expect(mockSetCharacterId).toHaveBeenCalledWith('ageha');
  });

  it('URL に ?character=unknown（未登録 ID）があっても setCharacterId は呼ばれない', async () => {
    mockSearchParamsGet.mockImplementation((key: string) => {
      if (key === 'character') return 'unknown-character-xyz';
      return null;
    });

    setupFetchMocks();
    render(<HomePage />);
    await waitForInputEnabled();

    expect(mockSetCharacterId).not.toHaveBeenCalled();
  });
});

describe('Phase C: first-word 取得のキャラクター依存化', () => {
  it('first-word を ?characterId=hiyori 付きで取得する', async () => {
    const encoder = new TextEncoder();
    const chatStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
        controller.close();
      },
    });

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url === '/api/consent') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ consented: true }) });
      }
      if (url.startsWith('/api/lifecycle')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ state: 'awake' }) });
      }
      if (url.startsWith('/api/push/first-word')) {
        return Promise.resolve({ ok: false });
      }
      if (url === '/api/push/pending') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, body: chatStream });
    });

    render(<HomePage />);
    await waitForInputEnabled();

    // first-word が characterId=hiyori クエリ付きで呼ばれることを確認
    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls.map(([url]: [string]) => url);
      expect(calls.some((url) => url.includes('/api/push/first-word?characterId=hiyori'))).toBe(
        true
      );
    });
  });

  it('カレントキャラの未消化通知を第一声として表示し consume する', async () => {
    const encoder = new TextEncoder();
    const chatStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
        controller.close();
      },
    });

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url === '/api/consent') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ consented: true }) });
      }
      if (url.startsWith('/api/lifecycle')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ state: 'awake' }) });
      }
      if (url.startsWith('/api/push/first-word')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              notifId: 'n1',
              body: 'ひよりの第一声',
              knowledgeId: 'k-hiyori',
              characterId: 'hiyori',
            }),
        });
      }
      if (url === '/api/push/consumed') {
        return Promise.resolve({ ok: true });
      }
      if (url === '/api/push/pending') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, body: chatStream });
    });

    render(<HomePage />);
    await waitForInputEnabled();

    // first-word が取得されたら consume も呼ばれる
    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls.map(([url]: [string]) => url);
      expect(calls.some((url) => url === '/api/push/consumed')).toBe(true);
    });

    // PATCH /api/push/consumed が notifId: 'n1' で呼ばれることを確認
    const consumedCall = (global.fetch as jest.Mock).mock.calls.find(
      ([url]: [string]) => url === '/api/push/consumed'
    );
    expect(consumedCall).toBeDefined();
    const consumedBody = JSON.parse(consumedCall[1].body as string);
    expect(consumedBody.notifId).toBe('n1');
  });
});

describe('Phase C: 自前起動で他キャラに未消化通知がある場合の提示', () => {
  it('カレント=hiyori、ageha に未消化通知 → アゲハからの通知ヒントが表示される（consume しない）', async () => {
    const encoder = new TextEncoder();
    const chatStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
        controller.close();
      },
    });

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url === '/api/consent') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ consented: true }) });
      }
      if (url.startsWith('/api/lifecycle')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ state: 'awake' }) });
      }
      if (url.startsWith('/api/push/first-word')) {
        return Promise.resolve({ ok: false });
      }
      if (url === '/api/push/consumed') {
        return Promise.resolve({ ok: true });
      }
      if (url === '/api/push/pending') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([{ characterId: 'ageha', notifId: 'n2', body: 'アゲハより' }]),
        });
      }
      return Promise.resolve({ ok: true, body: chatStream });
    });

    render(<HomePage />);
    await waitForInputEnabled();

    // ageha の未消化通知ヒントが表示される
    await waitFor(() => {
      expect(screen.getByTestId('pending-notification-ageha')).toBeInTheDocument();
    });
    expect(screen.getByTestId('pending-notification-ageha')).toHaveTextContent(
      'アゲハから連絡が来てるよ'
    );

    // consume は呼ばれていない（即 consume しない設計）
    const consumedCalls = (global.fetch as jest.Mock).mock.calls.filter(
      ([url]: [string]) => url === '/api/push/consumed'
    );
    expect(consumedCalls).toHaveLength(0);
  });

  it('pending が空配列のとき他キャラ通知ヒントは表示されない', async () => {
    setupFetchMocks();
    render(<HomePage />);
    await waitForInputEnabled();

    // 他キャラ通知ヒントは表示されない
    await waitFor(() => {
      expect(screen.queryByTestId('pending-notification-ageha')).not.toBeInTheDocument();
    });
  });

  it('pending にカレントキャラ(hiyori)自身の通知が含まれても表示されない（カレント除外）', async () => {
    const encoder = new TextEncoder();
    const chatStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
        controller.close();
      },
    });

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url === '/api/consent') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ consented: true }) });
      }
      if (url.startsWith('/api/lifecycle')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ state: 'awake' }) });
      }
      if (url.startsWith('/api/push/first-word')) {
        return Promise.resolve({ ok: false });
      }
      if (url === '/api/push/pending') {
        // カレント(hiyori)のみ pending にある状態
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([{ characterId: 'hiyori', notifId: 'n1', body: 'ひよりより' }]),
        });
      }
      return Promise.resolve({ ok: true, body: chatStream });
    });

    render(<HomePage />);
    await waitForInputEnabled();

    // hiyori はカレントなので pending ヒントは表示されない
    await waitFor(() => {
      expect(screen.queryByTestId('pending-notification-hiyori')).not.toBeInTheDocument();
    });
  });
});

describe('Phase C: クロス汚染防止（knowledgeId の chat 送信制御）', () => {
  it('カレントキャラ(hiyori)の first-word knowledgeId → 次の chat に含まれる', async () => {
    const encoder = new TextEncoder();
    const chatStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
        controller.close();
      },
    });

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url === '/api/consent') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ consented: true }) });
      }
      if (url.startsWith('/api/lifecycle')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ state: 'awake' }) });
      }
      if (url.startsWith('/api/push/first-word')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              notifId: 'n1',
              body: 'テスト第一声',
              knowledgeId: 'k-xyz',
              characterId: 'hiyori', // カレント(hiyori)と一致
            }),
        });
      }
      if (url === '/api/push/consumed') {
        return Promise.resolve({ ok: true });
      }
      if (url === '/api/push/pending') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, body: chatStream });
    });

    setupMockAudioContext('running');
    const user = userEvent.setup();
    render(<HomePage />);
    const input = await waitForInputEnabled();

    // first-word 取得を待つ
    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls.map(([url]: [string]) => url);
      expect(calls.some((url) => url.startsWith('/api/push/first-word'))).toBe(true);
    });

    await user.type(input, 'ありがとう');
    await user.click(screen.getByRole('button', { name: '送信' }));

    const chatCall = (global.fetch as jest.Mock).mock.calls.find(
      ([url]: [string]) => url === '/api/chat'
    );
    expect(chatCall).toBeDefined();
    const chatBody = JSON.parse(chatCall[1].body as string);
    expect(chatBody.knowledgeId).toBe('k-xyz');
  });

  it('2 回目の送信では knowledgeId を含まない（1 ターン限り）', async () => {
    const encoder = new TextEncoder();
    const makeChatStream = () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
          controller.close();
        },
      });

    let chatCallCount = 0;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url === '/api/consent') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ consented: true }) });
      }
      if (url.startsWith('/api/lifecycle')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ state: 'awake' }) });
      }
      if (url.startsWith('/api/push/first-word')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              notifId: 'n1',
              body: 'テスト第一声',
              knowledgeId: 'k-xyz',
              characterId: 'hiyori',
            }),
        });
      }
      if (url === '/api/push/consumed') {
        return Promise.resolve({ ok: true });
      }
      if (url === '/api/push/pending') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      chatCallCount++;
      return Promise.resolve({ ok: true, body: makeChatStream() });
    });

    setupMockAudioContext('running');
    const user = userEvent.setup();
    render(<HomePage />);
    const input = await waitForInputEnabled();

    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls.map(([url]: [string]) => url);
      expect(calls.some((url) => url.startsWith('/api/push/first-word'))).toBe(true);
    });

    // 1 回目送信
    await user.type(input, '1回目');
    await user.click(screen.getByRole('button', { name: '送信' }));
    await waitFor(() => expect(chatCallCount).toBe(1));

    // 2 回目送信
    await user.type(input, '2回目');
    await user.click(screen.getByRole('button', { name: '送信' }));
    await waitFor(() => expect(chatCallCount).toBe(2));

    const chatCalls = (global.fetch as jest.Mock).mock.calls.filter(
      ([url]: [string]) => url === '/api/chat'
    );
    expect(chatCalls).toHaveLength(2);
    const firstBody = JSON.parse(chatCalls[0][1].body as string);
    const secondBody = JSON.parse(chatCalls[1][1].body as string);
    expect(firstBody.knowledgeId).toBe('k-xyz');
    expect(secondBody.knowledgeId).toBeUndefined();
  });
});

describe('characterId の chat リクエストへの反映', () => {
  it('handleSubmit 時の fetch body に characterId が含まれる', async () => {
    const encoder = new TextEncoder();
    const chatStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
        controller.close();
      },
    });

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url === '/api/consent') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ consented: true }) });
      }
      if (url.startsWith('/api/lifecycle')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ state: 'awake' }) });
      }
      if (url.startsWith('/api/push/first-word')) {
        return Promise.resolve({ ok: false });
      }
      if (url === '/api/push/pending') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, body: chatStream });
    });

    setupMockAudioContext('running');
    const user = userEvent.setup();
    render(<HomePage />);
    const input = await waitForInputEnabled();

    await user.type(input, 'こんにちは');
    await user.click(screen.getByRole('button', { name: '送信' }));

    const chatCall = (global.fetch as jest.Mock).mock.calls.find(
      ([url]: [string]) => url === '/api/chat'
    );
    expect(chatCall).toBeDefined();
    const chatBody = JSON.parse(chatCall[1].body as string);
    // useCharacter モックが 'hiyori' を返すため、body に characterId: 'hiyori' が含まれる
    expect(chatBody.characterId).toBe('hiyori');
  });
});
