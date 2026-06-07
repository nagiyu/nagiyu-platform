import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CharacterSelectModal from '@/components/CharacterSelectModal';
import {
  getCharacterDescription,
  getCharacterDisplay,
  getCharacterModel,
  getCharacterVoice,
  getRegisteredProfileIds,
} from '@/lib/characters/client-profiles';

// CharacterContext をモック化する
const mockSetCharacterId = jest.fn();
const mockUseCharacter = jest.fn(() => ({
  characterId: 'hiyori',
  setCharacterId: mockSetCharacterId,
}));

jest.mock('@/lib/characters/CharacterContext', () => ({
  useCharacter: () => mockUseCharacter(),
}));

afterEach(() => {
  jest.clearAllMocks();
});

describe('CharacterSelectModal', () => {
  describe('表示', () => {
    it('open=true のとき登録済みキャラクターの displayName が表示される', () => {
      render(<CharacterSelectModal open={true} onClose={jest.fn()} />);
      const ids = getRegisteredProfileIds();
      for (const id of ids) {
        const displayName = getCharacterDisplay(id).displayName;
        expect(screen.getByText(displayName)).toBeInTheDocument();
      }
    });

    it('open=true のとき登録済みキャラクターの description が表示される', () => {
      render(<CharacterSelectModal open={true} onClose={jest.fn()} />);
      const ids = getRegisteredProfileIds();
      for (const id of ids) {
        const desc = getCharacterDescription(id);
        expect(screen.getByText(desc)).toBeInTheDocument();
      }
    });

    it('open=true のとき各キャラクターのモデル・音声属性が表示される', () => {
      render(<CharacterSelectModal open={true} onClose={jest.fn()} />);
      for (const id of getRegisteredProfileIds()) {
        const model = getCharacterModel(id);
        const voice = getCharacterVoice(id);
        expect(screen.getByText(`モデル：${model.engine}「${model.name}」`)).toBeInTheDocument();
        expect(screen.getByText(`音声：${voice.engine}「${voice.name}」`)).toBeInTheDocument();
      }
    });

    it('open=false のときダイアログが表示されない', () => {
      render(<CharacterSelectModal open={false} onClose={jest.fn()} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('ダイアログタイトルが表示される', () => {
      render(<CharacterSelectModal open={true} onClose={jest.fn()} />);
      expect(screen.getByText('キャラクターを選ぶ')).toBeInTheDocument();
    });
  });

  describe('選択状態の初期値', () => {
    it('現在の characterId（hiyori）がラジオボタンの初期選択になっている', () => {
      render(<CharacterSelectModal open={true} onClose={jest.fn()} />);
      // hiyori の displayName を持つラジオボタンが選択されている
      const displayName = getCharacterDisplay('hiyori').displayName;
      // RadioGroup 内で対応するラジオが checked になっていることを確認
      const radioGroup = screen.getByRole('radiogroup');
      expect(radioGroup).toBeInTheDocument();
      // value=hiyori のラジオが選択されていることを確認
      const radios = screen.getAllByRole('radio');
      const checkedRadio = radios.find((r) => (r as HTMLInputElement).checked);
      expect(checkedRadio).toBeDefined();
      // ラジオの value が hiyori である
      expect((checkedRadio as HTMLInputElement).value).toBe('hiyori');
      expect(displayName).toBe('桃瀬ひより');
    });
  });

  describe('決定ボタン', () => {
    it('決定ボタン押下で setCharacterId が呼ばれる', () => {
      render(<CharacterSelectModal open={true} onClose={jest.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: '決定' }));
      expect(mockSetCharacterId).toHaveBeenCalledTimes(1);
    });

    it('決定ボタン押下で onClose も呼ばれる', () => {
      const onClose = jest.fn();
      render(<CharacterSelectModal open={true} onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: '決定' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('決定ボタン押下で setCharacterId に選択中の characterId が渡される', () => {
      render(<CharacterSelectModal open={true} onClose={jest.fn()} />);
      // 初期値 hiyori のまま決定する
      fireEvent.click(screen.getByRole('button', { name: '決定' }));
      expect(mockSetCharacterId).toHaveBeenCalledWith('hiyori');
    });
  });

  describe('キャンセルボタン', () => {
    it('キャンセルボタン押下で onClose が呼ばれる', () => {
      const onClose = jest.fn();
      render(<CharacterSelectModal open={true} onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('キャンセルボタン押下で setCharacterId は呼ばれない', () => {
      render(<CharacterSelectModal open={true} onClose={jest.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
      expect(mockSetCharacterId).not.toHaveBeenCalled();
    });
  });

  describe('アクセシビリティ', () => {
    it('RadioGroup に aria-label="キャラクター選択" が付いている', () => {
      render(<CharacterSelectModal open={true} onClose={jest.fn()} />);
      const radioGroup = screen.getByRole('radiogroup', { name: 'キャラクター選択' });
      expect(radioGroup).toBeInTheDocument();
    });

    it('ダイアログに aria-labelledby が設定されている', () => {
      render(<CharacterSelectModal open={true} onClose={jest.fn()} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });
  });
});
