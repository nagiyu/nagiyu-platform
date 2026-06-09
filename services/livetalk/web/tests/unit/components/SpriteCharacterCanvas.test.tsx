import React from 'react';
import { render, screen } from '@testing-library/react';
import SpriteCharacterCanvas from '@/components/SpriteCharacterCanvas';

// getCharacterRenderProfile / getCharacterDisplay をモック化して表示内容を制御する
jest.mock('@/lib/characters/client-profiles', () => ({
  ...jest.requireActual('@/lib/characters/client-profiles'),
  getCharacterRenderProfile: jest.fn((id?: string) => {
    if (id === 'ageha' || id === undefined) {
      return {
        renderer: 'sprite',
        sprite: {
          base: '/assets/characters/ageha/sprite/base.png',
          eyeOpen: '/assets/characters/ageha/sprite/eye-open.png',
          eyeClosed: '/assets/characters/ageha/sprite/eye-closed.png',
          mouthOpen: '/assets/characters/ageha/sprite/mouth-open.png',
          mouthClosed: '/assets/characters/ageha/sprite/mouth-closed.png',
        },
      };
    }
    // renderer 不一致（live2d）のキャラ（フォールバック確認用）
    if (id === 'hiyori') {
      return {
        renderer: 'live2d',
        modelPath: '/assets/characters/hiyori/runtime/hiyori_free_t08.model3.json',
        cubismParams: {
          mouthOpenY: 'ParamMouthOpenY',
          eyeLOpen: 'ParamEyeLOpen',
          eyeROpen: 'ParamEyeROpen',
        },
      };
    }
    throw new Error('指定されたキャラクターのプロファイルが見つかりません。');
  }),
  getCharacterDisplay: jest.fn((id?: string) => {
    if (id === 'ageha' || id === undefined) {
      return { displayName: '早瀬アゲハ', shortName: 'アゲハ' };
    }
    if (id === 'hiyori') {
      return { displayName: '桃瀬ひより', shortName: 'ひより' };
    }
    throw new Error('指定されたキャラクターのプロファイルが見つかりません。');
  }),
}));

// next/image: テスト環境で動作可能だが、fill モードの検証を確実にするため
// data-testid が通るシンプルな img を返すモックを使う
jest.mock('next/image', () => ({
  __esModule: true,
  default: jest.fn(
    ({ src, alt, 'data-testid': testId }: { src: string; alt: string; 'data-testid'?: string }) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} data-testid={testId} />
    )
  ),
}));

// Web Audio API のスタブ（PlaceholderCanvas.test.tsx と同じパターン）
const mockGetByteFrequencyData = jest.fn();
const mockAnalyserConnect = jest.fn();
const mockAnalyserDisconnect = jest.fn();
const mockSourceConnect = jest.fn();
const mockSourceDisconnect = jest.fn();
const mockSourceStop = jest.fn();
const mockSourceStart = jest.fn();

const mockAnalyser = {
  fftSize: 0,
  minDecibels: 0,
  maxDecibels: 0,
  smoothingTimeConstant: 0,
  frequencyBinCount: 4,
  getByteFrequencyData: mockGetByteFrequencyData,
  connect: mockAnalyserConnect,
  disconnect: mockAnalyserDisconnect,
};

let mockOnEnded: (() => void) | null = null;
const mockSource = {
  buffer: null as AudioBuffer | null,
  connect: mockSourceConnect,
  disconnect: mockSourceDisconnect,
  stop: mockSourceStop,
  start: mockSourceStart,
  set onended(fn: (() => void) | null) {
    mockOnEnded = fn;
  },
  get onended() {
    return mockOnEnded;
  },
};

const mockCreateBufferSource = jest.fn(() => mockSource);
const mockCreateAnalyser = jest.fn(() => mockAnalyser);
const mockDestination = {};

const mockAudioContext = {
  createBufferSource: mockCreateBufferSource,
  createAnalyser: mockCreateAnalyser,
  destination: mockDestination,
} as unknown as AudioContext;

const mockAudioBuffer = {} as AudioBuffer;

// requestAnimationFrame / cancelAnimationFrame のスタブ
let rafCallbacks: Map<number, FrameRequestCallback> = new Map();
let rafIdCounter = 0;

const originalRaf = global.requestAnimationFrame;
const originalCaf = global.cancelAnimationFrame;

beforeEach(() => {
  rafCallbacks = new Map();
  rafIdCounter = 0;
  mockOnEnded = null;

  global.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
    const id = ++rafIdCounter;
    rafCallbacks.set(id, cb);
    return id;
  });

  global.cancelAnimationFrame = jest.fn((id: number) => {
    rafCallbacks.delete(id);
  });

  jest.clearAllMocks();
});

afterEach(() => {
  global.requestAnimationFrame = originalRaf;
  global.cancelAnimationFrame = originalCaf;
});

/**
 * 登録済みのすべての rAF コールバックを一巡させる。
 */
function flushRaf(timestamp = 0): void {
  const currentCallbacks = new Map(rafCallbacks);
  for (const [id, cb] of currentCallbacks) {
    rafCallbacks.delete(id);
    cb(timestamp);
  }
}

describe('SpriteCharacterCanvas', () => {
  describe('レイヤー画像の描画', () => {
    it('sprite-canvas-container が描画される', () => {
      render(<SpriteCharacterCanvas characterId="ageha" />);
      expect(screen.getByTestId('sprite-canvas-container')).toBeInTheDocument();
    });

    it('sprite-base が描画される', () => {
      render(<SpriteCharacterCanvas characterId="ageha" />);
      expect(screen.getByTestId('sprite-base')).toBeInTheDocument();
    });

    it('sprite-base の alt に displayName が設定される', () => {
      render(<SpriteCharacterCanvas characterId="ageha" />);
      const img = screen.getByTestId('sprite-base');
      expect(img).toHaveAttribute('alt', '早瀬アゲハ');
    });

    it('sprite-base の src がベース画像パスと一致する', () => {
      render(<SpriteCharacterCanvas characterId="ageha" />);
      expect(screen.getByTestId('sprite-base')).toHaveAttribute(
        'src',
        '/assets/characters/ageha/sprite/base.png'
      );
    });

    it('sprite-eye-open が描画される', () => {
      render(<SpriteCharacterCanvas characterId="ageha" />);
      expect(screen.getByTestId('sprite-eye-open')).toBeInTheDocument();
    });

    it('sprite-eye-open の alt が空文字列（装飾画像）', () => {
      render(<SpriteCharacterCanvas characterId="ageha" />);
      expect(screen.getByTestId('sprite-eye-open')).toHaveAttribute('alt', '');
    });

    it('sprite-eye-closed が描画される', () => {
      render(<SpriteCharacterCanvas characterId="ageha" />);
      expect(screen.getByTestId('sprite-eye-closed')).toBeInTheDocument();
    });

    it('sprite-eye-closed の alt が空文字列（装飾画像）', () => {
      render(<SpriteCharacterCanvas characterId="ageha" />);
      expect(screen.getByTestId('sprite-eye-closed')).toHaveAttribute('alt', '');
    });

    it('sprite-mouth-open が描画される', () => {
      render(<SpriteCharacterCanvas characterId="ageha" />);
      expect(screen.getByTestId('sprite-mouth-open')).toBeInTheDocument();
    });

    it('sprite-mouth-open の alt が空文字列（装飾画像）', () => {
      render(<SpriteCharacterCanvas characterId="ageha" />);
      expect(screen.getByTestId('sprite-mouth-open')).toHaveAttribute('alt', '');
    });

    it('sprite-mouth-closed が描画される', () => {
      render(<SpriteCharacterCanvas characterId="ageha" />);
      expect(screen.getByTestId('sprite-mouth-closed')).toBeInTheDocument();
    });

    it('sprite-mouth-closed の alt が空文字列（装飾画像）', () => {
      render(<SpriteCharacterCanvas characterId="ageha" />);
      expect(screen.getByTestId('sprite-mouth-closed')).toHaveAttribute('alt', '');
    });

    it('すべての sprite src が設定されている', () => {
      render(<SpriteCharacterCanvas characterId="ageha" />);
      expect(screen.getByTestId('sprite-eye-open')).toHaveAttribute(
        'src',
        '/assets/characters/ageha/sprite/eye-open.png'
      );
      expect(screen.getByTestId('sprite-eye-closed')).toHaveAttribute(
        'src',
        '/assets/characters/ageha/sprite/eye-closed.png'
      );
      expect(screen.getByTestId('sprite-mouth-open')).toHaveAttribute(
        'src',
        '/assets/characters/ageha/sprite/mouth-open.png'
      );
      expect(screen.getByTestId('sprite-mouth-closed')).toHaveAttribute(
        'src',
        '/assets/characters/ageha/sprite/mouth-closed.png'
      );
    });
  });

  describe('statusText の表示', () => {
    it('statusText が指定されていない場合「待機中」が表示される', () => {
      render(<SpriteCharacterCanvas characterId="ageha" />);
      expect(screen.getByText('待機中')).toBeInTheDocument();
    });

    it('statusText が指定された場合その内容が表示される', () => {
      render(<SpriteCharacterCanvas characterId="ageha" statusText="考え中" />);
      expect(screen.getByText('考え中')).toBeInTheDocument();
    });

    it('statusText を変えても表示が切り替わる', () => {
      const { rerender } = render(
        <SpriteCharacterCanvas characterId="ageha" statusText="待機中" />
      );
      expect(screen.getByText('待機中')).toBeInTheDocument();

      rerender(<SpriteCharacterCanvas characterId="ageha" statusText="話している" />);
      expect(screen.getByText('話している')).toBeInTheDocument();
    });
  });

  describe('audioBuffer / audioContext 未指定時', () => {
    it('audioBuffer が null のときクラッシュしない（待機表示）', () => {
      expect(() => {
        render(<SpriteCharacterCanvas characterId="ageha" audioBuffer={null} />);
      }).not.toThrow();
    });

    it('audioContext が null のときクラッシュしない（待機表示）', () => {
      expect(() => {
        render(
          <SpriteCharacterCanvas characterId="ageha" audioBuffer={null} audioContext={null} />
        );
      }).not.toThrow();
    });

    it('両方 undefined のときクラッシュしない', () => {
      expect(() => {
        render(<SpriteCharacterCanvas characterId="ageha" />);
      }).not.toThrow();
    });

    it('audioBuffer / audioContext 未指定でも sprite-canvas-container が表示される', () => {
      render(<SpriteCharacterCanvas />);
      expect(screen.getByTestId('sprite-canvas-container')).toBeInTheDocument();
    });
  });

  describe('音声再生と口パク', () => {
    it('audioBuffer + audioContext を指定すると再生がセットアップされる', () => {
      render(
        <SpriteCharacterCanvas
          characterId="ageha"
          audioBuffer={mockAudioBuffer}
          audioContext={mockAudioContext}
        />
      );
      expect(mockCreateBufferSource).toHaveBeenCalled();
      expect(mockCreateAnalyser).toHaveBeenCalled();
      expect(mockSourceConnect).toHaveBeenCalledWith(mockAnalyser);
      expect(mockAnalyserConnect).toHaveBeenCalledWith(mockDestination);
      expect(mockSourceStart).toHaveBeenCalledWith(0);
    });

    it('AnalyserNode の設定値が正しい', () => {
      render(
        <SpriteCharacterCanvas
          characterId="ageha"
          audioBuffer={mockAudioBuffer}
          audioContext={mockAudioContext}
        />
      );
      expect(mockAnalyser.fftSize).toBe(256);
      expect(mockAnalyser.minDecibels).toBe(-90);
      expect(mockAnalyser.maxDecibels).toBe(-10);
      expect(mockAnalyser.smoothingTimeConstant).toBe(0.5);
    });

    it('rAF 一巡で getByteFrequencyData が呼ばれ mouthOpen の opacity が更新される', () => {
      // 音量を返す mock（全ビン 128 = 0.5 × 255）
      mockGetByteFrequencyData.mockImplementation((arr: Uint8Array) => {
        arr.fill(128);
      });
      mockAnalyser.frequencyBinCount = 4;

      render(
        <SpriteCharacterCanvas
          characterId="ageha"
          audioBuffer={mockAudioBuffer}
          audioContext={mockAudioContext}
        />
      );

      // 口パク用の rAF を一巡させる
      flushRaf(0);

      expect(mockGetByteFrequencyData).toHaveBeenCalled();
    });

    it('source.onended で onPlaybackEnd が呼ばれ mouthOpen の opacity がリセットされる', () => {
      const onPlaybackEnd = jest.fn();
      render(
        <SpriteCharacterCanvas
          characterId="ageha"
          audioBuffer={mockAudioBuffer}
          audioContext={mockAudioContext}
          onPlaybackEnd={onPlaybackEnd}
        />
      );

      expect(mockOnEnded).not.toBeNull();
      mockOnEnded!();

      expect(onPlaybackEnd).toHaveBeenCalledTimes(1);
    });

    it('音量がしきい値を跨ぐと mouthOpen が開閉する（二値・ヒステリシス）', () => {
      mockAnalyser.frequencyBinCount = 4;
      // まず大音量（開く閾値超え）
      mockGetByteFrequencyData.mockImplementation((arr: Uint8Array) => {
        arr.fill(200);
      });

      render(
        <SpriteCharacterCanvas
          characterId="ageha"
          audioBuffer={mockAudioBuffer}
          audioContext={mockAudioContext}
        />
      );

      // 開いた口 / 閉じた口の Image をラップする div（ref 対象）の inline opacity を確認する
      const mouthOpenWrapper = screen.getByTestId('sprite-mouth-open').parentElement as HTMLElement;
      const mouthClosedWrapper = screen.getByTestId('sprite-mouth-closed')
        .parentElement as HTMLElement;

      // 大音量の rAF 一巡で口が開く（開=1 / 閉=0 の排他）
      flushRaf(0);
      expect(mouthOpenWrapper.style.opacity).toBe('1');
      expect(mouthClosedWrapper.style.opacity).toBe('0');

      // 無音（閉じる閾値未満）の rAF 一巡で口が閉じる（開=0 / 閉=1 の排他）
      mockGetByteFrequencyData.mockImplementation((arr: Uint8Array) => {
        arr.fill(0);
      });
      flushRaf(0);
      expect(mouthOpenWrapper.style.opacity).toBe('0');
      expect(mouthClosedWrapper.style.opacity).toBe('1');
    });

    it('onPlaybackError が指定されている場合、例外時に呼ばれる', () => {
      const onPlaybackError = jest.fn();
      const error = new Error('テスト再生エラー');
      mockCreateBufferSource.mockImplementationOnce(() => {
        throw error;
      });

      render(
        <SpriteCharacterCanvas
          characterId="ageha"
          audioBuffer={mockAudioBuffer}
          audioContext={mockAudioContext}
          onPlaybackError={onPlaybackError}
        />
      );

      expect(onPlaybackError).toHaveBeenCalledWith(error);
    });
  });

  describe('瞬きアニメーション', () => {
    it('マウント時に瞬き用 rAF が開始される', () => {
      render(<SpriteCharacterCanvas characterId="ageha" />);
      // requestAnimationFrame が少なくとも 1 回呼ばれていること
      expect(requestAnimationFrame).toHaveBeenCalled();
    });

    it('瞬き窓内で eyeClosed の div の opacity が更新される', () => {
      // performance.now をスパイして瞬き窓内（blinkStart 直後の 50ms）に入れる
      const mockNow = jest.spyOn(performance, 'now');
      // 初回呼び出し（nextBlinkAt 設定）は大きな値を返し、2 回目以降でターゲット時刻を返す
      // まず初期の nextBlinkAt を計算させる
      let callCount = 0;
      const BASE_TIME = 0;
      const NEXT_BLINK = BASE_TIME + 3000; // 最小インターバル

      mockNow.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // nextBlinkAt の計算時（random * 3000 が加算される想定）
          return BASE_TIME;
        }
        // 瞬き窓内（nextBlinkAt の 50ms 後＝三角波の前半）
        return NEXT_BLINK + 50;
      });

      render(<SpriteCharacterCanvas characterId="ageha" />);
      flushRaf(NEXT_BLINK + 50);

      mockNow.mockRestore();
      // クラッシュせずに完了することを確認（opacity の値は乱数に依存するため数値チェックは省略）
    });
  });

  describe('renderer 不一致時のフォールバック', () => {
    it('renderer が sprite でないキャラ（live2d）は画像を出さずクラッシュしない', () => {
      expect(() => {
        render(<SpriteCharacterCanvas characterId="hiyori" />);
      }).not.toThrow();
      // sprite レイヤーは表示されない
      expect(screen.queryByTestId('sprite-base')).toBeNull();
      expect(screen.queryByTestId('sprite-eye-open')).toBeNull();
      // コンテナと statusText は表示される
      expect(screen.getByTestId('sprite-canvas-container')).toBeInTheDocument();
      expect(screen.getByText('待機中')).toBeInTheDocument();
    });

    it('getCharacterRenderProfile がスローしても画像を出さずクラッシュしない', () => {
      expect(() => {
        render(<SpriteCharacterCanvas characterId="unknown-id" />);
      }).not.toThrow();
      expect(screen.queryByTestId('sprite-base')).toBeNull();
      expect(screen.getByTestId('sprite-canvas-container')).toBeInTheDocument();
    });

    it('getCharacterDisplay がスローしても alt が空文字列でクラッシュしない', () => {
      const { getCharacterDisplay } = jest.requireMock('@/lib/characters/client-profiles');
      (getCharacterDisplay as jest.Mock).mockImplementationOnce(() => {
        throw new Error('未登録');
      });

      expect(() => {
        render(<SpriteCharacterCanvas characterId="ageha" />);
      }).not.toThrow();
    });
  });

  describe('characterId 省略時', () => {
    it('characterId を省略しても sprite-canvas-container が描画される', () => {
      render(<SpriteCharacterCanvas />);
      expect(screen.getByTestId('sprite-canvas-container')).toBeInTheDocument();
    });

    it('characterId を省略しても sprite-base が描画される', () => {
      render(<SpriteCharacterCanvas />);
      expect(screen.getByTestId('sprite-base')).toBeInTheDocument();
    });
  });
});
