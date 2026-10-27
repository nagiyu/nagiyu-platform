import React from 'react';
import { act, render } from '@testing-library/react';

// pixi.js / pixi-live2d-display-lipsyncpatch は WebGL に依存するためモック化する
const mockModelFrom = jest.fn();
jest.mock('pixi.js', () => ({
  Application: jest.fn().mockImplementation(() => ({
    view: document.createElement('canvas'),
    ticker: {},
    stage: { addChild: jest.fn() },
    renderer: { resize: jest.fn() },
    destroy: jest.fn(),
  })),
  utils: { skipHello: jest.fn() },
}));
jest.mock('pixi-live2d-display-lipsyncpatch/cubism4', () => ({
  Live2DModel: { from: (...args: unknown[]) => mockModelFrom(...args) },
}));

jest.mock('@/lib/characters/client-profiles', () => ({
  getCharacterRenderProfile: jest.fn(() => ({
    renderer: 'live2d',
    modelPath: '/assets/test-model.model3.json',
    cubismParams: {
      mouthOpenY: 'ParamMouthOpenY',
      eyeLOpen: 'ParamEyeLOpen',
      eyeROpen: 'ParamEyeROpen',
    },
  })),
}));

import { getCharacterRenderProfile } from '@/lib/characters/client-profiles';
import Live2DCanvas from '@/components/Live2DCanvas';

const mockGetCharacterRenderProfile = getCharacterRenderProfile as jest.Mock;

interface FakeSource {
  buffer: AudioBuffer | null;
  connect: jest.Mock;
  disconnect: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  onended: (() => void) | null;
}

function makeAudioContext() {
  const sources: FakeSource[] = [];
  const destination = {};
  const context = {
    destination,
    createBufferSource: jest.fn(() => {
      const source: FakeSource = {
        buffer: null,
        connect: jest.fn(),
        disconnect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
        onended: null,
      };
      sources.push(source);
      return source;
    }),
    createAnalyser: jest.fn(() => ({ connect: jest.fn(), disconnect: jest.fn() })),
  };
  return { context: context as unknown as AudioContext, sources, destination, mock: context };
}

function makeFakeModel() {
  const motionManager: Record<string, unknown> = {};
  return {
    internalModel: { width: 100, height: 200, motionManager },
    anchor: { set: jest.fn() },
    scale: { set: jest.fn() },
    x: 0,
    y: 0,
    destroy: jest.fn(),
    motionManager,
  };
}

const audioBuffer = {} as AudioBuffer;

// モデル読み込みの非同期処理（dynamic import → Cubism Core 待ち → Live2DModel.from）を流し切る
async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
  });
}

beforeAll(() => {
  global.ResizeObserver = class {
    public observe() {}
    public unobserve() {}
    public disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  (window as unknown as { Live2DCubismCore?: unknown }).Live2DCubismCore = {};
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  delete (window as unknown as { Live2DCubismCore?: unknown }).Live2DCubismCore;
  jest.restoreAllMocks();
  jest.useRealTimers();
  mockModelFrom.mockReset();
});

describe('Live2DCanvas の音声再生', () => {
  describe('モデルの読み込みに成功した場合', () => {
    it('AnalyserNode を経由して再生し、再生完了で onPlaybackEnd が呼ばれる', async () => {
      const model = makeFakeModel();
      mockModelFrom.mockResolvedValue(model);
      const { context, sources, mock } = makeAudioContext();
      const onPlaybackEnd = jest.fn();

      render(
        <Live2DCanvas
          audioBuffer={audioBuffer}
          audioContext={context}
          onPlaybackEnd={onPlaybackEnd}
        />
      );
      await flush();

      expect(mock.createAnalyser).toHaveBeenCalledTimes(1);
      expect(sources).toHaveLength(1);
      expect(sources[0].start).toHaveBeenCalledTimes(1);
      expect(model.motionManager.currentAudio).toBeTruthy();

      act(() => {
        sources[0].onended?.();
      });

      expect(onPlaybackEnd).toHaveBeenCalledTimes(1);
      expect(model.motionManager.currentAudio).toBeUndefined();
    });

    it('モデルの読み込み中は再生を始めない', async () => {
      // 解決しない Promise で読み込み中の状態を保つ
      mockModelFrom.mockReturnValue(new Promise(() => {}));
      const { context, sources } = makeAudioContext();
      const onPlaybackEnd = jest.fn();
      const onPlaybackError = jest.fn();

      render(
        <Live2DCanvas
          audioBuffer={audioBuffer}
          audioContext={context}
          onPlaybackEnd={onPlaybackEnd}
          onPlaybackError={onPlaybackError}
        />
      );
      await flush();

      expect(sources).toHaveLength(0);
      expect(onPlaybackEnd).not.toHaveBeenCalled();
      expect(onPlaybackError).not.toHaveBeenCalled();
    });
  });

  describe('モデルの読み込みに失敗した場合', () => {
    it('Live2DModel.from が失敗すると、source を destination に直結して再生し onPlaybackEnd が呼ばれる', async () => {
      mockModelFrom.mockRejectedValue(new Error('404'));
      const { context, sources, destination, mock } = makeAudioContext();
      const onPlaybackEnd = jest.fn();

      render(
        <Live2DCanvas
          audioBuffer={audioBuffer}
          audioContext={context}
          onPlaybackEnd={onPlaybackEnd}
        />
      );
      await flush();

      expect(mock.createAnalyser).not.toHaveBeenCalled();
      expect(sources).toHaveLength(1);
      expect(sources[0].buffer).toBe(audioBuffer);
      expect(sources[0].connect).toHaveBeenCalledWith(destination);
      expect(sources[0].start).toHaveBeenCalledTimes(1);
      expect(onPlaybackEnd).not.toHaveBeenCalled();

      act(() => {
        sources[0].onended?.();
      });

      expect(onPlaybackEnd).toHaveBeenCalledTimes(1);
    });

    it('音声が読み込み失敗より先に渡されていても、失敗の確定後に再生される', async () => {
      let rejectModel: (reason: Error) => void = () => {};
      mockModelFrom.mockReturnValue(
        new Promise((_, reject) => {
          rejectModel = reject;
        })
      );
      const { context, sources } = makeAudioContext();
      const onPlaybackEnd = jest.fn();

      render(
        <Live2DCanvas
          audioBuffer={audioBuffer}
          audioContext={context}
          onPlaybackEnd={onPlaybackEnd}
        />
      );
      await flush();
      expect(sources).toHaveLength(0);

      await act(async () => {
        rejectModel(new Error('読み込み失敗'));
      });
      await flush();

      expect(sources).toHaveLength(1);
      act(() => {
        sources[0].onended?.();
      });
      expect(onPlaybackEnd).toHaveBeenCalledTimes(1);
    });

    it('Cubism Core のロードがタイムアウトしても再生され onPlaybackEnd が呼ばれる', async () => {
      delete (window as unknown as { Live2DCubismCore?: unknown }).Live2DCubismCore;
      jest.useFakeTimers();
      const { context, sources } = makeAudioContext();
      const onPlaybackEnd = jest.fn();

      render(
        <Live2DCanvas
          audioBuffer={audioBuffer}
          audioContext={context}
          onPlaybackEnd={onPlaybackEnd}
        />
      );
      await flush();
      expect(sources).toHaveLength(0);

      await act(async () => {
        jest.advanceTimersByTime(11000);
      });
      await flush();

      expect(mockModelFrom).not.toHaveBeenCalled();
      expect(sources).toHaveLength(1);
      act(() => {
        sources[0].onended?.();
      });
      expect(onPlaybackEnd).toHaveBeenCalledTimes(1);
    });

    it('renderer が live2d ではない場合も再生され onPlaybackEnd が呼ばれる', async () => {
      mockGetCharacterRenderProfile.mockReturnValueOnce({
        renderer: 'still',
        imagePath: '/assets/still.png',
      });
      const { context, sources } = makeAudioContext();
      const onPlaybackEnd = jest.fn();

      render(
        <Live2DCanvas
          audioBuffer={audioBuffer}
          audioContext={context}
          onPlaybackEnd={onPlaybackEnd}
        />
      );
      await flush();

      expect(mockModelFrom).not.toHaveBeenCalled();
      expect(sources).toHaveLength(1);
      act(() => {
        sources[0].onended?.();
      });
      expect(onPlaybackEnd).toHaveBeenCalledTimes(1);
    });

    it('再生の開始で例外が出ると onPlaybackError が呼ばれる', async () => {
      mockModelFrom.mockRejectedValue(new Error('404'));
      const { context, sources } = makeAudioContext();
      const startError = new Error('開始失敗');
      (context.createBufferSource as jest.Mock).mockImplementationOnce(() => {
        const source: FakeSource = {
          buffer: null,
          connect: jest.fn(),
          disconnect: jest.fn(),
          start: jest.fn(() => {
            throw startError;
          }),
          stop: jest.fn(),
          onended: null,
        };
        sources.push(source);
        return source;
      });
      const onPlaybackEnd = jest.fn();
      const onPlaybackError = jest.fn();

      render(
        <Live2DCanvas
          audioBuffer={audioBuffer}
          audioContext={context}
          onPlaybackEnd={onPlaybackEnd}
          onPlaybackError={onPlaybackError}
        />
      );
      await flush();

      expect(onPlaybackError).toHaveBeenCalledWith(startError);
      expect(onPlaybackEnd).not.toHaveBeenCalled();
    });

    it('unmount 後は onPlaybackEnd を呼ばず、再生を止める', async () => {
      mockModelFrom.mockRejectedValue(new Error('404'));
      const { context, sources } = makeAudioContext();
      const onPlaybackEnd = jest.fn();

      const { unmount } = render(
        <Live2DCanvas
          audioBuffer={audioBuffer}
          audioContext={context}
          onPlaybackEnd={onPlaybackEnd}
        />
      );
      await flush();
      expect(sources).toHaveLength(1);

      unmount();
      sources[0].onended?.();

      expect(sources[0].stop).toHaveBeenCalled();
      expect(onPlaybackEnd).not.toHaveBeenCalled();
    });
  });

  describe('音声が渡されていない場合', () => {
    it('モデルの読み込みに失敗しても再生しない', async () => {
      mockModelFrom.mockRejectedValue(new Error('404'));
      const { context, sources } = makeAudioContext();

      render(<Live2DCanvas audioBuffer={null} audioContext={context} />);
      await flush();

      expect(sources).toHaveLength(0);
    });
  });
});
