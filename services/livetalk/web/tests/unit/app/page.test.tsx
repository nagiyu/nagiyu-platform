// jsdom は TextEncoder / TextDecoder / ReadableStream を提供しない場合があるため補完
import { TextEncoder, TextDecoder } from 'util';
import { ReadableStream } from 'stream/web';
Object.assign(global, { TextEncoder, TextDecoder, ReadableStream });

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HomePage from '@/app/page';

// Live2DCanvas の dynamic import をモック（pixi.js / WebGL 依存を排除）
jest.mock('@/components/Live2DCanvas', () => ({
  __esModule: true,
  default: jest.fn(
    ({
      onPlaybackEnd,
      onPlaybackError,
    }: {
      audioUrl?: string | null;
      statusText?: string;
      onPlaybackEnd?: () => void;
      onPlaybackError?: (error: Error) => void;
    }) => (
      <div data-testid="live2d-canvas">
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
  Live2DCanvasFallback: jest.fn(() => <div data-testid="live2d-fallback" />),
}));

jest.mock('@/components/ConsentModal', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

jest.mock('@/components/SafetyModal', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

jest.mock('@/components/LicenseFooter', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

jest.mock('@/components/ResponseDisplay', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

// jsdom は URL.createObjectURL / revokeObjectURL 未実装
Object.defineProperty(global.URL, 'createObjectURL', {
  writable: true,
  value: jest.fn(() => 'blob:mock'),
});
Object.defineProperty(global.URL, 'revokeObjectURL', {
  writable: true,
  value: jest.fn(),
});

/** /api/consent が同意済みを返す fetch モックを設定する */
function setupFetchMocks(chatOk = false) {
  const encoder = new TextEncoder();
  const chatStream = new ReadableStream({
    start(controller) {
      if (chatOk) {
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
    return Promise.resolve({ ok: chatOk, body: chatStream });
  });
}

/** window.AudioContext をモック AudioContext クラスで上書きし、cleanup を返す */
function setupMockAudioContext(state: 'suspended' | 'running') {
  const mockResume = jest.fn().mockResolvedValue(undefined);
  const instance = { state, resume: mockResume };
  const MockAudioContext = jest.fn(() => instance);

  Object.defineProperty(window, 'AudioContext', {
    writable: true,
    configurable: true,
    value: MockAudioContext,
  });

  return { MockAudioContext, instance, mockResume };
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
    setupFetchMocks(true); // done イベント付きで phase が idle に戻る
    const { MockAudioContext, mockResume } = setupMockAudioContext('suspended');
    const user = userEvent.setup();

    render(<HomePage />);
    const input = await waitForInputEnabled();

    // 1 回目
    await user.type(input, 'テスト1');
    await user.click(screen.getByRole('button', { name: '送信' }));

    // phase が idle に戻るのを待つ（done イベントで advanceAudioQueue → setPhase('idle')）
    await waitFor(() => expect(input).toBeEnabled(), { timeout: 5000 });

    // 2 回目
    await user.type(input, 'テスト2');
    await user.click(screen.getByRole('button', { name: '送信' }));

    // コンストラクタは 1 回だけ（インスタンスを再利用）
    expect(MockAudioContext).toHaveBeenCalledTimes(1);
    // suspended なので 2 回とも resume() が呼ばれる
    expect(mockResume).toHaveBeenCalledTimes(2);
  });

  it('window.AudioContext が undefined のとき webkitAudioContext をフォールバックで使う', async () => {
    setupFetchMocks();
    const mockResume = jest.fn().mockResolvedValue(undefined);
    const MockWebkitAudioContext = jest.fn(() => ({ state: 'suspended', resume: mockResume }));

    // AudioContext を未定義にして webkit フォールバックを設定
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
    removeAudioContext(); // AudioContext も webkitAudioContext も未定義

    const user = userEvent.setup();
    render(<HomePage />);
    const input = await waitForInputEnabled();

    await user.type(input, 'テスト');
    // エラーが throw されないことを確認
    await expect(user.click(screen.getByRole('button', { name: '送信' }))).resolves.toBeUndefined();
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
