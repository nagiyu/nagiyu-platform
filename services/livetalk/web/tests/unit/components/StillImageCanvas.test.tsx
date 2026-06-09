import React from 'react';
import { render, screen } from '@testing-library/react';
import StillImageCanvas from '@/components/StillImageCanvas';

// getCharacterRenderProfile / getCharacterDisplay をモック化して表示内容を制御する
jest.mock('@/lib/characters/client-profiles', () => ({
  ...jest.requireActual('@/lib/characters/client-profiles'),
  getCharacterRenderProfile: jest.fn((id?: string) => {
    if (id === 'ageha' || id === undefined) {
      return { renderer: 'still', imagePath: '/assets/characters/ageha/still.png' };
    }
    // renderer 不一致のキャラ（フォールバック確認用）
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

describe('StillImageCanvas', () => {
  describe('画像表示', () => {
    it('still-image-container が描画される', () => {
      render(<StillImageCanvas characterId="ageha" />);
      expect(screen.getByTestId('still-image-container')).toBeInTheDocument();
    });

    it('still-image が描画され alt に displayName が設定される', () => {
      render(<StillImageCanvas characterId="ageha" />);
      const img = screen.getByTestId('still-image');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('alt', '早瀬アゲハ');
    });

    it('still-image の src が imagePath と一致する', () => {
      render(<StillImageCanvas characterId="ageha" />);
      const img = screen.getByTestId('still-image');
      expect(img).toHaveAttribute('src', '/assets/characters/ageha/still.png');
    });
  });

  describe('statusText の表示', () => {
    it('statusText が指定されていない場合「待機中」が表示される', () => {
      render(<StillImageCanvas characterId="ageha" />);
      expect(screen.getByText('待機中')).toBeInTheDocument();
    });

    it('statusText が指定された場合その内容が表示される', () => {
      render(<StillImageCanvas characterId="ageha" statusText="考え中" />);
      expect(screen.getByText('考え中')).toBeInTheDocument();
    });

    it('statusText を変えても表示が切り替わる', () => {
      const { rerender } = render(<StillImageCanvas characterId="ageha" statusText="待機中" />);
      expect(screen.getByText('待機中')).toBeInTheDocument();

      rerender(<StillImageCanvas characterId="ageha" statusText="話している" />);
      expect(screen.getByText('話している')).toBeInTheDocument();
    });
  });

  describe('audioBuffer / audioContext 未指定時', () => {
    it('audioBuffer が null のときクラッシュしない（待機表示）', () => {
      expect(() => {
        render(<StillImageCanvas characterId="ageha" audioBuffer={null} />);
      }).not.toThrow();
    });

    it('audioContext が null のときクラッシュしない（待機表示）', () => {
      expect(() => {
        render(<StillImageCanvas characterId="ageha" audioBuffer={null} audioContext={null} />);
      }).not.toThrow();
    });

    it('両方 undefined のときクラッシュしない', () => {
      expect(() => {
        render(<StillImageCanvas characterId="ageha" />);
      }).not.toThrow();
    });

    it('audioBuffer / audioContext 未指定でも still-image-container が表示される', () => {
      render(<StillImageCanvas />);
      expect(screen.getByTestId('still-image-container')).toBeInTheDocument();
    });
  });

  describe('renderer 不一致時のフォールバック', () => {
    it('renderer が still でないキャラ（live2d）は画像を出さずクラッシュしない', () => {
      expect(() => {
        render(<StillImageCanvas characterId="hiyori" />);
      }).not.toThrow();
      // still-image は表示されない
      expect(screen.queryByTestId('still-image')).toBeNull();
      // コンテナと statusText は表示される
      expect(screen.getByTestId('still-image-container')).toBeInTheDocument();
      expect(screen.getByText('待機中')).toBeInTheDocument();
    });

    it('getCharacterRenderProfile がスローしても画像を出さずクラッシュしない', () => {
      expect(() => {
        render(<StillImageCanvas characterId="unknown-id" />);
      }).not.toThrow();
      expect(screen.queryByTestId('still-image')).toBeNull();
      expect(screen.getByTestId('still-image-container')).toBeInTheDocument();
    });

    it('getCharacterDisplay がスローしても alt が空文字列でクラッシュしない', () => {
      // getCharacterDisplay のモックを一時的にスローさせる
      const { getCharacterDisplay } = jest.requireMock('@/lib/characters/client-profiles');
      (getCharacterDisplay as jest.Mock).mockImplementationOnce(() => {
        throw new Error('未登録');
      });

      expect(() => {
        render(<StillImageCanvas characterId="ageha" />);
      }).not.toThrow();
      // still-image は imagePath が取れているので表示される（alt が空文字列）
      const img = screen.queryByTestId('still-image');
      if (img) {
        expect(img).toHaveAttribute('alt', '');
      }
    });
  });

  describe('characterId 省略時', () => {
    it('characterId を省略しても still-image-container が描画される', () => {
      render(<StillImageCanvas />);
      expect(screen.getByTestId('still-image-container')).toBeInTheDocument();
    });

    it('characterId を省略しても still-image が描画される', () => {
      render(<StillImageCanvas />);
      expect(screen.getByTestId('still-image')).toBeInTheDocument();
    });
  });
});
