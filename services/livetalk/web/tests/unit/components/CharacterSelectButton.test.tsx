import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CharacterSelectButton from '@/components/CharacterSelectButton';

// CharacterContext をモック化する
jest.mock('@/lib/characters/CharacterContext', () => ({
  useCharacter: jest.fn(() => ({
    characterId: 'hiyori',
    setCharacterId: jest.fn(),
  })),
}));

// CharacterSelectModal をモック化して、open 時に識別可能な要素を描画する
jest.mock('@/components/CharacterSelectModal', () => ({
  __esModule: true,
  default: jest.fn(({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div role="dialog" data-testid="character-select-modal">
        <button onClick={onClose}>閉じる</button>
      </div>
    ) : null
  ),
}));

afterEach(() => {
  jest.clearAllMocks();
});

describe('CharacterSelectButton', () => {
  describe('描画', () => {
    it('ボタンが描画される', () => {
      render(<CharacterSelectButton />);
      // キャラ名を含むボタンが存在する
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('ボタンのラベルに現在のキャラクター名（桃瀬ひより）が含まれる', () => {
      render(<CharacterSelectButton />);
      expect(screen.getByRole('button')).toHaveTextContent('桃瀬ひより');
    });

    it('初期状態ではモーダルが表示されない', () => {
      render(<CharacterSelectButton />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('クリックでモーダルが開く', () => {
    it('ボタンをクリックするとモーダルが表示される', () => {
      render(<CharacterSelectButton />);
      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('モーダルを閉じるとダイアログが非表示になる', () => {
      render(<CharacterSelectButton />);
      fireEvent.click(screen.getByRole('button'));
      // モーダル内の「閉じる」ボタンを押す
      fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('disabled', () => {
    it('disabled=true のときボタンが無効になる', () => {
      render(<CharacterSelectButton disabled={true} />);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('disabled=false のときボタンが有効になる', () => {
      render(<CharacterSelectButton disabled={false} />);
      expect(screen.getByRole('button')).not.toBeDisabled();
    });

    it('disabled 省略時はボタンが有効になる', () => {
      render(<CharacterSelectButton />);
      expect(screen.getByRole('button')).not.toBeDisabled();
    });
  });
});
