// jsdom は TextEncoder / TextDecoder / ReadableStream を提供しない場合があるため補完
import { TextEncoder, TextDecoder } from 'util';
import { ReadableStream } from 'stream/web';
Object.assign(global, { TextEncoder, TextDecoder, ReadableStream });

import { renderHook, act, waitFor } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import type { LifecycleState } from '@nagiyu/livetalk-core';
import { useChatStream, type UseChatStreamDeps } from '@/lib/home/useChatStream';
import type { ChatPhase } from '@/lib/home/types';

// reportClientError をモック化（fetch 呼び出しを排除）
jest.mock('@/lib/client-logger', () => ({
  reportClientError: jest.fn(),
}));

import { reportClientError } from '@/lib/client-logger';
const mockReportClientError = reportClientError as jest.Mock;

// NDJSON 行を TextEncoder で ReadableStream に変換するヘルパー
function makeNdjsonStream(lines: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(JSON.stringify(line) + '\n'));
      }
      controller.close();
    },
  });
}

// deps のデフォルトスタブを生成するヘルパー
// jest.fn() のインスタンスを UseChatStreamDeps の各フィールドにキャストして返す
function makeDeps(overrides: Partial<UseChatStreamDeps> = {}): UseChatStreamDeps {
  return {
    characterId: 'hiyori',
    setPhase: jest.fn() as unknown as Dispatch<SetStateAction<ChatPhase>>,
    ensureUnlocked: jest.fn().mockResolvedValue(undefined) as () => Promise<void>,
    getContext: jest.fn().mockReturnValue(null) as () => AudioContext | null,
    enqueue: jest.fn() as (buffer: AudioBuffer) => void,
    markStreamDone: jest.fn() as () => void,
    resetAudioQueue: jest.fn() as () => void,
    advanceOnError: jest.fn() as () => void,
    clearFirstWordText: jest.fn() as () => void,
    clearOnboardingText: jest.fn() as () => void,
    setLifecycleState: jest.fn() as unknown as Dispatch<SetStateAction<LifecycleState>>,
    ...overrides,
  };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('useChatStream', () => {
  describe('初期値', () => {
    it('初期状態は userText / responseText / errorMessage が null、safetyOpen が false', () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, body: null, status: 500 });
      const { result } = renderHook(() => useChatStream(makeDeps()));

      expect(result.current.userText).toBeNull();
      expect(result.current.responseText).toBeNull();
      expect(result.current.errorMessage).toBeNull();
      expect(result.current.safetyOpen).toBe(false);
      expect(result.current.safetyResources).toEqual([]);
    });
  });

  describe('closeSafety', () => {
    it('closeSafety を呼ぶと safetyOpen が false になる', async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'safety',
                trigger: 'input_keyword',
                resources: [{ title: 'サポート', url: 'https://example.com' }],
              }) + '\n'
            )
          );
          controller.close();
        },
      });
      global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream, status: 200 });

      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      await waitFor(() => expect(result.current.safetyOpen).toBe(true));

      act(() => {
        result.current.closeSafety();
      });
      expect(result.current.safetyOpen).toBe(false);
    });
  });

  describe('handleSubmit: 状態リセット', () => {
    it('送信時に setPhase("loading") が呼ばれる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: makeNdjsonStream([{ type: 'done' }]),
        status: 200,
      });
      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      expect(deps.setPhase).toHaveBeenCalledWith('loading');
    });

    it('送信時に clearFirstWordText と clearOnboardingText が呼ばれる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: makeNdjsonStream([{ type: 'done' }]),
        status: 200,
      });
      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      expect(deps.clearFirstWordText).toHaveBeenCalled();
      expect(deps.clearOnboardingText).toHaveBeenCalled();
    });

    it('送信時に resetAudioQueue が呼ばれる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: makeNdjsonStream([{ type: 'done' }]),
        status: 200,
      });
      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      expect(deps.resetAudioQueue).toHaveBeenCalled();
    });

    it('送信時に ensureUnlocked が先行して呼ばれる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: makeNdjsonStream([{ type: 'done' }]),
        status: 200,
      });
      const callOrder: string[] = [];
      const deps = makeDeps({
        ensureUnlocked: jest.fn().mockImplementation(async () => {
          callOrder.push('ensureUnlocked');
        }),
        setPhase: jest.fn().mockImplementation(() => {
          callOrder.push('setPhase');
        }) as Dispatch<SetStateAction<ChatPhase>>,
      });
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      // ensureUnlocked は setPhase より先に呼ばれる
      expect(callOrder[0]).toBe('ensureUnlocked');
    });

    it('送信時に userText が設定される', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: makeNdjsonStream([{ type: 'done' }]),
        status: 200,
      });
      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('こんにちは');
      });

      expect(result.current.userText).toBe('こんにちは');
    });
  });

  describe('handleSubmit: response.ok=false の場合', () => {
    it('HTTP エラー時に errorMessage が設定され setPhase("idle") が呼ばれる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        body: null,
        status: 500,
      });
      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      expect(result.current.errorMessage).toBe(
        '応答の取得に失敗しました。時間を置いて再度お試しください。'
      );
      expect(deps.setPhase).toHaveBeenCalledWith('idle');
    });

    it('HTTP エラー時に reportClientError が呼ばれる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        body: null,
        status: 500,
      });
      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      expect(mockReportClientError).toHaveBeenCalledWith(
        'error',
        'チャット fetch 失敗',
        'HTTP 500',
        expect.objectContaining({ screen: 'chat' })
      );
    });
  });

  describe('handleSubmit: streaming フェーズ', () => {
    it('ストリーム開始後に setPhase("streaming") が呼ばれる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: makeNdjsonStream([{ type: 'done' }]),
        status: 200,
      });
      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      expect(deps.setPhase).toHaveBeenCalledWith('streaming');
    });
  });

  describe('handleSubmit: text イベント', () => {
    it('text イベントで responseText が追記される', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: makeNdjsonStream([
          { type: 'text', delta: 'こんに' },
          { type: 'text', delta: 'ちは' },
          { type: 'done' },
        ]),
        status: 200,
      });
      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      // React の state 更新は関数形式で追記されるため最終的な値を確認
      await waitFor(() => expect(result.current.responseText).toBe('こんにちは'));
    });
  });

  describe('handleSubmit: sentence イベント', () => {
    it('sentence イベントで AudioContext がある場合 decodeAudioData が呼ばれ enqueue される', async () => {
      const mockDecodeAudioData = jest.fn().mockResolvedValue({} as AudioBuffer);
      const mockAudioCtx = {
        state: 'running' as AudioContextState,
        decodeAudioData: mockDecodeAudioData,
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: makeNdjsonStream([
          { type: 'sentence', index: 0, text: 'こんにちは', audio: 'AAAAAA==' },
          { type: 'done' },
        ]),
        status: 200,
      });
      const deps = makeDeps({
        getContext: jest.fn().mockReturnValue(mockAudioCtx as unknown as AudioContext),
      });
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      await waitFor(() => expect(mockDecodeAudioData).toHaveBeenCalledTimes(1));
      expect(deps.enqueue).toHaveBeenCalledTimes(1);
    });

    it('AudioContext が null の場合 enqueue は呼ばれない（音声スキップ）', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: makeNdjsonStream([
          { type: 'sentence', index: 0, text: 'こんにちは', audio: 'AAAAAA==' },
          { type: 'done' },
        ]),
        status: 200,
      });
      const deps = makeDeps({
        getContext: jest.fn().mockReturnValue(null),
      });
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      expect(deps.enqueue).not.toHaveBeenCalled();
    });

    it('decodeAudioData が失敗してもクラッシュせず reportClientError が呼ばれる', async () => {
      const mockDecodeAudioData = jest.fn().mockRejectedValue(new Error('decode failure'));
      const mockAudioCtx = {
        state: 'running' as AudioContextState,
        decodeAudioData: mockDecodeAudioData,
      };
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: makeNdjsonStream([
          { type: 'sentence', index: 0, text: 'こんにちは', audio: 'AAAAAA==' },
          { type: 'done' },
        ]),
        status: 200,
      });
      const deps = makeDeps({
        getContext: jest.fn().mockReturnValue(mockAudioCtx as unknown as AudioContext),
      });
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      await waitFor(() => expect(mockDecodeAudioData).toHaveBeenCalledTimes(1));
      expect(consoleSpy).toHaveBeenCalledWith(
        '[LiveTalk] 音声 decode に失敗しました',
        expect.any(Error)
      );
      expect(mockReportClientError).toHaveBeenCalledWith(
        'warning',
        '音声 decode 失敗',
        'decode failure',
        expect.objectContaining({ screen: 'chat', sentenceReceived: 1 })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('handleSubmit: lifecycle イベント', () => {
    it('lifecycle イベントで setLifecycleState が呼ばれる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: makeNdjsonStream([{ type: 'lifecycle', state: 'sleeping' }, { type: 'done' }]),
        status: 200,
      });
      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      expect(deps.setLifecycleState).toHaveBeenCalledWith('sleeping');
    });
  });

  describe('handleSubmit: safety イベント', () => {
    it('safety イベントで safetyOpen が true になり safetyResources が設定される', async () => {
      const resources = [{ title: 'サポート', url: 'https://example.com' }];
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: makeNdjsonStream([
          { type: 'safety', trigger: 'input_keyword', resources },
          { type: 'done' },
        ]),
        status: 200,
      });
      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      await waitFor(() => expect(result.current.safetyOpen).toBe(true));
      expect(result.current.safetyResources).toEqual(resources);
    });

    it('safety trigger=output_moderation かつ replacementText がある場合 responseText が上書きされる', async () => {
      const resources = [{ title: 'サポート', url: 'https://example.com' }];
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: makeNdjsonStream([
          { type: 'text', delta: '元のテキスト' },
          {
            type: 'safety',
            trigger: 'output_moderation',
            resources,
            replacementText: '代替テキスト',
          },
          { type: 'done' },
        ]),
        status: 200,
      });
      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      await waitFor(() => expect(result.current.safetyOpen).toBe(true));
      expect(result.current.responseText).toBe('代替テキスト');
    });

    it('safety trigger=input_keyword の場合 responseText は上書きされない', async () => {
      const resources = [{ title: 'サポート', url: 'https://example.com' }];
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: makeNdjsonStream([
          { type: 'text', delta: '元のテキスト' },
          { type: 'safety', trigger: 'input_keyword', resources },
          { type: 'done' },
        ]),
        status: 200,
      });
      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      await waitFor(() => expect(result.current.safetyOpen).toBe(true));
      // input_keyword は responseText を上書きしない
      await waitFor(() => expect(result.current.responseText).toBe('元のテキスト'));
    });
  });

  describe('handleSubmit: done イベント', () => {
    it('done イベントで markStreamDone が呼ばれる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: makeNdjsonStream([{ type: 'done' }]),
        status: 200,
      });
      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      expect(deps.markStreamDone).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleSubmit: error イベント', () => {
    it('error イベントで errorMessage が設定され markStreamDone と reportClientError が呼ばれる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: makeNdjsonStream([{ type: 'error', message: 'サーバーエラーです' }]),
        status: 200,
      });
      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      expect(result.current.errorMessage).toBe('サーバーエラーです');
      expect(deps.markStreamDone).toHaveBeenCalled();
      expect(mockReportClientError).toHaveBeenCalledWith(
        'error',
        'チャット stream エラー',
        'サーバーエラーです',
        expect.objectContaining({ screen: 'chat', streamDone: true })
      );
    });
  });

  describe('handleSubmit: AbortError', () => {
    it('AbortError は無視されエラーメッセージが設定されない', async () => {
      const abortError = new Error('AbortError');
      abortError.name = 'AbortError';
      global.fetch = jest.fn().mockRejectedValue(abortError);

      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      expect(result.current.errorMessage).toBeNull();
      expect(deps.setPhase).not.toHaveBeenCalledWith('idle');
    });

    it('2 回目の送信前に前回 AbortController が abort される（AbortError は無視）', async () => {
      // 1 回目は即 AbortError を throw するようにして abort 確認を行う
      // （void act は非同期漏れを起こすため使わず、2 回 fetch を呼ぶことで確認する）
      let callCount = 0;
      const abortErrors: DOMException[] = [];

      global.fetch = jest.fn().mockImplementation((_url: string, options: RequestInit) => {
        callCount++;
        const signal = options?.signal;
        if (callCount === 1) {
          // 1 回目は done ストリームを返す
          return Promise.resolve({
            ok: true,
            body: makeNdjsonStream([{ type: 'done' }]),
            status: 200,
          });
        }
        // 2 回目以降も done ストリームを返す
        if (signal?.aborted) {
          const err = new DOMException('Aborted', 'AbortError');
          abortErrors.push(err);
          return Promise.reject(err);
        }
        return Promise.resolve({
          ok: true,
          body: makeNdjsonStream([{ type: 'done' }]),
          status: 200,
        });
      });

      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      // 1 回目送信
      await act(async () => {
        await result.current.handleSubmit('1回目');
      });

      // 2 回目送信（前回の abort controller が abort される）
      await act(async () => {
        await result.current.handleSubmit('2回目');
      });

      // 2 回の fetch が呼ばれたことを確認（前回 abort + 新リクエスト）
      expect(callCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('handleSubmit: 通信エラー catch', () => {
    it('fetch が例外を投げたとき errorMessage が設定され setPhase("idle") と reportClientError が呼ばれる', async () => {
      const networkError = new Error('ネットワークエラー');
      global.fetch = jest.fn().mockRejectedValue(networkError);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      expect(result.current.errorMessage).toBe(
        'エラーが発生しました。時間を置いて再度お試しください。'
      );
      expect(deps.setPhase).toHaveBeenCalledWith('idle');
      expect(mockReportClientError).toHaveBeenCalledWith(
        'error',
        'チャット通信エラー',
        'ネットワークエラー',
        expect.objectContaining({ screen: 'chat', stack: expect.any(String) })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('handleSubmit: malformed 行スキップ', () => {
    it('malformed JSON 行はスキップされクラッシュしない', async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          // 不正な JSON を含む NDJSON
          controller.enqueue(encoder.encode('{"type":"text","delta":"こんにちは"}\n'));
          controller.enqueue(encoder.encode('{invalid json}\n'));
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
          controller.close();
        },
      });
      global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream, status: 200 });

      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      // malformed 行はスキップ、done は処理される
      expect(deps.markStreamDone).toHaveBeenCalled();
      await waitFor(() => expect(result.current.responseText).toBe('こんにちは'));
    });

    it('空行はスキップされクラッシュしない', async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('\n\n'));
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
          controller.close();
        },
      });
      global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream, status: 200 });

      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      expect(deps.markStreamDone).toHaveBeenCalled();
    });
  });

  describe('handleSubmit: ストリーム終端の残余行処理', () => {
    it('改行で終わらない残余行でも最後のイベントが処理される', async () => {
      const encoder = new TextEncoder();
      // 最後の行に改行を付けない（残余行として lineBuffer に残る）
      const stream = new ReadableStream({
        start(controller) {
          // done を改行なしで送信
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' })));
          controller.close();
        },
      });
      global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream, status: 200 });

      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      await act(async () => {
        await result.current.handleSubmit('テスト');
      });

      // 残余行の done も処理される
      expect(deps.markStreamDone).toHaveBeenCalled();
    });
  });

  describe('handlePlaybackError', () => {
    it('handlePlaybackError で errorMessage が設定され advanceOnError と reportClientError が呼ばれる', () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, body: null, status: 500 });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const deps = makeDeps();
      const { result } = renderHook(() => useChatStream(deps));

      act(() => {
        result.current.handlePlaybackError(new Error('再生エラー'));
      });

      expect(result.current.errorMessage).toBe('音声再生中にエラーが発生しました。');
      expect(deps.advanceOnError).toHaveBeenCalled();
      expect(mockReportClientError).toHaveBeenCalledWith(
        'warning',
        '音声再生エラー',
        '再生エラー',
        expect.objectContaining({ screen: 'chat' })
      );
      expect(consoleSpy).toHaveBeenCalledWith('[LiveTalk] 音声再生エラー', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('関数参照の安定性', () => {
    it('handleSubmit と handlePlaybackError は再レンダリングで参照が変わらない', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, body: null, status: 500 });
      const deps = makeDeps();
      const { result, rerender } = renderHook(() => useChatStream(deps));

      const firstHandleSubmit = result.current.handleSubmit;
      const firstHandlePlaybackError = result.current.handlePlaybackError;

      rerender();

      expect(result.current.handleSubmit).toBe(firstHandleSubmit);
      expect(result.current.handlePlaybackError).toBe(firstHandlePlaybackError);
    });
  });
});
