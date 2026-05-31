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
      audioBuffer?: AudioBuffer | null;
      audioContext?: AudioContext | null;
      statusText?: string;
      lifecycleState?: string;
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
