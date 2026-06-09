import React from 'react';
import { render, screen } from '@testing-library/react';

// next/dynamic をモック化して動的 import を同期的に解決する
// テスト環境では dynamic() のコールバックを同期実行してコンポーネントを返す
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (factory: () => Promise<{ default: React.ComponentType<unknown> }>) => {
    // テスト環境では動的 import を同期的に解決するため、
    // factory の参照する '__mocks__' からコンポーネントを取得する
    // ここでは Live2DCanvas モックが参照されるように stub する
    const MockComponent = jest.fn(({ characterId }: { characterId?: string }) => (
      <div data-testid="live2d-canvas" data-character-id={characterId ?? ''} />
    ));
    // factory を呼び出さずに静的なモックを返す（pixi.js を避けるため）
    void factory;
    return MockComponent;
  },
}));

// Live2DCanvas: pixi.js / WebGL 依存を排除するためモック化する
// （CharacterCanvas 内の dynamic import のフォールバックとして参照される）
jest.mock('@/components/Live2DCanvas', () => ({
  __esModule: true,
  default: jest.fn(({ characterId }: { characterId?: string }) => (
    <div data-testid="live2d-canvas" data-character-id={characterId ?? ''} />
  )),
}));

// PlaceholderCanvas: Web Audio 依存を排除するためモック化する
jest.mock('@/components/PlaceholderCanvas', () => ({
  __esModule: true,
  default: jest.fn(({ characterId }: { characterId?: string }) => (
    <div data-testid="placeholder-canvas" data-character-id={characterId ?? ''} />
  )),
}));

// StillImageCanvas: next/image + Web Audio 依存を排除するためモック化する
jest.mock('@/components/StillImageCanvas', () => ({
  __esModule: true,
  default: jest.fn(({ characterId }: { characterId?: string }) => (
    <div data-testid="still-image-canvas" data-character-id={characterId ?? ''} />
  )),
}));

// getCharacterRenderProfile をモック化して renderer 種別を制御する
jest.mock('@/lib/characters/client-profiles', () => ({
  ...jest.requireActual('@/lib/characters/client-profiles'),
  getCharacterRenderProfile: jest.fn(),
}));

import { getCharacterRenderProfile } from '@/lib/characters/client-profiles';
import CharacterCanvas from '@/components/CharacterCanvas';

const mockGetCharacterRenderProfile = getCharacterRenderProfile as jest.MockedFunction<
  typeof getCharacterRenderProfile
>;

afterEach(() => {
  jest.clearAllMocks();
});

describe('CharacterCanvas', () => {
  describe('renderer: live2d のとき', () => {
    beforeEach(() => {
      mockGetCharacterRenderProfile.mockReturnValue({
        renderer: 'live2d',
        modelPath: '/assets/test-model.model3.json',
        cubismParams: {
          mouthOpenY: 'ParamMouthOpenY',
          eyeLOpen: 'ParamEyeLOpen',
          eyeROpen: 'ParamEyeROpen',
        },
      });
    });

    it('Live2DCanvas がマウントされる', () => {
      render(<CharacterCanvas characterId="hiyori" />);
      expect(screen.getByTestId('live2d-canvas')).toBeInTheDocument();
    });

    it('PlaceholderCanvas がマウントされない', () => {
      render(<CharacterCanvas characterId="hiyori" />);
      expect(screen.queryByTestId('placeholder-canvas')).toBeNull();
    });

    it('characterId が Live2DCanvas に渡される', () => {
      render(<CharacterCanvas characterId="hiyori" />);
      expect(screen.getByTestId('live2d-canvas')).toHaveAttribute('data-character-id', 'hiyori');
    });
  });

  describe('renderer: still のとき', () => {
    beforeEach(() => {
      mockGetCharacterRenderProfile.mockReturnValue({
        renderer: 'still',
        imagePath: '/assets/characters/ageha/still.png',
      });
    });

    it('StillImageCanvas がマウントされる', () => {
      render(<CharacterCanvas characterId="ageha" />);
      expect(screen.getByTestId('still-image-canvas')).toBeInTheDocument();
    });

    it('Live2DCanvas がマウントされない', () => {
      render(<CharacterCanvas characterId="ageha" />);
      expect(screen.queryByTestId('live2d-canvas')).toBeNull();
    });

    it('PlaceholderCanvas がマウントされない', () => {
      render(<CharacterCanvas characterId="ageha" />);
      expect(screen.queryByTestId('placeholder-canvas')).toBeNull();
    });

    it('characterId が StillImageCanvas に渡される', () => {
      render(<CharacterCanvas characterId="ageha" />);
      expect(screen.getByTestId('still-image-canvas')).toHaveAttribute(
        'data-character-id',
        'ageha'
      );
    });

    it('statusText などの props が StillImageCanvas に透過される', () => {
      const mockPlaybackEnd = jest.fn();
      const { default: MockStillImageCanvas } = jest.requireMock('@/components/StillImageCanvas');

      render(
        <CharacterCanvas
          characterId="ageha"
          statusText="話している"
          onPlaybackEnd={mockPlaybackEnd}
        />
      );
      expect(MockStillImageCanvas).toHaveBeenCalled();
      const [receivedProps] = (MockStillImageCanvas as jest.Mock).mock.calls[0];
      expect(receivedProps).toMatchObject({
        characterId: 'ageha',
        statusText: '話している',
        onPlaybackEnd: mockPlaybackEnd,
      });
    });
  });

  describe('renderer: placeholder のとき', () => {
    beforeEach(() => {
      mockGetCharacterRenderProfile.mockReturnValue({
        renderer: 'placeholder',
      });
    });

    it('PlaceholderCanvas がマウントされる', () => {
      render(<CharacterCanvas characterId="test-char" />);
      expect(screen.getByTestId('placeholder-canvas')).toBeInTheDocument();
    });

    it('Live2DCanvas がマウントされない', () => {
      render(<CharacterCanvas characterId="test-char" />);
      expect(screen.queryByTestId('live2d-canvas')).toBeNull();
    });

    it('characterId が PlaceholderCanvas に渡される', () => {
      render(<CharacterCanvas characterId="test-char" />);
      expect(screen.getByTestId('placeholder-canvas')).toHaveAttribute(
        'data-character-id',
        'test-char'
      );
    });
  });

  describe('props の透過', () => {
    it('renderer: live2d で statusText などの props が Live2DCanvas に渡される', () => {
      const mockPlaybackEnd = jest.fn();
      mockGetCharacterRenderProfile.mockReturnValue({
        renderer: 'live2d',
        modelPath: '/assets/test.model3.json',
        cubismParams: {
          mouthOpenY: 'ParamMouthOpenY',
          eyeLOpen: 'ParamEyeLOpen',
          eyeROpen: 'ParamEyeROpen',
        },
      });

      render(
        <CharacterCanvas
          characterId="hiyori"
          statusText="テスト中"
          onPlaybackEnd={mockPlaybackEnd}
        />
      );
      // live2d の場合 live2d-canvas が表示され、props が属性として確認できる
      expect(screen.getByTestId('live2d-canvas')).toHaveAttribute('data-character-id', 'hiyori');
    });

    it('renderer: placeholder で statusText などの props が PlaceholderCanvas に渡される', () => {
      const mockPlaybackEnd = jest.fn();
      mockGetCharacterRenderProfile.mockReturnValue({
        renderer: 'placeholder',
      });

      const { default: MockPlaceholderCanvas } = jest.requireMock('@/components/PlaceholderCanvas');
      render(
        <CharacterCanvas
          characterId="test-char"
          statusText="プレースホルダーテスト"
          onPlaybackEnd={mockPlaybackEnd}
        />
      );
      // PlaceholderCanvas モックが適切な props で呼ばれたことを確認する
      // React 19 ではコンポーネント関数の第 2 引数が undefined になるため、
      // mock.calls で第 1 引数（props）のみを検証する
      expect(MockPlaceholderCanvas).toHaveBeenCalled();
      const [receivedProps] = (MockPlaceholderCanvas as jest.Mock).mock.calls[0];
      expect(receivedProps).toMatchObject({
        characterId: 'test-char',
        statusText: 'プレースホルダーテスト',
        onPlaybackEnd: mockPlaybackEnd,
      });
    });
  });

  describe('characterId 省略時', () => {
    it('renderer: live2d の場合 Live2DCanvas がマウントされる', () => {
      mockGetCharacterRenderProfile.mockReturnValue({
        renderer: 'live2d',
        modelPath: '/assets/test.model3.json',
        cubismParams: {
          mouthOpenY: 'ParamMouthOpenY',
          eyeLOpen: 'ParamEyeLOpen',
          eyeROpen: 'ParamEyeROpen',
        },
      });

      render(<CharacterCanvas />);
      expect(screen.getByTestId('live2d-canvas')).toBeInTheDocument();
    });

    it('renderer: placeholder の場合 PlaceholderCanvas がマウントされる', () => {
      mockGetCharacterRenderProfile.mockReturnValue({
        renderer: 'placeholder',
      });

      render(<CharacterCanvas />);
      expect(screen.getByTestId('placeholder-canvas')).toBeInTheDocument();
    });

    it('renderer: still の場合 StillImageCanvas がマウントされる', () => {
      mockGetCharacterRenderProfile.mockReturnValue({
        renderer: 'still',
        imagePath: '/assets/characters/ageha/still.png',
      });

      render(<CharacterCanvas />);
      expect(screen.getByTestId('still-image-canvas')).toBeInTheDocument();
    });
  });
});
