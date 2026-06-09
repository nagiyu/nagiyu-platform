import React from 'react';
import { render, screen } from '@testing-library/react';
import PlaceholderCanvas from '@/components/PlaceholderCanvas';

// getCharacterDisplay をモック化して表示名取得を制御する
jest.mock('@/lib/characters/client-profiles', () => ({
  ...jest.requireActual('@/lib/characters/client-profiles'),
  getCharacterDisplay: jest.fn((id?: string) => {
    if (id === 'test-char') {
      return { displayName: 'テストキャラ', shortName: 'テスト' };
    }
    // 既定（hiyori）
    return { displayName: '桃瀬ひより', shortName: 'ひより' };
  }),
}));

describe('PlaceholderCanvas', () => {
  describe('アバター円と名前ラベルの描画', () => {
    it('アバター円が描画される', () => {
      render(<PlaceholderCanvas characterId="hiyori" />);
      expect(screen.getByTestId('placeholder-avatar')).toBeInTheDocument();
    });

    it('アバター円の中に shortName（呼び名）が表示される', () => {
      render(<PlaceholderCanvas characterId="hiyori" />);
      expect(screen.getByTestId('placeholder-short-name')).toHaveTextContent('ひより');
    });

    it('displayName が名前ラベルとして表示される', () => {
      render(<PlaceholderCanvas characterId="hiyori" />);
      expect(screen.getByTestId('placeholder-name-label')).toHaveTextContent('桃瀬ひより');
    });

    it('characterId を指定した場合、対応するキャラ名・呼び名が表示される', () => {
      render(<PlaceholderCanvas characterId="test-char" />);
      expect(screen.getByTestId('placeholder-name-label')).toHaveTextContent('テストキャラ');
      expect(screen.getByTestId('placeholder-short-name')).toHaveTextContent('テスト');
    });

    it('口パク要素（placeholder-mouth）が描画されない', () => {
      render(<PlaceholderCanvas characterId="hiyori" />);
      expect(screen.queryByTestId('placeholder-mouth')).toBeNull();
    });

    it('シルエット SVG（placeholder-silhouette）が描画されない', () => {
      render(<PlaceholderCanvas characterId="hiyori" />);
      expect(screen.queryByTestId('placeholder-silhouette')).toBeNull();
    });
  });

  describe('statusText の表示', () => {
    it('statusText が指定されていない場合「待機中」が表示される', () => {
      render(<PlaceholderCanvas characterId="hiyori" />);
      expect(screen.getByText('待機中')).toBeInTheDocument();
    });

    it('statusText が指定された場合その内容が表示される', () => {
      render(<PlaceholderCanvas characterId="hiyori" statusText="考え中" />);
      expect(screen.getByText('考え中')).toBeInTheDocument();
    });

    it('statusText を変えても表示が切り替わる', () => {
      const { rerender } = render(<PlaceholderCanvas characterId="hiyori" statusText="待機中" />);
      expect(screen.getByText('待機中')).toBeInTheDocument();

      rerender(<PlaceholderCanvas characterId="hiyori" statusText="話している" />);
      expect(screen.getByText('話している')).toBeInTheDocument();
    });
  });

  describe('audioBuffer / audioContext 未指定時', () => {
    it('audioBuffer が null のときクラッシュしない（待機表示）', () => {
      expect(() => {
        render(<PlaceholderCanvas characterId="hiyori" audioBuffer={null} />);
      }).not.toThrow();
    });

    it('audioContext が null のときクラッシュしない（待機表示）', () => {
      expect(() => {
        render(<PlaceholderCanvas characterId="hiyori" audioBuffer={null} audioContext={null} />);
      }).not.toThrow();
    });

    it('両方 undefined のときクラッシュしない', () => {
      expect(() => {
        render(<PlaceholderCanvas characterId="hiyori" />);
      }).not.toThrow();
    });

    it('audioBuffer / audioContext 未指定でもアバター円が表示される', () => {
      render(<PlaceholderCanvas />);
      expect(screen.getByTestId('placeholder-avatar')).toBeInTheDocument();
    });
  });

  describe('コンテナ', () => {
    it('コンテナ要素が描画される', () => {
      render(<PlaceholderCanvas characterId="hiyori" />);
      expect(screen.getByTestId('placeholder-canvas-container')).toBeInTheDocument();
    });
  });

  describe('未登録キャラクター ID', () => {
    it('未登録 ID でも表示がクラッシュしない', () => {
      // getCharacterDisplay が存在しない ID でスローしても、
      // PlaceholderCanvas 内でキャッチして空文字列を使う
      expect(() => {
        render(<PlaceholderCanvas characterId="unknown-id" />);
      }).not.toThrow();
    });

    it('名前が取得できない場合は名前ラベルが非表示になる', () => {
      // getCharacterDisplay のモックを一時的に上書きしてスローさせる
      const { getCharacterDisplay } = jest.requireMock('@/lib/characters/client-profiles');
      (getCharacterDisplay as jest.Mock).mockImplementationOnce(() => {
        throw new Error('未登録');
      });

      render(<PlaceholderCanvas characterId="unknown-id" />);
      // displayName が空文字列になるため名前ラベルは非表示
      expect(screen.queryByTestId('placeholder-name-label')).toBeNull();
    });

    it('名前が取得できない場合でもアバター円は表示される', () => {
      const { getCharacterDisplay } = jest.requireMock('@/lib/characters/client-profiles');
      (getCharacterDisplay as jest.Mock).mockImplementationOnce(() => {
        throw new Error('未登録');
      });

      render(<PlaceholderCanvas characterId="unknown-id" />);
      expect(screen.getByTestId('placeholder-avatar')).toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('アバター円に role="img" と aria-label が設定されている', () => {
      render(<PlaceholderCanvas characterId="hiyori" />);
      const avatar = screen.getByRole('img');
      expect(avatar).toHaveAttribute('aria-label', '桃瀬ひよりのプレースホルダー');
    });

    it('displayName が空の場合でも aria-label が存在する', () => {
      const { getCharacterDisplay } = jest.requireMock('@/lib/characters/client-profiles');
      (getCharacterDisplay as jest.Mock).mockImplementationOnce(() => {
        throw new Error('未登録');
      });

      render(<PlaceholderCanvas characterId="unknown-id" />);
      const avatar = screen.getByRole('img');
      // displayName が空のとき aria-label は "のプレースホルダー" になる
      expect(avatar).toHaveAttribute('aria-label');
    });
  });
});
